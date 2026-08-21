# Security

## Reporting a vulnerability

Please report security issues privately, through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
on this repository, rather than opening a public issue.

Expect an acknowledgement within a few days. This is a small, volunteer-run
project; please be patient, and please do not disclose publicly until a fix is
available.

## What this software is

A self-hosted practice tool with invite-only accounts. There is no public hosted
service and no self-registration. The operator provisions the people they trust
and is responsible for their instance.

## The threat model, honestly

**Authentication is per account.** Email addresses identify accounts; passwords
are hashed with versioned scrypt parameters, and `AUTH_SECRET` signs a 90-day
cookie containing the account and its revocation epoch. Changing a password or
choosing “sign out everywhere” invalidates every existing cookie for that
account. Cards, sessions, settings, custom charts and the playing record are all
scoped to the resolved account.

**This is a family beta, not public account infrastructure.** There is no
self-registration, password-reset email, sign-in rate limiting, role system, or
account export/deletion interface yet. Accounts are provisioned by the operator
with `npm run account:create`. That is appropriate for a few known people and
is not sufficient for opening registration to strangers or taking payment.

**Secrets live in environment variables.** Never commit a `.env`. The committed
`.env.example` contains placeholders only, and `.env*` is gitignored.

**Web MIDI needs a secure context.** Deploy over HTTPS or MIDI silently fails.

**The database holds practice data.** Chord charts, review history, settings,
and since M9 a log of every run of the play-along transport and every chord it
judged — nothing sensitive by design, but it is still yours, and there is more of
it than there used to be. Back it up like anything else.

If you find something that lets one account read or change another account's
data, or that bypasses sign-in, that is a real vulnerability and we would like
to hear about it.
