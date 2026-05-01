'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Author = { id: string; name: string }

export default function AssignAuthorToLocation({
  locationId,
  unassignedAuthors,
}: {
  locationId: number
  unassignedAuthors: Author[]
}) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(false)

  if (unassignedAuthors.length === 0) return null

  async function handleAssign() {
    if (!selectedId) return
    setLoading(true)
    await fetch(`/api/admin/authors/${selectedId}/assign-location`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ location_id: locationId }),
    })
    setSelectedId('')
    setLoading(false)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-2 mt-2 pl-4">
      <select
        value={selectedId}
        onChange={e => setSelectedId(e.target.value)}
        className="text-xs border border-stone-200 rounded px-2 py-1 text-stone-600 bg-white"
      >
        <option value="">— assign author —</option>
        {unassignedAuthors.map(a => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
      <button
        onClick={handleAssign}
        disabled={!selectedId || loading}
        className="text-xs px-2 py-1 bg-stone-800 text-white rounded disabled:opacity-40"
      >
        {loading ? 'Saving…' : 'Assign'}
      </button>
    </div>
  )
}
