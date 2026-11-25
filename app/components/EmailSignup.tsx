import { KIT_EMAIL_FIELD, signupAction } from '@/lib/email/signup'

/**
 * "New texts by email": one field, posted straight to Kit (double opt-in), so a
 * reader who finished a text has a route back. Renders nothing until
 * KIT_FORM_ACTION is set in lib/email/signup.ts.
 *
 * A plain HTML form with no client JavaScript, so the text page stays fully
 * cacheable. It opens Kit's confirmation in a new tab, which keeps the reader's
 * place and lets the Umami click beacon leave before any navigation.
 *
 * `email-signup` fires on the button click with `from` naming the surface. It
 * counts attempts; Kit holds the true number of confirmed subscribers.
 */
export function EmailSignup({ from }: { from: string }) {
  const action = signupAction()
  if (!action) return null
  return (
    <section aria-labelledby="email-signup-heading" className="mb-12 pt-6 border-t print:hidden" style={{ borderColor: 'var(--rule)' }}>
      <p id="email-signup-heading" className="kicker-gold" style={{ marginBottom: '0.75rem' }}>New texts by email</p>
      <p className="font-serif" style={{ color: 'var(--ink-soft)', lineHeight: 1.55 }}>
        An occasional email when new texts join the library, now and then with a letter from the editor.
      </p>
      <form action={action} method="post" target="_blank" className="mt-4 flex flex-col sm:flex-row gap-3">
        <label htmlFor="email-signup-address" className="sr-only">Email address</label>
        <input
          id="email-signup-address"
          type="email"
          name={KIT_EMAIL_FIELD}
          required
          autoComplete="email"
          placeholder="Your email address"
          className="font-serif flex-1 min-w-0 px-4 border"
          style={{ minHeight: '44px', borderColor: 'var(--rule)', background: 'var(--paper)', color: 'var(--ink)', fontSize: '1rem' }}
        />
        <button
          type="submit"
          className="font-serif px-5 hover:opacity-80 transition-opacity"
          style={{ minHeight: '44px', background: 'var(--ink)', color: 'var(--paper)' }}
          data-umami-event="email-signup"
          data-umami-event-from={from}
        >
          Sign up
        </button>
      </form>
      <p className="mt-3" style={{ color: 'var(--ink-faint)', fontSize: 'var(--text-sm)' }}>
        You&rsquo;ll get one email to confirm. Unsubscribe from any email. <a href="/about#email" className="underline underline-offset-2">How your address is used</a>.
      </p>
    </section>
  )
}
