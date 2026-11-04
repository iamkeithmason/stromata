import type { EraPlate } from '@/lib/eras/plates'

/**
 * The era page's header: the era's plate as a full-bleed band, with the era's
 * name and dates set over its foot, and the plate's credit beneath.
 *
 * Phone first: a 16:9 band (about 220px tall at 390px), so the image reads as a
 * picture rather than a sliver; from sm it widens to 3:1, capped in height so
 * the texts below still arrive early. The plate is cropped with object-fit:
 * cover, holding `focusY` in view (set per era in lib/eras/plates.ts, or in the
 * admin era form). A plain <img>, not next/image: the defaults are pre-sized
 * 2000px JPEGs and image optimisation is metered on the Hobby plan.
 */
export function EraPlateHeader({
  plate,
  title,
  years,
}: {
  plate: EraPlate
  title: string
  years: string | null
}) {
  return (
    <header className="mb-10">
      <div
        className="relative w-full overflow-hidden aspect-[16/9] sm:aspect-[3/1] sm:max-h-[420px]"
        style={{ background: 'var(--hero-ground)' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={plate.src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          style={{ objectPosition: `50% ${plate.focusY}%` }}
          loading="eager"
          decoding="async"
        />
        <div aria-hidden className="absolute inset-0" style={{ background: 'var(--plate-scrim)' }} />
        <div className="content-shell absolute inset-x-0 bottom-0 pb-5 sm:pb-8">
          <h1
            className="font-serif text-3xl sm:text-5xl"
            style={{ color: 'var(--on-dark)', lineHeight: 1.1 }}
          >
            {title}
          </h1>
          {years && (
            <p className="mt-1 font-serif" style={{ color: 'var(--on-dark-soft)', fontSize: 'var(--text-base)' }}>
              {years}
            </p>
          )}
        </div>
      </div>
      {plate.credit && (
        <p className="content-shell caption mt-2" style={{ color: 'var(--ink-faint)' }}>
          {plate.credit}
        </p>
      )}
    </header>
  )
}
