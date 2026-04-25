import Link from 'next/link'
import NewTextForm from './NewTextForm'

export default function NewTextPage() {
  return (
    <main>
      <div>
        <div className="mb-8">
          <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700">
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-serif text-stone-800 mb-8">Add new text</h1>
        <NewTextForm />
      </div>
    </main>
  )
}
