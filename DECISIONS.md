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

### Verification gap in M0 (closed in M1 — see below)

The rendered page was verified programmatically — DOM contents, computed styles,
resolved custom properties, loaded font families, live values read back from
Neon — but **not** inspected visually, because the browser pane could not
composite a screenshot in the build environment. Visual review of the M0 page is
outstanding.

---

## M1 — music core

### Intervals carry diatonic steps, not just semitones

An interval is `{ steps, semitones }`. Semitones alone cannot distinguish an
augmented fifth from a minor sixth, and transposing by one gives a different
letter than transposing by the other. Every spelling guarantee in the app rests
on this pairing: the letter comes from the step count, and the accidental is
then whatever it must be to land on the right semitone. That is why G♭ + P4
gives C♭ rather than B.

### Scales are stacked, not looked up

No table of key signatures. A scale is the mode's interval pattern transposed
from the tonic, which makes G♭ major produce its C♭ and B major its A♯ for free,
and makes every mode in every key work by the same code path. Key signature is
*derived* by summing the alterations in the scale, which means it also works for
modal keys, where a lookup table would have needed a second table.

### The tritone above the tonic is the raised fourth

The one chromatic note that does not follow the key's accidental direction. In
C — a flat-spelling key by the jazz convention adopted here — pitch class 6 is
F♯, not G♭, because it functions as a leading tone up to the fifth. Without this
rule the recogniser emitted `Gbdim7` where every chart in the world says
`F#dim7`. The same rule gives A as the ♯4 of E♭.

### Diminished triads live inside `min7b5`

The brief's quality list has `min7b5` and `dim7` but no plain diminished triad,
so a diminished triad is `min7b5` with no seventh extension. `formatChord`
renders that as `dim` / `°` and the half-diminished seventh as `m7b5` / `ø7`.
The alternative — adding a quality the brief did not ask for — seemed worse than
one small piece of encoding.

### Chord symbols are parsed quality-first

`parseChord` reads the quality token *before* stripping alterations. The `b5` in
`m7b5` belongs to the quality, and stripping alterations first silently turned
half-diminished chords into minor sevenths with a flat five — a different chord
with a different function, and a bug that would have been invisible until some
minor ii–V got analysed wrongly weeks later. The `sus` token is matched anywhere
in the symbol rather than anchored, because `G7sus4` writes its extension first.

### Rootless voicings need order-preserving stacking

Form A is 3–5–7–9 and form B is 7–9–3–5. Placing each note at the lowest octave
above the previous one is what keeps them different; sorting the result by pitch
collapses form B into form A, which is the one thing those two shapes must never
do. Dominants swap the fifth for the thirteenth, since the fifth of a dominant is
the note nobody misses.

### Recognition is ranked by an explicit idiom prior

Every chord template carries a `prior` — how often that chord actually turns up
in this music. It is the mechanism behind the brief's own example: E–G–B♭–D fits
`Em7♭5` exactly, with the root in the bass, and still loses to a rootless `C9`,
because rootless dominants are everywhere and root-position half-diminished
chords are not. Combined with a bonus for the specific shapes that are idiomatic
*without* their root, this reproduces the required ranking without a special
case, and generalises: B–D–F–A in C reads as `G9` before `Bm7♭5` for the same
reason.

The weights live in one `W` object at the top of `recognise.ts`. They are tuned
against the golden fixtures and are the first thing to adjust if the rankings
ever feel wrong in practice.

### Diminished sevenths report all four of their dominants

A dim7 is symmetric, so it is the rootless ♭9 of four different dominants.
Recognition returns the literal `F#dim7` first and then `D7b9 > F7b9 > Ab7b9 >
B7b9`. That list is not noise — it is the fact the wheel is supposed to make
visible, arriving for free from the same scoring.

### Inversion is not a slash chord

A first-inversion Cmaj7 is `Cmaj7` with `inversion: 1`, not `Cmaj7/E`. The
`bass` field is reserved for a bass note that genuinely is not a chord tone.
This keeps the abstract chord and the voicing separate in the output exactly as
they are separate in the model.

### Modulation needs a complete ii–V–I

A bare V–I is not enough evidence: E7–Am7 in C is `V7/vi` doing its job, not a
move to A minor. Detection therefore requires a full ii–V–I landing outside the
current key, and additionally requires that the three chords are not all already
diatonic at home.

The pivot is then found by walking *backwards* for the last chord diatonic in
both keys — the point where the ear changed key without noticing, and the cell
the two key-shapes share on the wheel.

### Some modulations honestly have no pivot

C to A is three steps on the circle and the two scales share only four notes, so
there is no common diatonic chord to pivot on; C to G♭ shares less still. Rather
than invent a pivot, `analyse` reports the key change with no `pivot` field, and
the fixtures assert that absence. It is a real musical fact and a better lesson
than a fabricated hinge — keys that far apart have to be reached directly or via
a dominant.

### Backdoor is checked before tritone substitution

B♭7 in C sits a semitone above the diatomic A, so a naive tritone-sub test claims
it as the substitute for `V7/vi`. Its actual job is approaching the tonic from
below. Order matters here and the fixtures pin it.

### Two golden fixtures were wrong, not the code

Worth recording because the instinct is always to "fix" the implementation.
`E♭`→`B` is four steps on the circle, not six — the short way round is
E♭→A♭→D♭→F♯→B. And A is the ♯4 of E♭, not the ♯6, since E→A is three letter-steps
across six semitones. Both were verified by hand before the fixtures were
changed.

### Coverage

263 golden fixtures across 19 categories, driving 370 tests. Includes all 15
major and 14 minor scale spellings, 22 modal spellings, the diatonic sevenths of
25 keys, ii–V–I in all 12 major and all 12 minor keys with guide-tone motion
verified in every one, every inversion of every diatonic seventh in C, and pivot
modulations at 1, 2, 3 and 6 steps on the circle of fifths.
