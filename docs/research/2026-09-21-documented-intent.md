# Documented intent is not enforced state

*The Stromata · 21 September 2026 · from the Supabase security remediation ([#101](https://github.com/iamkeithmason/stromata/pull/101))*

## In one line

A migration file, a code comment and a config template all describe what someone
**meant** to be true; only the live system says what **is** true — and when a
system looks safe, the next question is whether anyone actually chose the thing
making it safe.

## Where it came from

Remediating eleven INFO and two WARN findings from Supabase's security advisor.
The WARNs were a one-line revoke. The work turned out to be in what the INFOs
implied — and in two things nobody had asked about, both found by querying the
database instead of reading the repo.

## What we did

- Revoked `EXECUTE` on a `SECURITY DEFINER` event-trigger function, then
  **proved the event trigger still fires** by creating a scratch table and
  reading back `pg_class.relrowsecurity`.
- Added published-only RLS `SELECT` policies to eleven tables and moved 24
  public routes from the service-role key to the anon key.
- Compared `md5` fingerprints of the ordered id set for every public surface,
  read as `anon` under RLS versus service-role with the app's own filters.
- Found, and fixed, that `anon` had held `INSERT`/`UPDATE`/`DELETE` on every
  table since the project began.

## What worked

**1. Reading the code decided a policy that guessing would have got wrong.**
The brief offered two shapes for the `authors` policy: readable if the author has
a published text, or all authors. It is neither. `app/authors/page.tsx` lists
non-draft authors *regardless of text count*, while `app/authors/[slug]/page.tsx`
404s a draft author *only* when it has no published texts. The policy that
preserves behaviour is `draft = false OR has a published text`. Either offered
shape would have silently changed the site — the tidier one by dropping every
non-draft author whose texts aren't published yet.

**2. A fingerprint diff is a cheap equivalence proof.** `md5` over the ordered id
set, per table, read once under each role. Twelve surfaces, identical, in two
queries — far stronger than eyeballing rendered pages, and it names exactly
which table diverged when one does.

**3. Building with a deliberately broken key proved a negative.** The production
build ran with the **real anon key and a placeholder service-role key**. Every
public route prerendered. That is not "the pages still work" — it is proof that
no public path *can* still be reaching for service-role, because a path that did
would have failed on a garbage key. Removing a capability is a better test than
asserting it is unused.

## What didn't, and why

**1. A migration said `anon` had no access. `anon` had full write access.**
`010_grants.sql` documents, in a careful comment, that `anon` is granted nothing
on `texts`, `text_themes` and `collections`, *"so an anon SELECT grant would
expose drafts"*. The live ACLs said `anon=arwdDxtm` on every table — SELECT
**and** INSERT/UPDATE/DELETE/TRUNCATE. Supabase ships
`ALTER DEFAULT PRIVILEGES … GRANT ALL ON TABLES TO anon`, and the migration only
ever **added** grants; it never issued a `REVOKE`, so the defaults stood
untouched. The comment described the author's intent perfectly and the system's
state not at all, and had read as true for months.

The same session found `.env.example` asserting in three places that "RLS blocks
the anon key from reading authors/texts" — true when written, and describing a
constraint this very PR was removing.

**2. The thing keeping the site safe was an accident.** Those write grants were
harmless *only* because RLS was enabled with no policies — deny-all. Nobody had
chosen deny-all as the control; it was the residue of enabling RLS and stopping.
The advisor even reports it as INFO, i.e. "fine". But the work then in flight was
to **add policies** — which is exactly the act that retires the accidental guard
and turns a latent hole into a live one. Safety that rests on something nobody
selected will be removed by someone who doesn't know they are holding it.

**3. Two of my own checks passed while testing nothing.** To prove the
`server-only` guard, I put a client component importing the service-role module
into `app/__guard-probe/`. The build passed. The App Router treats
`_`-prefixed directories as **private**, so the route never compiled — the probe
had never run. Renamed, it failed correctly. Hours later, polling a CI job with
`grep -q '"status": *"completed"'` returned true against a nested *step* while
the job itself was still `in_progress`.

Both are instances of the rule the previous write-up landed on
([invisible failures](./2026-09-21-invisible-failures.md), rule 7) — a check you
have never seen fail is not yet a check. Two independent instances inside one
session says that rule is not yet reflex.

**4. A differential check across two queries is a race.** Re-running the
fingerprint comparison after merging `main`, the baseline read 260 texts and the
anon read 261. Nothing was wrong with the policy: Keith was publishing through
the review queue while I measured, and my two reads saw two different databases.
Recomputing both sides inside **one transaction** against a temp snapshot gave
identical fingerprints. A comparison is only evidence if both sides observe the
same instant.

## The principle, stated generally

Two claims about a system are routinely confused with the system:

**What a description asserts.** Migrations, comments, `.env.example`, README,
CLAUDE.md, a PR body. Each records what its author intended *at the moment of
writing*. Nothing re-checks them. A migration is a particularly seductive case,
because it is executable and therefore feels authoritative — but it records what
it **did**, not what is **true now**, and its effect can be silently voided by a
platform default, a later migration, or a dashboard edit. The current state has
exactly one source: querying the running system.

**What a property rests on.** A system can hold a safety property for a reason
nobody selected — a default, a side effect, an unshipped feature. It holds until
someone removes the accidental support while changing something adjacent, and
their change looks unrelated in review. So a safe-looking finding deserves the
second question: *safe because of what, and is that thing load-bearing on
purpose?* The answer converts a latent hole into a known one.

Both are the same failure at different scales: **trusting a representation
instead of the referent.** The remedy in both directions is to go and look —
and, when the representation turns out to be wrong, to fix the representation
too, because the next reader will trust it exactly as much as you did.

## Where else it fits

- **Any audit that begins from documentation.** Grant tables, IAM policy,
  firewall rules, feature flags, CORS config, `robots.txt`, a cron schedule. Read
  the file to learn intent; query the system to learn state; treat a gap between
  them as the finding, not as noise.
- **Anywhere a platform supplies defaults under your declarations.** Supabase
  default privileges, Kubernetes default service accounts, S3 bucket policy
  versus ACL, Postgres `public` schema grants. An additive config file cannot
  describe what it did not remove.
- **Any "this is fine, it's already safe" conclusion** — in a security review, a
  threat model, a code review. Name the control. If nobody chose it, it is not a
  control, it is luck with good timing.
- **Any before/after measurement on a live system**: analytics digests, corpus
  counts, migration verification. Snapshot both sides, or the drift is your
  result.

## Rules of thumb

1. **A file describes intent; only a query describes state.** Never report a
   grant, policy or flag from the migration that set it — read it back from the
   live system.
2. **An additive config cannot promise an absence.** If it only ever grants,
   adds or appends, it says nothing about what is *not* there. Look for the
   platform default underneath it.
3. **Ask what the safety rests on.** "Deny-all", "nobody uses that role",
   "the app always filters" — name it, then ask whether the current change is
   about to remove it.
4. **Prove a dependency is gone by breaking it.** Run with the credential
   replaced by garbage. If everything still works, nothing was using it.
5. **A differential check must observe one snapshot.** Two queries against a
   live system are two different systems.
6. **When a description turns out to be false, fix the description in the same
   change.** Otherwise the next reader inherits your surprise.
7. **Corroborate, don't restate.** A lesson that recurs within a single session
   is evidence the existing rule isn't yet reflex — say so on the existing rule
   rather than minting a new one.
