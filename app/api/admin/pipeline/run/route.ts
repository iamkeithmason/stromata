import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { readQueue } from '@/lib/pipeline/queue'
import { buildCommand, type RunAction } from '@/lib/pipeline/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTIONS: RunAction[] = ['fetch', 'extract', 'import']

// Streams a whitelisted pipeline script's stdout/stderr back to the client as
// plain text. Local-only: refuses to run in production so we never ship a
// shell-exec endpoint to the live site.
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Pipeline script runners are disabled in production. Run this locally with `npm run dev`.' },
      { status: 403 }
    )
  }

  const body = (await request.json()) as { action?: string; prospectId?: string }
  const action = body.action as RunAction
  if (!ACTIONS.includes(action)) {
    return NextResponse.json({ error: `Unknown action "${body.action}".` }, { status: 400 })
  }

  // `import` runs over the whole queue and needs no prospect. The others do.
  let command
  try {
    if (action === 'import') {
      command = await buildCommand('import', { id: '', status: '' })
    } else {
      if (!body.prospectId) return NextResponse.json({ error: 'prospectId required' }, { status: 400 })
      const queue = await readQueue()
      const prospect = queue.prospects.find(p => p.id === body.prospectId)
      if (!prospect) return NextResponse.json({ error: `No prospect "${body.prospectId}"` }, { status: 404 })
      command = await buildCommand(action, prospect)
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not build command' }, { status: 400 })
  }

  const { cmd, args, cwd } = command
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(`$ ${cmd} ${args.map(a => (a.includes(' ') ? `"${a}"` : a)).join(' ')}\n\n`))

      const child = spawn(cmd, args, { cwd })
      const push = (chunk: Buffer) => {
        try {
          controller.enqueue(encoder.encode(chunk.toString()))
        } catch {
          /* stream already closed */
        }
      }
      child.stdout.on('data', push)
      child.stderr.on('data', push)
      child.on('error', err => {
        controller.enqueue(encoder.encode(`\n[spawn error] ${err.message}\n`))
        controller.close()
      })
      child.on('close', code => {
        controller.enqueue(encoder.encode(`\n[process exited with code ${code}]\n`))
        controller.close()
      })

      // Abort the child if the client disconnects.
      request.signal.addEventListener('abort', () => {
        child.kill()
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
