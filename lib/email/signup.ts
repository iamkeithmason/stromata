/**
 * The newsletter signup's one piece of configuration: the public action URL of
 * the Kit form (Kit → Grow → Landing Pages & Forms → the form → Embed → HTML,
 * the `action` of the <form>). It is not a secret; every signup form on the web
 * carries it in its HTML.
 *
 * While it is null the signup renders nothing, so the component can ship before
 * the Kit account exists. Set it, and the form appears on every text page.
 *
 * The form posts straight to Kit, never through a Stromata /api route: a public
 * page calling /api is billed on every view (CLAUDE.md, "Keep public routes
 * cacheable"). Kit runs double opt-in, so nobody is added until they confirm.
 */
export const KIT_FORM_ACTION: string | null = null

/** Kit's field name for the address in its HTML embed. */
export const KIT_EMAIL_FIELD = 'email_address'

/** Accepts only an https URL on Kit's own hosts, so a typo can't post readers' addresses elsewhere. */
export function signupAction(action: string | null = KIT_FORM_ACTION): string | null {
  if (!action) return null
  try {
    const url = new URL(action)
    if (url.protocol !== 'https:') return null
    const host = url.hostname
    const kit = ['kit.com', 'convertkit.com', 'kit-mail.com']
    return kit.some(k => host === k || host.endsWith(`.${k}`)) ? url.toString() : null
  } catch {
    return null
  }
}
