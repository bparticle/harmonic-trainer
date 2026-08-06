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

---

## M2 — the harmonic wheel

### The brief's two geometric claims are true, and now enforced

Ring *n* at angular position θ holds circle-of-fifths index `θ − n·offset·direction`.
With five rings and an offset of three that means moving inward one ring is a
minor third, so a radial spoke spells a diminished seventh and the fifth ring
duplicates the first. Both are asserted in `geometry.test.ts` for all twelve
positions, and both are surfaced on the calibration screen as plain statements
("a radial spoke: a diminished seventh", "ring 5 duplicates ring 1") rather than
left as trivia.

Reversing `offsetDirection` stacks the same chord downward instead of up —
C–E♭–G♭–A becomes C–A–F♯–E♭ — so what a spoke spells depends only on how many
distinct rings there are, which is `12 / gcd(12, offset)`.

### Shapes are relative cell offsets, which is why rotation transposes

A shape is computed once from an interval set as offsets from a root at
(ring 0, position 0), then placed. Every pitch class appears once per ring, so
each note has four candidate cells and the closest one is chosen. Because the
result depends only on the intervals, Cmaj7 and F♯maj7 produce byte-identical
shapes and transposing is literally rotating. A test asserts that across six
keys.

### Rotation is modelled as a physical object

Drag owns the angle outright; release hands over to momentum, friction, and then
a damped spring into the nearest of twelve detents. Split out of the component
into `rotation.svelte.ts` so the physics is testable without a DOM — which
immediately caught that `isAtRest` was treating "momentarily still between two
detents" as settled.

`prefers-reduced-motion` skips coasting and springing entirely and snaps
straight to the detent.

### Musical glyphs are drawn, not typed

`♭ ♯ ∆ ø °` are missing from most display faces, and a fallback box at 14rem is
not a subtle failure. `Glyph.svelte` draws each one as a stroked path in a
100-unit em box with the baseline at the bottom edge, so `size` behaves like a
font size and they sit on the baseline with the type. This was promised in M0
and is now delivered.

`ChordSymbol.svelte` composes those with raised, smaller extensions. Because the
symbol is partly vectors, it is hidden from assistive technology and a spoken
form supplied alongside — "E flat minor 7" — rather than left as unreadable
punctuation. There is no ARIA role for "a word made of vectors", so `role="text"`
was wrong and a visually-hidden sibling is right.

### Voice-leading distance is exact, not approximate

Minimal total semitone movement over every way of pairing two chords' notes,
brute-forced. Chords are never more than six or seven notes, so the factorial is
irrelevant and an exact answer beats a clever heuristic. This is what orders the
neighbours list, and it puts E♭∆ one note and two semitones from Gm7, exactly as
the brief's example requires.

### The wheel component owns no music knowledge

It takes cells, highlights, arcs and lit pitch classes, and draws them. Every
overlay is computed in `overlays.ts` from the music core. The consequence worth
having: the live MIDI overlay in M3 is just a `lit` array — the component needs
no change at all to light up what is being played.

### Settings are patched, not replaced

Calibration and the colour editor each `POST` only the field they own, so
neither can undo the other by saving a stale copy of the whole object. Both
inputs are validated server-side: an out-of-gamut colour or a zero-ring wheel
would not crash anything, it would quietly render wrong, which is worse.

### The colour editor clamps as you drag

Pushing chroma past what sRGB can hold at a given lightness silently clamps to
the maximum that fits, holding lightness and hue. Verified in the browser:
asking for chroma 0.32 at L 0.55, H 27 yields 0.226 and stays in gamut. The
contrast readout is live because a colour that has drifted out of legibility is
not obvious by eye until it is on a music stand across the room.

### Three test expectations were wrong again, not the code

Recorded because the pattern keeps repeating. C∆7 and Dm7 share only one note,
so three differ, not two. JavaScript's default `.sort()` is lexicographic, so
`[10, 2, 7]` needs a numeric comparator. And a ii–V–I walks *anticlockwise*
round the circle — D to G is −1 fifth, not +1.

---

## M3 — MIDI layer

### Settling a gesture is a timing question, not a rendering one

The flush loop originally ran on `requestAnimationFrame`, which was wrong and
was caught by testing in a browser pane that was not compositing: rAF is paused
or throttled whenever the tab is not painting, so chord detection silently
stopped. Playing into an app that has quietly stopped listening is the worst
failure this thing could have — worse than a crash, because nothing tells you.

It now runs on `setInterval`. Background tabs still throttle timers, but they
throttle rather than pause, and the events themselves accumulate correctly
either way.

### The on-screen keyboard is the same pipeline, not a lesser one

`MidiSession.push()` is the single entry point, and the on-screen keyboard calls
it with the same note-on and note-off events the hardware sends. Nothing
downstream — clustering, recognition, recording, scoring — can tell which one is
playing. That is what makes the no-MIDI mode a genuine fallback rather than a
second, worse implementation that rots.

