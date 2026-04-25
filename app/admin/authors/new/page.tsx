import Link from 'next/link'
import NewAuthorForm from './NewAuthorForm'

export default function NewAuthorPage() {
  return (
    <main>
      <div>
        <div className="mb-8">
          <Link href="/admin" className="text-sm text-stone-500 hover:text-stone-700">
            ← Back to dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-serif text-stone-800 mb-8">Add new author</h1>
        <NewAuthorForm />
      </div>
    </main>
  )
}
