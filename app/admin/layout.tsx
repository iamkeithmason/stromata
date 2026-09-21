import Link from 'next/link'
import LogoutButton from './LogoutButton'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-stone-50">
      <header className="bg-stone-800 text-white px-4 sm:px-8 py-3 flex justify-between items-center">
        <Link href="/admin" className="text-sm font-medium hover:text-stone-300 transition-colors">
          Stromata Admin
        </Link>
        <LogoutButton />
      </header>
      <div className="max-w-3xl mx-auto px-4 sm:px-8 py-6 sm:py-8">{children}</div>
    </div>
  )
}