### `unsupported` is a first-class state with a real explanation

Web MIDI does not exist in Safari on any platform, and every iOS browser is
Safari underneath. The UI says so in words, names the browsers that do work, and
carries on with the keyboard. An error toast would have been a lie about whose
fault it is.

### Zero-velocity note-on means note-off

Plenty of hardware, including some Arturia firmware, releases notes that way
rather than sending 0x80. Handled in the reducer so nothing above it has to
know.

### The sustain pedal does two jobs, and they do not conflict

Held down, it keeps released notes sounding, so the clusterer reports what is
actually ringing rather than what is under a finger. Pressed, it also advances
the interface — the brief's "navigation when hands are busy". Both are driven
from the same CC64 messages, with a half-pedal threshold at 64.

### Takes are stored as real Standard MIDI Files

Format 0, one track, tempo written in, times as wall-clock milliseconds
converted to ticks. Not a bespoke JSON blob, because the brief wants takes kept
forever and re-analysed when the engine improves — and because a standard file
opens in any DAW, which matters the day this app is not the only thing that
should be able to read your own playing. Verified end to end: a recorded take
round-trips through the encoder, survives the database as `bytea`, and comes
back with an intact `MThd`/`MTrk` structure.

The API decodes every uploaded take before storing it, purely to refuse anything
unreadable. A take that cannot be parsed is worse than no take, because it looks
like data until the day it is needed.

### "Guess before reveal" is self-reported, because it has to be

The app cannot know what you thought. So the chord is detected, held as a `?`
for the reveal delay, and you hit the pedal or the spacebar to claim you had it.
That claim is the honest measurement available, and the latency from detection
to claim is the number worth tracking.

### `Omit` on a union loses the union

`Omit<MidiEvent, 'time'>` collapses to the keys all three variants share,
quietly dropping `note` and `down`. A distributive version is needed. Caught by
`svelte-check`, not by the tests, which is a reminder that the type check earns
its place in the loop.

### The wheel's labels are painted on

Found by playing into it: rotating from C to G♭ silently rewrote F♯ as G♭ across
every cell, because labels were being spelled against the current key. On a
physical wheel the labels are paint. Turning it does not relabel anything, and
neither should this.

`wheelNoteName` spells from distance along the circle of fifths instead — up to
six fifths clockwise takes sharps, past that it is shorter to come back
anticlockwise with flats. That yields the conventional set (C D♭ D E♭ E F F♯ G
A♭ A B♭ B) and never changes.

Key-aware spelling still governs everything else, and must: in G♭ a chord reads
G♭∆, and the fourth degree is C♭ even though the wheel cell it sits on says B.
Two different jobs, now two different functions.

A side effect worth keeping: the wheel component no longer imports anything from
the music core at all. It takes cells, colours and shapes, and draws them.

### Rotating has to change something you can see

Turning the wheel only relabelled a corner of the screen, which read as nothing
happening. The current key's seven notes are now drawn as a shape on the wheel,
so the block visibly swings round to sit under the index mark — which is how you
read a key off the real object.

What rotation does *not* do is transpose what you are playing, and that is
correct: your hands are on the same three keys, so it is still Bm. The shape
tracks the notes.

### A bare 3–5–7 is a triad, not a rootless voicing

Found by playing A–D–F and being told it was B♭∆. It is, technically: D, F and A
are the 3rd, 5th and 7th of B♭ major seventh. But **every** minor triad is the
rootless 3–5–7 of a major seventh a major third below it — Dm is B♭∆, Em is C∆,
Am is F∆ — so the rootless bonus was firing on every minor triad anyone played
and naming a note that was not there.

The idiom shapes now all carry a ninth or a thirteenth. An extension is the
evidence that the chord is genuinely bigger than what is under the hand and the
root was dropped deliberately; three notes stacked in thirds are just three
notes stacked in thirds. E–G–B♭–D still reads as a rootless C9, because it has
the ninth.

The relationship is real and still surfaces, several places down the ranking,
which is where it belongs.

### A name that includes a note you did not play has to say so

The rootless reasoning existed, but only in the side panel, while the headline
showed a bare chord symbol. If the answer names a root that was never sounded,
that belongs next to the answer — so the display now carries a one-line caveat
("rootless — no B♭ played", "stacked fourths, named by its shape").

---

## M4 — spaced repetition and the curriculum

### Short-term scheduling is off, so `relearning` never happens

FSRS ships with sub-day learning steps (1 minute, 10 minutes) for cramming
something in a single sitting. This app practises once a day, so a card due in
ten minutes means nothing to it — within-session repetition is the session
engine's job, not the scheduler's.

