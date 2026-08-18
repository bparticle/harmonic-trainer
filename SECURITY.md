# Security

## Reporting a vulnerability

Please report security issues privately, through GitHub's
[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
on this repository, rather than opening a public issue.

Expect an acknowledgement within a few days. This is a small, volunteer-run
project; please be patient, and please do not disclose publicly until a fix is
available.

## What this software is

A self-hosted practice tool. There is no hosted service, no multi-tenancy and
no user accounts. Each deployment belongs to whoever runs it, and the operator
is responsible for their own instance.

## The threat model, honestly

**Authentication is a single shared password.** `APP_PASSWORD` gates the whole
app and `AUTH_SECRET` signs the session cookie. There are no accounts, no
roles, no password reset and no rate limiting. This is adequate for a personal
instance on a URL nobody has guessed, and it is not adequate for anything else.
Do not put data you care about behind it, and do not deploy it as a shared
service without adding real authentication first.

**Secrets live in environment variables.** Never commit a `.env`. The committed
`.env.example` contains placeholders only, and `.env*` is gitignored.

**Web MIDI needs a secure context.** Deploy over HTTPS or MIDI silently fails.

**The database holds practice data.** Chord charts, review history, settings,
and since M9 a log of every run of the play-along transport and every chord it
judged — nothing sensitive by design, but it is still yours, and there is more of
it than there used to be. Back it up like anything else.

If you find something that lets one deployment's data reach another, or that
bypasses the password gate, that is a real vulnerability and we would like to
hear about it.
