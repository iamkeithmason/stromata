import type { Metadata } from 'next'
import { SiteHeader } from '@/app/components/SiteHeader'
import { TreatmentExplorer } from './TreatmentExplorer'

export const metadata: Metadata = {
  title: 'Celestial hero study — The Stromata',
  robots: { index: false, follow: false },
}

export default function CelestialHeroStudy() {
  return (
    <div className="page-vellum min-h-screen" style={{ paddingTop: '4rem' }}>
      <SiteHeader breadcrumb="Celestial hero study" />

      <main id="main-content">
        <TreatmentExplorer />
      </main>
    </div>
  )
}
