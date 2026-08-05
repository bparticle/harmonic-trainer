# Decisions

Every non-obvious choice, with the reasoning. Newest milestone last.

---

## M0 — foundation

### The CONFIG block changed before any code was written

The brief specified SQLite via `better-sqlite3`, a single Docker container on a
Synology NAS behind Cloudflare, and no auth. On review that became: **Neon
Postgres, deployed to Vercel, with a password gate.** The change came from the
answers to the section 0 questions, not from a preference of mine.

Consequences that follow, and that override the brief where they conflict:

- **§2 "fully offline at runtime, everything self-hosted" is no longer literally
  true.** A hosted database on a PaaS is neither. The intent — *practice must
  never be blocked by the network* — is preserved by going local-first instead
  (see below).
- **§16 lists "accounts, login, or a cloud backend" as anti-goals.** The cloud
  backend was chosen deliberately. Login follows from it: a public URL with no
  auth means the practice vault is readable by anyone who finds the hostname.
  The mitigation is kept as small as possible (see *Auth*).
- **Docker is no longer a deployment artifact.** `docker-compose.yml` survives
  only to run a local Postgres for development and tests.

### The iPad cannot run this app's core

Safari on iOS and iPadOS has never implemented the Web MIDI API, and Apple's
WebKit team has declined it on fingerprinting grounds with no roadmap. Every iOS
browser is required to use WebKit, so Chrome or Firefox on an iPad do not help.
Safari on **macOS** also lacks it.

Without MIDI, session blocks 2, 3 and 5, the entire vault, naming latency,
auto-grading and transfer detection are all impossible — that is most of the
product, not a degradation.

**Decision:** practice sessions run on the laptop in Chrome, Edge or Firefox.
The iPad is a first-class *Explore* device — wheel, reports, vault browsing —
and the layouts are built for it, but it is not where you play. Capability is
detected at runtime and the on-screen keyboard fallback stays supported so the
app is never dead, but it is a fallback, not the plan.

### One database driver, not two

Neon's own `neon-http` driver cold-starts faster, and the scaffolder wired it up
by default. It was replaced with plain `node-postgres` against Neon's **pooled**
endpoint.

`neon-http` cannot do interactive transactions. The sync endpoint that drains
the offline outbox has to commit a batch of reviews, session blocks and takes
atomically, or a half-flushed session corrupts the SRS state. Roughly 50ms of
extra cold start buys real transactions, one driver in dev and prod, and one
code path to maintain. For a single-user app whose network is already off the
critical path, that is not a close call.

PgBouncer on the pooled endpoint handles connection limits, so each serverless
instance keeps a pool of exactly one.

### Local-first, with client-generated UUID primary keys

*Decided now, implemented from M3 when there is session data worth syncing.*

The session runs out of IndexedDB and flushes to Postgres as an append-only
outbox. A dropped tunnel, a closed laptop lid or a Neon cold start must never
stall a block or lose a take.

This is why every primary key in `schema.ts` is a client-generated UUID rather
than a serial: rows have to be creatable offline and merge idempotently on
replay. `defaultRandom()` is only a convenience for server-side seeds.

### Enums only where an algorithm fixes the vocabulary

`card_direction`, `srs_state_kind` and `review_rating` are real Postgres enums —
they are defined by the SRS design and will not churn. Everything else that
looks enum-ish (`block_type`, `fact_type`, `category`, `style`) is `text`
narrowed by a TypeScript union. Full type safety in code, no `ALTER TYPE`
migration every time a new fact type is worth tracking.

### `skills.prereq_ids_json` holds skill *codes*, not UUIDs

The curriculum is seeded and reseeded. Codes (`L4`, `L7`) survive a reseed and
are readable in a `psql` session; UUIDs do neither.

### `analysis_facts` is narrow and long

One row per observation rather than a wide table of columns. The blind-spot
report is then a `GROUP BY` instead of a schema migration every time a new
dimension turns out to be worth tracking. Storage is irrelevant at this scale.

### Raw MIDI is stored alongside the analysis, not instead of it

`takes.midi_blob` is `bytea` and kept forever. The analysis engine will get
better; old takes should benefit retroactively. A five-minute take is tens of
kilobytes, so there is no reason to reach for object storage.

### Colour: OKLCH, seven anchors, five derived

