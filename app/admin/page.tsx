import Link from 'next/link'

type Props = { searchParams: Promise<{ success?: string }> }

export default async function AdminDashboard({ searchParams }: Props) {
  const params = await searchParams

  return (
    <main className="p-8">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-serif text-stone-800 mb-1">Dashboard</h1>
        <p className="text-sm text-stone-500 mb-8">Content management</p>

        {params.success === 'author' && (
          <p className="mb-6 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Author added successfully.
          </p>
        )}
        {params.success === 'text' && (
          <p className="mb-6 text-sm text-green-700 bg-green-50 border border-green-200 rounded px-3 py-2">
            Text added successfully.
          </p>
        )}

        <div className="space-y-3">
          <Link
            href="/admin/authors/new"
            className="block px-4 py-3 bg-white border border-stone-200 rounded hover:border-stone-400 text-stone-700 transition-colors"
          >
            + Add new author
          </Link>
          <Link
            href="/admin/texts/new"
            className="block px-4 py-3 bg-white border border-stone-200 rounded hover:border-stone-400 text-stone-700 transition-colors"
          >
            + Add new text
          </Link>
        </div>
      </div>
    </main>
  )
}
