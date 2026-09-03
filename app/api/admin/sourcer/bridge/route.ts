import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import { buildBridgeCommand, type BridgeInput } from '@/lib/sourcer/runner'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Streams scripts/sourcer/stage-to-output.mjs's stdout/stderr back to the
// client as plain text, then appends a staged queue entry (--write-queue).
// Local-only: refuses to run in production, same as /api/admin/pipeline/run —
// we never ship a shell-exec endpoint to the live site.
export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'The bridge script runner is disabled in production. Run this locally with `npm run dev`.' },
      { status: 403 }
    )
  }

  const body = (await request.json()) as Partial<BridgeInput>

  let command
  try {
    command = buildBridgeCommand(body as BridgeInput)
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