The palette is authored in OKLCH rather than hex because §4.1 requires a colour
*editor* — dragging lightness must not shift hue, and dragging hue must not
shift perceived lightness. In sRGB hex that is guesswork.

Only the seven diatonic anchors are authored. The five chromatics are
interpolated to the midpoint between their neighbours, in code, because that is
the rule the physical wheel was painted by. Editing "green" then drags F♯ along
coherently.

**Gamut clamping is not optional.** Interpolating two in-gamut colours does not
give an in-gamut colour: F♯, midway between green and blue, lands on a cyan sRGB
cannot reach at that lightness. Chroma is reduced until it fits, holding
lightness and hue exactly, so the swatch still reads as "between F and G".
Letting the browser clip instead would shift both lightness and hue silently.

A subtlety worth keeping: the clamp **floors** the chroma to 4 decimal places
rather than rounding it. Rounding up put F♯ straight back out of gamut, and the
test caught it.

### Ink candidates are near-black and near-white

The mid-lightness swatches — A♯ especially, at L 0.59 — sit where neither a soft
dark nor a soft light ink clears 4.5:1. The candidates had to be pushed to
L 0.10 and L 0.99. Both keep a trace of the ground's hue rather than being pure
`#000`/`#fff`, which reads as cheap. Every one of the twelve now clears 4.6:1.

### Ground and ink values exist twice, guarded by a test

Tailwind 4 generates utilities at build time and cannot read values out of
TypeScript, so the ground and ink literals appear in both `palette.ts` and
`layout.css`. `tokens.test.ts` reads the CSS file and fails if they drift. The
twelve pitch colours are deliberately *not* in CSS at all — they are
database-owned and injected at runtime, which is what makes the colour editor
possible.

### Palette is server-rendered into the document head

A flash of default palette would be especially wrong in an app whose premise is
that colour means pitch, so the twelve custom properties are injected during SSR
rather than applied after hydration.

### Type

Space Grotesk (variable) for chord symbols at size; IBM Plex Mono for degree
numbers and Roman numerals. Both self-hosted via Fontsource — no external
request at runtime, and they are precached by the service worker.

Chord symbols need `∆ ø ° ♭ ♯` and superscripts, and most display faces lack the
musical glyphs. **From M2, accidentals will be composed as SVG paths inside a
`ChordSymbol` component** rather than relying on font coverage, so the
typography is exact regardless of the face chosen.

### Auth: one password, one signed cookie

No users table, no sessions table, no registration, no email. HMAC-SHA256 over
the issue timestamp, `httpOnly`, `secure` in production, 90-day expiry —
re-entering a password mid-practice is hostile. Password comparison is
constant-time and pads to equal length so timing does not leak length either.
`secure` is relaxed on `http://localhost` only.

### PWA icon is SVG only

One `icon.svg` at `sizes="any"`, used for both `any` and `maskable` purposes. It
scales perfectly, costs nothing to ship, and needs no binary asset in the repo.
Its hex values are the sRGB rendering of the default OKLCH palette — the one
place the colours are necessarily duplicated, since an icon cannot read the
database.

### `npm audit` findings are knowingly unfixed

Two transitive advisories, both dev-tooling only:

- `cookie <0.7.0` via `@sveltejs/kit` — the offered fix downgrades SvelteKit to
  `0.0.30`.
- `esbuild <=0.24.2` via `drizzle-kit`'s loader — the offered fix downgrades
  `drizzle-kit` to `0.18`.

Neither is on the runtime request path, and both "fixes" would destroy the
toolchain. Revisit when the upstream packages bump their own dependencies.

### SRS: FSRS, via `ts-fsrs`

Chosen over SM-2. The schema is already FSRS-shaped (`stability`, `difficulty`,
`state`), and with four directions across twelve keys the card count runs to
thousands, where scheduling efficiency actually pays.

The library (`ts-fsrs`, MIT) is preferred over a hand-rolled implementation
because FSRS has subtle edge cases — same-day reviews, fuzz, retrievability at
zero elapsed time — where a hand-rolled version is *silently* wrong. A scheduler
that is quietly mis-scheduling is the worst possible failure mode here, because
nothing about the UI would reveal it. Wired up in M4.

### Verification gap in M0

The rendered page was verified programmatically — DOM contents, computed styles,
resolved custom properties, loaded font families, live values read back from
Neon — but **not** inspected visually, because the browser pane could not
composite a screenshot in the build environment. Visual review of the M0 page is
outstanding.