Leaving it on also meant persisting a `learning_steps` counter, and getting that
wrong pinned every card at the ten-minute step forever, which is exactly the
class of silent bug the library was chosen to avoid — reintroduced in my own
translation layer. Turning the feature off removed the counter and the bug
together.

Consequence worth recording: with no relearning steps, a lapse keeps the card in
`review` with a collapsed interval rather than moving it to `relearning`. The
enum value exists in the schema and will never occur.

Fuzz is off too, for a different reason: it exists to stop thousand-card decks
bunching reviews onto one day, which is not a problem here, and turning it off
makes intervals deterministic so the tests can assert real numbers.

### Direction weighting is selection, not scheduling

Play-to-name is the weakest link and the brief asks for it to be weighted up.
That weight is applied when *choosing* which due card to ask, never to the
intervals themselves. Distorting FSRS's output would corrupt its model of your
memory; changing which card gets picked from the due pile does not.

Cold keys get a similar nudge, bounded so that a badly overdue card in a
comfortable key still beats a barely-due one in a neglected key.

### Grades come from latency, not self-report

Correctness comes from the pitch classes played. The grade then comes from how
long it took — under 1.5s is `easy`, under 4s is `good`, slower is `hard`.
Latency is the measurement the brief cares about, and it is more honest than a
self-rating nobody gives accurately under time pressure. The block 6 self-rating
still refines it.

### Cards carry a stable identity so re-seeding does not erase history

A card's identity is a deterministic string built from skill, key, item and
direction. Re-running the seed matches existing rows instead of inserting
duplicates and orphaning their reviews. That matters because the curriculum will
be edited, and edits should not cost you your history.

### Directions are omitted where the question has no answer

A scale has no single chord shape to read off the wheel and name; an inversion
drill is about where the hands go, not about naming anything. Generating cards
nobody can answer would quietly poison the accuracy statistics that the mastery
gate depends on. 3024 cards across the curriculum, unevenly split across the
four directions for exactly this reason.

### Mastery gates on transfer, not just accuracy

Three conditions: at least twelve reviews, 85% accuracy, and *at least one
unprompted appearance in free play*. The third is the one that matters — a thing
is not learned because it was answered correctly twelve times in a drill, it is
learned when it turns up in playing nobody asked for. The brief calls that the
app's real scoreboard, so it belongs in the gate rather than in a report.

### Seeding: batched, and honest about the learner

Row-at-a-time inserts against Neon meant one network round trip per row, and
3024 cards took over twenty minutes. Chunks of 500 brought a full reset with
four weeks of history down to 23 seconds.

The simulated history is deliberately uneven — C, F, G and B♭ practised hard,
the far side of the wheel barely touched, minor keys not at all — because a
blind-spot report over uniform data looks like it works when it does not.

A first attempt at the rating distribution banded the roll so that a strong key
could never miss, and every warm key came out at a suspicious 100%. Ability is
now the cutoff for `again` directly, so the seeded accuracies land where they
were meant to: 85–87% warm, 64% lukewarm, 37–52% cold, with latency tracking the
same split.

### An alteration has to be audible

Playing B♭–C–E offered C7, C7♭5 and C7♯5 as three separate readings. All three
fit, because the fifth is missing from all of them — but you cannot hear a
flattened fifth that was never played, and offering all three is inventing
evidence rather than reporting it. A candidate is now rejected outright when the
degree one of its alterations modifies is not among the notes.

### Three notes stacked in thirds is a triad; three notes is not

B♭–C–E contains a major second and a tritone, so it is not a triad however it is
rearranged. As C–E–B♭ it is root, third and seventh: a **shell voicing**, which
is the shape the curriculum teaches at L3.

Reporting that as "fifth not played" was accurate and useless. Recognition now
labels the shape, because "shell voicing" connects what is under the hand to
something learnable and "missing a note" does not.

### Figure and ground on the wheel

Every cell sitting at a readable middle made the wheel busy rather than
informative: eleven saturated competitors mean the seven-note shape has to be
decoded instead of seen. In-key cells now go to 96% and everything else drops to
9%, so a scale reads as one object at a glance.

Two exceptions keep that from becoming a rule that hurts. A note actually
sounding is never dimmed away, even outside the key — playing something the key
does not contain is precisely when you want to see where it landed. And when no
key is selected there is no figure to separate, so contrast would only make the
wheel look switched off; everything sits at a readable middle instead.

### Degrees on the cells

The wheel now writes `I ii iii IV V vi vii°` under the note names, and chord
tones (`R 3 5 7 9`) in chord mode. The degree is the part that transfers: ii–V–I
is one shape in all twelve keys and Dm7–G7–C is not, so the numeral is what is
worth memorising and the letter is not.

On the circle of fifths a diatonic scale is seven contiguous positions, so with
the dimming in place the key now reads as a single solid block of numbered
cells — which is the visual map the wheel exists to build.
