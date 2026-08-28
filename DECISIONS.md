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
  true.** A hosted database on a PaaS is neither. The intent — _practice must
  never be blocked by the network_ — is preserved by going local-first instead
  (see below).
- **§16 lists "accounts, login, or a cloud backend" as anti-goals.** The cloud
  backend was chosen deliberately. Login follows from it: a public URL with no
  auth means the practice vault is readable by anyone who finds the hostname.
  The mitigation is kept as small as possible (see _Auth_).
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
The iPad is a first-class _Explore_ device — wheel, reports, vault browsing —
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

_Decided now, implemented from M3 when there is session data worth syncing._

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

### `skills.prereq_ids_json` holds skill _codes_, not UUIDs

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
_editor_ — dragging lightness must not shift hue, and dragging hue must not
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
twelve pitch colours are deliberately _not_ in CSS at all — they are
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
zero elapsed time — where a hand-rolled version is _silently_ wrong. A scheduler
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
_derived_ by summing the alterations in the scale, which means it also works for
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

`parseChord` reads the quality token _before_ stripping alterations. The `b5` in
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
_without_ their root, this reproduces the required ranking without a special
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

The pivot is then found by walking _backwards_ for the last chord diatonic in
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

Ring _n_ at angular position θ holds circle-of-fifths index `θ − n·offset·direction`.
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
`[10, 2, 7]` needs a numeric comparator. And a ii–V–I walks _anticlockwise_
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

What rotation does _not_ do is transpose what you are playing, and that is
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
That weight is applied when _choosing_ which due card to ask, never to the
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

Three conditions: at least twelve reviews, 85% accuracy, and _at least one
unprompted appearance in free play_. The third is the one that matters — a thing
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

---

## M5 — the session engine

### Blocks are written as they finish, not at the end

The brief says a session can be abandoned without penalty, and that only means
anything if nothing was being withheld. Each block posts its own results the
moment it completes, so walking away halfway keeps everything up to that point.
Resuming reads the first block with no recorded result.

### A block must not contradict its own instruction

The warm-up says "scale in the right hand, the seven diatonic sevenths
underneath", and the first version handed it any due `see_play` card — so it
opened by telling you to warm up with a ii–V–i. Blocks now name the skills they
draw from, not just the directions.

The same bug had a second half: today's key was chosen from every key present in
the deck, including the minor centres that only exist because the minor ii–V
generates them. That landed on C minor and then promised seven diatonic sevenths
with no key-anchoring material to give. The session key is now chosen only from
keys the warm-up can actually serve.

### Block 4 always has something to teach

Mastery requires a transfer event; transfer detection is M6. Nothing could ever
be mastered, so the curriculum sat on L0 forever, and L0 has no atoms — meaning
the single new idea the whole session is built around was empty every day.

Rather than weaken the gate, atom selection falls back: the current skill is
asked first, and when it has nothing, the lowest-level skill with an unseen atom
is used. Ordering never runs ahead of the graph; it only refuses to run out of
things to say. Transfer counts are read from the real table, which is empty and
honest rather than stubbed to a convenient number.

### `inArray`, not `= any(...)`

Drizzle expands a JS array into a tuple of placeholders, so
`where(sql\`id = any(${ids})\`)` produces `= any(($1, $2, $3))`, which Postgres
rejects. Every 500 the session threw traced back to this. `inArray` is the
helper that exists for it.

### Reviews and schedules move together or not at all

Recording a batch writes the review rows and advances the FSRS state inside one
transaction. A half-written batch would leave the scheduler believing a card had
been reviewed with no review to justify it — drift that nothing in the UI would
ever reveal.

### The finish screen does not depend on the session still existing

Ending a session clears it from the server's "today" query, so the page
initially fell through to "no session running" the instant you finished one,
which reads as though the last twenty minutes had been discarded. The completed
state is held locally and takes precedence.

### Audio is loaded on demand and synthesised, not sampled

Your piano makes its own sound, so nothing here reproduces what you play — it
only asks. An FM electric piano is a handful of parameters against tens of
megabytes of samples, and browsers block audio until a gesture anyway, so Tone.js
is imported the first time something needs to make a noise rather than on every
page that might.

The metronome runs on Tone's transport rather than a timer, because a metronome
that drifts is worse than none.

### Backing tracks are deferred, and the block says so

Block 5 captures and highlights the target device but has no backing loop; that
is M7. The screen states this rather than leaving you waiting for audio that is
not coming.

---

## Persistent app shell

### MIDI belongs to the app, not to a page

Each page constructed its own `MidiSession`, so every navigation tore down the
connection and rebuilt it, and any page without a drill had no session at all —
the keyboard simply felt dead there. That is the sort of inconsistency that
makes a working app feel unreliable.

There is now one module-level instance. ES modules are evaluated once, and
SvelteKit routes on the client, so it survives navigation for the life of the
tab. Constructing it at module scope is safe during SSR because the class
touches no browser API until `detect`, `connect` or `startVirtual` is called,
and only the root layout does that.

Verified rather than assumed: a note held down on `/play`, navigated to
`/explore` without releasing it, still shows in the header.

### Handlers are borrowed, and given back

The session outlives every page, so `onChord` and `onPedal` are set on mount and
cleared on unmount. A stale handler would leave a screen nobody is looking at
marking chords played somewhere else.

### Reconnecting without asking

Web MIDI permission is remembered per origin, so a second `requestMIDIAccess`
does not prompt. Once connected, the fact is stored locally and the connection
is restored on load — the piano is simply live when the app opens rather than
needing a button pressed at the start of every session. First-time visitors
still get an explicit prompt, and it can be switched off again from the menu.

### One header, and it says what it is

Every page carried its own header with different links in different places,
which made moving around feel like moving between separate tools. There is now a
single sticky shell: the same three destinations in the same order everywhere,
with the current one marked.

The links were also set in the dimmest ink in the palette, which is right for a
caption and wrong for the only navigation in the app. Inactive links now sit at
`--color-ink-muted` and the current one at full `--color-ink`.

### The notes are always visible

The header shows what is sounding on every screen, including the pages that do
nothing with it. Most of the time it is decoration — but an instrument that
responds everywhere feels connected, and one that responds on two screens out of
six feels broken on the other four.

### Settings follow you

Device choice, reveal delay, chord window, MIDI latency and session length live
behind a cog in the header rather than in one page's chrome. Device management
especially has to be reachable from anywhere: a piano switched on mid-session
should not require navigating to a particular page to be noticed.

Preferences are validated server-side with real bounds. A chord window of zero
would quietly break note clustering in a way that looks exactly like broken
MIDI hardware.

### An effect that reads MIDI state cannot also own MIDI's lifetime

Pressing "connect a keyboard" did nothing at all, silently. The root layout's
effect called `restoreMidi`, which reads `midi.status` — so the effect _depended_
on the status. Connecting sets it to `requesting`, the effect re-ran, its cleanup
fired `midi.destroy()`, and the connection was torn down before
`requestMIDIAccess` could resolve.

The read is now wrapped in `untrack`, and the effect has no cleanup at all: the
session is meant to outlive every page, and the only thing that should end it is
closing the tab.

This is the second time in this build that an effect writing to state it also
reads has caused a bug that looked like something else entirely. Worth watching
for wherever a rune-based store is initialised from a component.

### A failed connect must say why

`connect()` caught the rejection and threw the reason away, which is how a
denied permission became "nothing happens". The message is kept, shown in the
menu, and paired with a retry.

Permission is also checked through the Permissions API before falling back to
our own stored flag — it covers access granted before this app started
remembering, and it survives clearing site data that the flag does not.

---

## Agency, and remembering the keyboard

### The device preference was designed and never wired

`settings.midi_device` has existed since M0 and nothing ever wrote to it, so the
chosen port was only ever in memory — and `#refreshDevices` dropped straight to
the first device whenever the selected id went missing, which any hot-plug event
causes. Choosing a specific keyboard and then navigating quietly moved you to
whatever port enumerated first.

It is now remembered **by name**, not by id. Web MIDI ids are opaque and not
stable across restarts or replugs, so an id cannot express "always use the
weighted one". A name can, and it is also the only part a person recognises.
Selection order is: the device already selected if it is still present, then the
remembered name, then whatever is plugged in.

### One button, unless you have a plan

The brief asks for one button and no menus, and that is right for the days when
you just want to sit down and play. It is wrong on the days when you already
know what you want to work on — being overruled by a scheduler is how a good
practice tool ends up unused.

So the app still decides by default, and now gets out of the way if asked. A key
can be taken from the wheel on the home screen; a focus area narrows the drills.
Both are optional and neither changes what gets recorded, so steering costs
nothing in what the app remembers.

Two rules keep it coherent:

- **A chosen focus narrows the drills, never the warm-up.** The warm-up has its
  own material by design, and a warm-up that is not a warm-up is just another
  drill with a misleading name.
- **The new idea follows the focus.** Asking to practise ii–V–I and then being
  taught something about quartal voicings would make the choice feel decorative.
  Choosing ii–V–I in E♭ now yields the guide-tone atom, in E♭.

`chosenKey` on the plan records whether the key was _honoured_, not merely
requested — asking for a key that has no material should not read as having
chosen it.

### A session that does not say what it is about

The header now reads `1 of 6 · Eb · ii–V–I`. Without it, a session you steered
is indistinguishable from one that picked at random, which is most of what made
practice mode confusing.

The home screen also lists the six blocks and their lengths before you start.
Knowing what the next twenty minutes contains is not a menu — it is the
difference between a plan and a surprise.

---

## The progression, rebuilt

Reported after real use: the exercises were too hard, material arrived from
nowhere, and the "solution" to a card was sometimes a whole chord progression.
All three were true, and the causes were mine.

### The seeded history was driving real sessions

`--history` invented four weeks of practice with deliberately uneven key
coverage, so the blind-spot weighting did exactly what it was built to do and
pushed towards B, F♯ and A♭ — keys chosen because a _simulation_ had skipped
them. Meanwhile all 3024 cards were created due at once, so altered dominants
and quartal voicings from the top of the syllabus were as eligible as a C major
triad.

Seed data that flatters the developer is one thing; seed data that steers the
user's practice is another. There is no card bank and no simulated history in
the seed any more.

### Nothing exists until it is reached

Cards are created when a rung is reached, not up front. A new account has
exactly two: the C major scale, to see and to hear. Nothing else _can_ be asked,
which is a much stronger guarantee than a scheduler promising not to.

### One key at a time, out from C

Keys are met in the order musicians have always met them — C, then one
accidental at a time, alternating sharp and flat sides. Seven small rungs per
key: the scale, the home chord, the three main chords, all seven triads, the
tonic seventh, all seven sevenths, the relative minor. Each rung is mostly the
previous one plus one idea.

The old model generated every key at once and let the scheduler choose, which
assumed a broad familiarity with all twelve keys that the app is supposed to be
_building_.

### Moving on is a decision

Asked for directly, and correct: the ladder tracks and suggests ("looks solid"
after roughly eight correct answers at 80%) but never gates. There is a step
forward and a step back, both always available. You can tell whether something
is under your fingers better than a review count can.

### Progressions became their own section

Also asked for, and a better idea than having them as rungs. Learning what is in
a key and learning how chords move within it are different jobs, and mixing them
made both muddier. Progressions are now a separate library, ordered by
difficulty from I–IV–V–I to tritone substitution, each playable in any key
already reached — so the same progression gets easier every time it turns up
somewhere new.

They are also stepped through chord by chord rather than presented as one
answer, which is what made a card's "solution" look like a progression.

### What went with it

The L0–L11 skill graph, the mastery gate, the focus areas and the atom system
are gone. Every one of them was solving a problem the ladder solves more simply,
and the mastery gate in particular could never be satisfied — it required a
transfer event, and transfer detection is M6.

### A scale is not a chord

Reported as "a very weird, dissonant chord" on the gentlest card in the app,
and it was exactly that: the scale card's voicing is all seven notes, and
`playChord` sounded them simultaneously. C–D–E–F–G–A–B as a single stack is a
tone cluster, and it was being offered as the first thing anyone hears.

`playSequence` existed, was imported, and was never called.

The marking had the same bug from the other side. It compared the answer as a
single handful, so all seven notes had to sound _at once_ to be right — which is
unplayable, and reported "missing 4" at anything a person could actually do.
Notes are now gathered as they arrive: any order, any octave, repeats and
passing notes forgiven, complete when every one has been played.

Both halves came from treating one type as though it were another. Anything
played over time — scales now, progressions next — needs its own posing and its
own marking, not a chord's.

### "Show me" is not the same as "skip"

Asked for directly, and right. Skipping leaves you no wiser and the next
encounter is another blank; being shown the notes means the next attempt is a
real one. It still records `again`, because needing the answer is exactly what
the scheduler should know — but it is no longer the only way out of a card you
cannot get.

Feedback names the notes now rather than counting them. "Missing 4" tells you
nothing you can act on; "still need D E F G A B" is an instruction.

---

## M7 — the rhythm section

### Generated, not recorded

Twelve keys times five forms times every tempo is not a set of audio files
anyone is going to make, and a play-along that only exists in two keys teaches
you those two keys. Everything is computed from the chart, which is why
transposition is a parameter here rather than a feature request.

### Musical time, not seconds

Every event is scheduled as `{'4n': 3.5}` — three and a half quarter notes —
rather than as a number of seconds. Musical time rescales when the tempo
changes; seconds do not. That single choice is why the tempo control can move
while the track is playing instead of stopping and rebuilding it.

### The bass walks by stepping, not by aiming

The first version placed the approach note first and then aimed each middle beat
at it by interpolation. On a bar of one chord that produces `C3 B2 C3 B2`: the
line rocking on the spot. It also repeated notes, because the approach was
computed against the root rather than against wherever the line had got to.

Now the direction is decided first, the middle beats step through the chord
tones in that direction, and the approach is recomputed against the note
actually reached. `C7` gives `C3 E3 G3 F♯3` into F.

Deterministic throughout — no randomness anywhere. A bass player who improvised
something different every four bars would be a menace to practise against, and
a line you cannot assert is a line you cannot test.

### Comping is off by default

The whole point of practising over a backing is usually to comp for yourself.
Two people voicing the same chord is one too many, so it starts muted and the
bass carries the root either way. Muting is a gain, not a reschedule, so it is
instant.

### Draw is for drawing

Tone's `Draw` queue runs on animation frames, so it stops completely when the
tab is not compositing. The first version routed _everything_ through it: the
playing flag, the count-in ending, and the chart highlight. Two of those were
wrong. Pressing play left the button reading "Play", and with the tab in the
background the count-in click would carry on for as long as you were away.

Anything with a consequence is now scheduled on the transport — the audio clock,
which does not care whether anything is on screen. Only the bar highlight, which
is purely cosmetic, is left in `Draw`.

This is the third time in this project a bug has come from state flowing through
the wrong clock: the chord-detection flush loop was on rAF, and the MIDI restore
effect wrote to state it also read. The pattern is worth naming.

### `°` and `°7` are different chords

`chordFromNumeral` mapped both to a half-diminished seventh, which quietly turned
the passing diminished in bar 6 of the jazz blues into a chord with a different
function. A bare `°` is the triad; `°7` is the fully diminished seventh.

---

## Polish pass: repertoire, colour, and choosing your own work

### Public domain, and the year on every one of them

Asked for popular jazz tunes, which §7 of the brief rules out — no
transcriptions of copyrighted standards. There are two honest ways to give real
repertoire anyway, and both are here:

**Public-domain standards.** US publication in 1930 or earlier, so the copyright
has expired: Indiana (1917), Sweet Georgia Brown (1925), St. Louis Blues (1914),
St. James Infirmary (1929), Bill Bailey (1902). Every one carries its year as a
field, a test asserts the year exists and is ≤ 1930, and a second test asserts
nothing else claims one. The claim is checkable rather than a promise.

**Named devices.** A bird blues and a three-tonic cycle are harmonic patterns
taught in every book, not compositions — named after the players who made them
famous, which is not the same as being their property. The ii–V cycle round the
wheel is nobody's at all.

Still no melodies, anywhere. The changes are written from what these forms are
commonly taught as; they are worth checking against your own ear rather than
trusting, which is another reason the year is on the label.

### An accidental keeps its letter

Three spelling bugs, one cause. `chordFromNumeral` altered a degree by moving
its pitch class and asking the key to re-spell the result, which throws away the
one thing a numeral is telling you — which direction the note moved.

- `♯I` in F came out G♭, a flat, for a numeral meaning "raised".
- `♭V` in C came out F♯, sitting next to a D♭m7 in the same bar.

Now the alteration moves and the letter stays. Two exceptions, both readability
rather than theory: an accidental still standing on a natural pitch takes the
plain letter (♭II in E♭ is E7, never F♭7), and anything past a single accidental
falls back to the key's own spelling, because B𝄫 helps nobody.

### Minor numerals count from the major scale

The minor charts were read in aeolian so that `i` and `iv` came out minor
without spelling every numeral. That is fine until an accidental appears: ♭VI in
C minor flattened the already-flat sixth, produced A𝄫, and fell back to G — so
bar 9 of the minor blues, which is meant to be the A♭7 leaning on the V, was a
second G7. Numerals now resolve against the major scale everywhere, which is how
every chart is written.

### Colour is information, not decoration

Play along was a list of names. It now tints each bar by its root in the same
twelve colours as the wheel and the keyboard, which makes the shape of a form
visible before it is played: the fifths cycle sweeps the whole palette, a modal
vamp barely moves. Below the chart, the selected bar is taken apart — symbol,
numeral, every note with its scale degree, and the shape under the hands.

`degreeLabels` is in the music core rather than the component, because "which
note is which" is the only vocabulary this app has for that job. There is no
stave to point at, so it has to be right about the flats: a diminished seventh
is `1 ♭3 ♭5 ♭♭7` and calling that last note a sixth would be a different chord.

### The drums were 10dB down, measured

Reported as "a little low, I can't hear the cymbals", and they were: MetalSynth
is quiet by nature and the first pass trimmed it a further 30dB. Rather than
nudge by ear, each part was metered alone at the destination — the kit peaked
10dB under the bass. It now peaks about 2dB under, which for transients is what
level sounds like. Per-part faders exist too, because whether the drums are loud
enough depends on the room and the speakers.

### The home screen asks instead of answering

It used to be one button wired to wherever the ladder was, with everything else
folded under a tab. Fine on the day you agree with it, a dead end on the day you
want to spend twenty minutes on the thing that went badly.

Now every key, rung and progression is visible and startable. Unreached ones are
dimmer, never disabled — consistent with the manual-unlock decision, where the
ladder suggests and never gates. Picking something further along starts a
session there and creates its cards on the way; it does not move the ladder,
because exploring and advancing are different decisions and only the arrows do
the second one.

---

## The keyboard diagram, the list, and bringing your own charts

### Seventy per cent of chords were drawn wrong

Reported as the piano "not always showing all the notes of the chord". Measuring
it across every chart in every key: **2521 of 3600** chord instances fell partly
outside the two octaves on screen. Not an edge case — the F7 in a plain C blues
was being drawn without its seventh, because `closeVoicing(chord, 4)` puts it at
65–75 and the diagram stops at 72.

The widest chord in the repertoire spans eleven semitones, so nothing needed a
bigger keyboard; the placement was simply never checked. `fitToRange` moves a
voicing into the range by whole octaves, which keeps the shape — the chord still
_looks_ like the chord. Only if it genuinely will not fit does it re-stack from
the bottom, changing the inversion but showing every note.

Nothing is ever dropped. A diagram missing the seventh is worse than one in an
inversion you did not ask for. Now 0 of 3600 fall outside, and 0 lose a note.

### A list, not a wall of tags

Eighteen charts as chips is a wall you skim past. As rows with the bar count and
the publication year on each, it is something you read down and choose from —
and it has room to grow, which the tag layout did not.

### Typing a chart in stores numerals, not chords

The answer to "I have a stack of paper sheet music". You write what is on the
page — chord symbols, in the key it is printed in — and `romanNumeral` from M1
converts it on the way into the database. Typing a tune in once therefore buys
all twelve keys, exactly like the built-ins, and nothing downstream can tell an
imported chart from a compiled one.

That the M1 analyser turned out to be the exact inverse of the M7 numeral
resolver was luck, but the round trip is now covered by tests in both directions.

A typo names its line and its chord and the rest of the chart is kept. Rejecting
a thirty-two bar tune over one unreadable symbol means re-typing thirty-two bars.

### On sourcing standards in bulk

There is no honest bulk source. Chord changes for tunes still in copyright are
what fake books sell, and scraping them would put them in the repo, which §7
rules out. Two things are available instead, and both are now here: more public
domain tunes (ten, each with its year), and an importer so anything else lives
in your database rather than in the code.

The changes for the built-in standards are the commonly taught versions written
out from knowledge, not copied from a source. They are worth checking against
your ear — which is part of why the year is printed next to each one.

---

## M6 is parked

Asked what M6 was, and decided against building it. It is recorded here rather
than half-built, and the app now says nothing about it anywhere.

### What it was going to be

The other half of the brief's loop — `CAPTURE → NAME`, where the naming happens
on your own playing rather than on a drill:

1. **The vault.** Record yourself playing freely, then browse those takes: play
   them back, name them, tag them, promote one into `repertoire` as a chart.
2. **Analysis.** Run `recognise()` and `analyse()` over a take and flatten what
   they find into `analysis_facts` — chords, keys, voicing types, devices,
   register, tempo.
3. **The blind-spot report.** A `GROUP BY` over those facts. "Every ii–V you
   play is a 3–7 shell, never rootless." "You have never once played a ♭VI7."
4. **Transfer detection.** Compare free playing against what has been drilled,
   and when something drilled a fortnight ago turns up unprompted, write a
   `transfer_events` row.

### Why not now

Transfer detection needs months of recorded playing before it can report
anything, and it has lost its consumer: the mastery gate that consumed transfer
events was deleted in the depth-first rebuild, so it would now feed a report and
nothing else. The vault and the report could work sooner, but not without the
capture habit that the transfer piece was supposed to justify.

### What was removed

The record button on **Play** saved takes to a table nothing read, and told you
"Saved 12.4s, 340 events" about a recording there was no way to hear again. That
is worse than no feature. It is gone, along with `/api/takes`.

Also corrected: the README promised "prove transfer" in its first paragraph and
offered the iPad "blind-spot reports and the vault", and its architecture map
still listed a `mastery.ts` that the rebuild deleted. Documentation describing
software that does not exist is the same bug as a button that does nothing.

### What was kept

- The `takes`, `analysis_facts`, `transfer_events` and `repertoire` tables. The
  migrations are applied; dropping them would be a destructive migration for no
  gain, and they are the shape the plan above needs.
- `midi/smf.ts`, the Standard MIDI File codec, with its tests. Unreferenced now
  and deliberately so — it is finished, correct work that M6 needs on day one.
- `startRecording` / `stopRecording` on the MIDI session, which are part of the
  MIDI layer rather than of the vault.

M8 — songwriting mode and JSON export — is parked on the same terms: wanted
later, absent for now, and not hinted at anywhere in the app.

---

## The screen stays awake while a backing track is playing

### Held by the track, not by the page

`WakeLock` lives inside `BackingTrack` rather than in the Play along page, so
`BackingControls.svelte` — the same class, wired into session block five —
gets it for free. Anywhere a rhythm section is actually sounding is somewhere
a phone or iPad propped on a music stand should not be deciding to sleep.

Held exactly as long as something is audible: requested when `start()` or a
true `resume()` sets `#playing`, released on `pause()` and `stop()`. The
count-in counts as playing on purpose — dozing off during the four clicks
before the tune starts would be a strange place to draw the line — but a
paused track releases it immediately, because nothing is asking to stay awake
for a chord you have frozen the screen on to go and find.

### Every failure is swallowed

The Wake Lock API throws if the document is not visible at the moment of the
request, is entirely absent on Safari before 16.4, and stops holding the
instant a tab is backgrounded regardless — the spec releases it, correctly,
the moment `visibilitychange` fires to hidden. None of that should ever be
allowed to interrupt a rhythm section: asking for something optional must not
put the thing that matters at risk. `WakeLock#acquire` catches everything and
does nothing with it beyond letting the next real attempt succeed or fail on
its own.

The `visibilitychange` listener is what makes that last case self-healing:
the lock is re-requested the moment the tab is visible again, provided
something is still meant to be playing. Verified directly — patching
`navigator.wakeLock.request` and watching it get called exactly once per
`start()`, throwing `NotAllowedError` in the non-visible automation tab
without that error reaching anywhere near the transport, which kept ticking
through it regardless.

---

## Are you playing the chord that is sounding?

Reported from real use: comparing the note colours in the header against the
chord colours on the chart, by eye, mid-tune, to see whether the last handful
had landed. The colours have always agreed — that is what the palette is for —
so the only thing missing was the app saying so.

### The score reads the audio clock, not the frame clock

`liveBar` and `liveBeat` reach the page through Tone's `Draw` queue, which runs
on animation frames. Attributing notes to bars from those would have been the
obvious wiring and quietly wrong: **measured in the automation tab, a hidden
document renders zero animation frames per second**, so the marking would have
stopped dead the moment the window lost focus, with a plausible-looking score
frozen on screen and nothing anywhere to say it had stopped counting.

`BackingTrack.position` is therefore a _pull_, reading `transport.ticks`
directly, and every note asks where the music is at the instant it lands — the
MIDI clock sampling the audio clock, with no frame in between. Verified by
playing a whole run through with rAF confirmed stopped: the scoring was exact
throughout.

This is the fourth time in this project a bug has come from state flowing
through the wrong clock — the chord-detection flush loop on rAF, the MIDI
restore effect writing state it read, the count-in click carrying on in a
background tab — so this time the shape was assumed rather than discovered.

The cosmetic half is deliberately left on the frame clock. The header pills and
the degree row are driven by `liveBar`, because nobody is reading them in a tab
that is not painting, and a highlight is exactly what `Draw` is for.

### Guide tones, not all the notes

A chord is landed when its **third and seventh** are played — not its root and
not its fifth. Requiring either would have marked down the rootless voicings the
curriculum spends its time teaching, and this app has said since M1 that "the
fifth of a dominant is the note nobody misses". The bass is playing the root
anyway, which is why comping is muted by default.

So F–A–C–E over a Dm7 is a hundred per cent, with no D in it anywhere. A sus
chord has no third and its fourth does that job; a sixth chord has no seventh
and its sixth does; a plain triad falls back to the third alone.

Notes are gathered over the chord rather than grabbed as a handful, for the same
reason `markGathered` was split out of `markPlayed` for scales: comping it,
arpeggiating it and running a line through it are all playing the chord, and
only the first survives being marked as one simultaneous grab.

### Silence is not a failure, and outside notes are not either

Two things are deliberately not scored.

**Chord occurrences nothing was played over are dropped, not failed.** Resting
through four bars, listening for where the form has got to, and sitting out the
count-in are all things a musician does on purpose. A score that fell every time
the hands came off the keys would measure how busy you are, not how well you are
playing.

**A note outside the key is reported and never counted against you.** The app
cannot tell a blue note from a wrong one — over the twelve-bar blues that is the
same E♭ either way — and the study panel already teaches going outside on
purpose. So the three tiers (chord tone, in the key, outside it) are descriptive
only, and the score rests entirely on guide-tone coverage. Nothing anywhere goes
red.

The key each note is judged against is the chord's **local** centre, which
`studyProgression` has already worked out. That is what makes the F♯ of a D7 in
C read as the chord rather than as an accident.

### Nothing new was added to look at

Three things say how it is going, and two of them were already on screen.

The **header pills** mark each sounding note by where it sits — solid for a
chord tone, faded for the key, outlined for outside. That row is where the eyes
already were; it is the feature, and the rest is support. Weight rather than
hue, because hue is carrying pitch everywhere in this app and cannot be asked to
carry a second meaning.

The **degree row** in the study inspector doubles as a checklist: tones played
since this chord came round stay lit, the others recede. Outside a run every
chip is fully lit exactly as before.

Only the **match strip** is new, and it is one element rather than two — the
running total and the final summary are the same fact caught at two moments, so
a separate results panel appearing at the end would have been a second thing to
learn to read.

### The open chord is folded in provisionally

Caught in the browser rather than reasoned out. A chord cannot be finally judged
until it is over — you may yet play the note that lands it — so the tally only
took it once it had passed, which meant playing a perfect first chord and
watching the panel go on insisting you had not started. It reads as broken.

The chord still under the hands is now folded into the displayed total
provisionally, so the number is live and firms up rather than jumping when the
bar turns. The tally proper is still only committed when the chord closes, which
is what keeps an occurrence from being counted twice.

### Nothing is written down

The run lives for as long as the page does. Persisting it would mean a schema, a
sync path and a place to read it back, and none of that was asked for — the
question was "did I get that one", which is a question about the last three
minutes. The tables M6 would need for the long view are still there, unused, and
this is not the thing that should quietly start filling them.

---

## The chart follows you, and the screen is allowed to celebrate

Two requests, one page. The first is plain: a sixty-bar form does not fit on a
screen alongside the setup panel and the chord study column, so the bar being
played walks off the bottom somewhere around the bridge — with both hands on
the keys and nobody free to scroll. The second is not plain at all: make
playing along _fun_, in the way the games on a phone are fun, with sparkles and
glow and a combo counter.

### The chart follows the music, and hands scrolling back when you take it

The live bar is kept in view with `scrollIntoView({ block: 'nearest' })`, which
was chosen because it does the least: a bar already fully visible causes no
scroll at all, so the page moves at row boundaries rather than shuffling every
bar.

Two details do the real work. `scroll-margin-bottom` is a whole row deep, so
the minimum scroll leaves the _next_ row on screen — landing the current bar
flush against the bottom edge is technically in view and useless to read from,
because you play towards the next chord and not at this one. And a deliberate
scroll wins for four seconds, read from `wheel` and `touchmove` rather than
from the `scroll` event, which cannot tell a person from our own
`scrollIntoView`. Without that, reaching for the tempo slider while the track
runs means being yanked back up on the next bar line.

Following stops the moment a chord is pinned for study, on the same terms as
the inspector: the same tap hands back both.

**One bug, worth writing down.** The first version read `liveBar` _after_ its
early returns. One turn of the wheel and the chart stopped following for good —
the run that returned early registered no dependency on `liveBar`, so the
effect never woke again. Every dependency is now read at the top of the effect,
before anything decides not to use it. This is the second time on this page
that the order of reads has been the whole bug.

### The fireworks are a switch, and the score is not behind it

On by default, and separated from the scoring by construction: `Tally` is what
happened, `Streak` is how loud to be about it. Nothing in the celebration feeds
the percentage on screen, so turning it off changes what the app celebrates and
never what it reports.

The rest of this app is built to stay out of the way of the music — flat
surfaces, motion that only explains a state change, no decorative anything.
That rule is suspended here by request, which is exactly why it needed a
switch rather than a redesign.

### Nothing goes red, still

The tone rules from the marking work survive intact. There is no effect for a
missed chord, no sound, no colour, no shake. A half-landed chord _holds_ a
combo rather than growing or breaking it, and only an outright miss resets it —
a combo that shattered on a missed seventh would be the first thing in the app
to tell you off, on a page whose whole design says silence is not a failure and
an outside note is a blue note as often as a wrong one.

The confetti at the end of a run is deliberately hard to earn: four chords
minimum and seventy per cent. A cannon that went off every time the stop button
was pressed would be worth precisely nothing.

### Colour is never invented

Every particle carries a pitch class and looks its colour up in the same
palette the wheel, the keyboard and the chart use — the edited one, passed in
from settings, not a copy. A spark that picked its own hue would be the first
thing in the app to lie about which note it belongs to.

That is also what makes the effects legible rather than merely busy: a chord
tone found sparks in _that note's_ colour, on the chip that just lit up; a
chord landed bursts out of the bar on the chart it was played over, in the
chord's colour; the glow around the edges of the screen is the colour of
whatever is sounding, so the room changes colour with the harmony.

### The physics is pure, and frame-rate independent

`sparkle.ts` is a particle simulation with the randomness injected, so a burst
can be asserted on exactly and the whole thing is testable without a canvas.
Drag is exponential and position is integrated by the trapezoid rule rather
than by Euler, which is what keeps a burst the same shape at 60Hz and at 120Hz
— a per-frame multiplier would have made the tablet and the laptop disagree.
An enormous `dt` is clamped rather than simulated, because Tone's draw queue
stops with the tab and coming back to a burst that has teleported off the
bottom of the screen looks like a bug.

The renderer stops scheduling frames the instant nothing is left to draw, so a
quiet page costs nothing at all.

### The glow sits behind the page, and that limit is the point

The obvious complaint about putting it behind is that every panel on this screen
is opaque, so most of it never shows — what you get is the gutters, the page
margins and the space under the chart. Blending it on top with
`mix-blend-mode: screen` reaches far more of the screen, and was tried and
rejected: it lands on the chart as well as the margins, and washing a second
colour over bars that are already tinted by their own root muddles the one thing
on this page that has to stay exact.

So the masking is not a shortcoming to work around. Being confined to the empty
parts of the screen is what makes it read as the room being lit from the edges
rather than as a filter laid over the work — and it is the only arrangement in
which a chord's colour on the chart still means only that chord.

Beat pulses run through the Web Animations API from the same `onBeat` the chart
highlight uses, cancelled rather than layered — at 300bpm the beats arrive
faster than a pulse decays, and stacked animations drift out of time with the
music. A CSS loop tuned to the tempo would have drifted from the first bar.

### Reduced motion turns the whole layer off

Not softened — off. It is an opt-in layer of decoration, and someone who has
asked their system for less motion has already answered the question.

---

## The suggested scales are drawn, not only named

"Try over it" has always answered the right question and answered it in words:
G♭ Lydian dominant, C harmonic minor, D♭ whole-half diminished. That is a
complete answer for someone who already knows the scale, and no answer at all
for the case it exists to serve — sitting at the keys wanting to know which
sharps and flats this chord will take.

So each suggestion now carries a keyboard.

### A suggestion had to stop being two strings

`ScaleSuggestion` was `{ name, reason }`, which is not something a diagram can
be built from. Parsing the notes back out of "G♭ Lydian dominant" was the
tempting shortcut and would have been backwards: the module that decided to
suggest that scale is the one that knows what it is, and a display string is
not an interchange format.

It now carries `root` and `scale` alongside the phrase — deliberately as well
as the name rather than instead of it, because the name is not always the
scale's own: the parent key of a diatonic chord reads as "B♭ major", not
"B♭ Ionian", and it should go on doing so.

`scales.ts` builds the notes the way `key.ts` builds a key — by stacking
spelled intervals from the root — and defers to `key.ts` outright for anything
that is already a mode, rather than writing the seven patterns out a second
time. The awkward-looking spellings in the table are load-bearing: the altered
scale has a _diminished fourth_ rather than a major third because it is the
seventh mode of melodic minor, which is what puts a C♭ in G altered rather than
a B.

### One octave, C to B, and never root to root

Root to root shows a scale's shape. A fixed C-to-B frame shows what you need
here: three suggestions stacked in a column are drawn on the same twelve keys,
so they can be compared at a glance, and any one of them maps straight onto the
instrument you are sitting at. Where the scale starts is already written
directly above the picture.

### Two weights, because hue is taken

A chord tone is solid and the rest of the scale is the same colour held back —
the same device the header pills and the degree row use, for the same reason:
hue is carrying pitch everywhere in this app and cannot be asked to carry a
second meaning. Keys outside the scale are left as plain piano keys rather than
being greyed out, which is what keeps the thing readable as an instrument
instead of as a chart of twelve cells.

The one picture therefore answers two questions at once. Which notes are
available, and which of them are home.

### The one place the spelling rule is relaxed

This app spells by stacking intervals and stands by the awkward results — G♭
major really does have a C♭ in it. That rule rests on one letter per degree,
and these scales are where the assumption runs out. The diminished scale has
eight degrees and there are only seven letters. The altered scale's diminished
fourth compounds every flat already in the root.

Spelled strictly, D♭ whole-half diminished comes out as
`D♭ E♭ F♭ G♭ A𝄫 B𝄫 C𝄫 C`. That is correct, and nobody has ever written it on
a chart or wanted to read it off a diagram. So double accidentals — and only
double accidentals — are traded for the plain enharmonic through the existing
`spellChromatic`, leaning whichever way the note was already leaning:
`D♭ E♭ F♭ G♭ G A B♭ C`. Single accidentals are left exactly as the intervals
produced them, C♭ included, and a test walks every scale in every key to make
sure no double accidental ever reaches a diagram.

### Dimming a swatch is not the same as diluting it

Reported from looking at it: the diagrams came out muddy, and the colours read
as slightly _different_ colours from the ones on the chart beside them.

Both were true and both were the same mistake. Each in-scale key was mixed
towards the key it sat on — `color-mix` to a light grey under the white keys
and to the dark ground under the black ones. Mixing a swatch with a neutral
takes its chroma down roughly in proportion, so every held-back note landed at
about half the chroma the palette authored, next to a chart and a keyboard
drawing the same twelve colours at full strength. And because the two mixes
pulled in opposite directions, one pitch class wore two visibly different
colours depending on which key it happened to fall on.

The fix is a third derived variable. `--pc-N-deep` joins `--pc-N` and
`--pc-N-ink`: the swatch with its lightness at seven tenths, hue held exactly,
chroma given up only where the gamut demands it. Seven of the twelve lose no
chroma at all; the tightest is F♯, the cyan sRGB already could not reach at
full lightness, which keeps about seven tenths of it.

It is computed in `palette.ts` with the existing `clampToGamut` rather than in
CSS. `oklch(from var(--tone) calc(l * 0.7) c h)` is the shorter route and was
tried first: relative colour syntax resolves fine through the custom property,
and it walks the reds and the yellow straight out of sRGB, where the browser
clips channels and takes the hue with them. Hue is the one thing these twelve
colours cannot afford to lose, which is why `clampToGamut` exists at all.

A multiplier rather than a fixed target lightness, because these swatches are
_meant_ to differ in lightness — E is a bright yellow and A a deep indigo — and
flattening them to one value would be a second kind of normalising nobody
asked for.

---

## Three things on screen, two columns to put them in

The chord study panel was meant to stay beside the chart for as long as you are
playing. Between 1024 and 1279px it did not — it sat underneath it, a full
chart's worth of scrolling away, which is the one place it was built never to
be.

### The template stopped describing the page

The grid wrapper picked its columns from whether the chart list was showing,
but only the `xl` template ever grew a third track. The `lg` template said two
columns in both cases. So with the list open there were three children and two
tracks, and grid did the only thing it can do: put the third one on a new
implicit row, in the wide column, 685px across and thousands of pixels down.

Nothing looked broken. That is what made it survive — the study panel was still
there, still correct, just no longer anywhere near your eyes, and only in a
256px-wide band of viewport that a desktop browser does not sit in by default.

### Narrower columns, not a wrapped one

Three ways out were on the table, and the other two both give something up.

Letting the list **span a row of its own** above the chart keeps the chart at
full width, but a full-bleed band of tune names is precisely the wall this list
was rewritten to stop being, and it pushes the chart down the page to make
room.

**Collapsing the list by default below `xl`** is not a fix at all, only a better
default. The preference is remembered, so anyone who chose to show the list on
a wide screen carries that choice down to a narrow one; and opening the list at
1100px to go and find a tune is a reasonable thing to want. The layout has to
hold when you do it.

So `lg` gets a real three-column template — `12rem`, the chart, `20rem` — with
the list and the study each giving up a couple of rem rather than the chart
giving up its place beside the study. The default did move to below `xl` as
well, because three columns are genuinely comfortable only at 1280 and up: the
narrow arrangement is now something you opt into for as long as it takes to
pick a tune, not the state you land in to practise.

### Sticky from `lg`, not from `xl`

Both side columns pinned themselves and scrolled internally only at `xl`, which
was consistent while `xl` was the only width they were columns at. Now that
they are columns from `lg` up, the pinning follows them down — otherwise the
study panel would have been placed correctly and then scrolled off the top of
the screen on the first chorus, which is the same defeat by a slower route.

---

## The streaks are kept

Three things, reported from actually using it. The combo did not reset when a
chord went wrong. The ladder ran out at sixteen when runs were reaching fifty.
And whatever you managed vanished the moment the transport stopped.

### A half-landed chord is a chord you got wrong

The first version let a `partial` hold the streak. The reasoning was the tone
rule this page is built on — silence is dropped, outside notes are reported and
never scored, nothing goes red — and a combo that shattered on a missed seventh
looked like the first thing here to tell you off.

It was right about the score and wrong about the combo. **Landing one guide
tone out of two is the commonest way to get a chord wrong**, which meant a run
of mistakes sailed past fifty untouched. A counter that survives your mistakes
is not counting anything, and the number stopped meaning what it appeared to
mean — which is a worse failure than being told you dropped one.

Only a fully landed chord continues a streak now. The non-punishment rule still
holds where it belongs: a chord you played _nothing_ over is still dropped
rather than failed, so resting through four bars costs you nothing, and a broken
streak still costs nothing but the number.

### A streak that ends says what it reached

Making it break is not enough if you cannot see it break. So a run of three or
more that ends puts its own number on the screen — `31×`, in ink rather than in
the chord's colour, drifting down where a celebration drifts up.

Stating the number reached rather than the mistake that ended it is the whole
distinction. `31×` is the record of a good run. Anything phrased as a loss would
be the exact scolding the previous section was trying to avoid, and would have
solved the first problem by creating the one it was afraid of.

### Six rungs, and the top one is a sitting's work

`3, 6, 12, 20, 32, 50` — the gaps widening by roughly half each time, so every
badge costs meaningfully more than the last. Fifty in a row is three passes of a
blues without dropping one.

Every tier carries a stable `id` as well as a name. Badges are stored under the
id, so the names stay free to change and a tier that disappears takes its badge
with it rather than leaving an unreadable entry behind.

### A badge wears the colour of the chord that won it

Badges needed a colour and the app has exactly one colour system, which is
already spoken for: hue means pitch, everywhere, and handing it a second meaning
would be the first crack in the thing the whole interface rests on. Bronze,
silver and gold were the obvious way out and belong to a different product.

So a badge simply remembers the pitch class of the chord it was clinched on, and
wears it. Nothing is invented, the rule is not bent, and the shelf becomes a
record of what you have actually been practising — a row of greens is a lot of
time on F.

A badge is kept from the **first** time it was earned, not the best. `best`
already answers "how far have you got"; a badge answers "when did you first get
there", and overwriting it on every pass would turn six dated milestones into
six copies of the same afternoon.

### All six on show, earned or not

A collection that displayed only what you had already won would be a trophy
cabinet. This is a ladder, and the use of it is seeing that twenty is next and
that fifty exists — so an unearned badge is an empty socket with the number it
costs written in it, and the only thing missing is the colour.

Two different "next"s turned out to matter, and collapsing them was a bug caught
in the browser: with five badges and a best of thirty-four the shelf said _three
more in a row for nice_. The rung the current run is climbing towards and the
first badge still missing from the shelf are different questions, and only the
first of them exists while nothing is playing.

### Local storage, not the database

The record is a `best`, a `best` per chart, and six badges — kept alongside the
player's other preferences. The tables the long view would need are still parked
and a combo counter is not the thing that should quietly start filling them.

`parseRecord` is unforgiving about shape and forgiving about failure: anything
that does not parse is dropped and the rest is kept, so a hand-edited or
half-written entry costs one badge rather than the whole shelf. A stored `best`
lower than a badge that was actually earned is corrected upwards — the badges
are the harder evidence.

---

## Every key in a suggested scale says what it is doing there

The diagrams under "Try over it" answered _which keys_ and stopped. Which of
them the scale actually starts on, which one is the flat seventh the word
_Mixolydian_ was promising, which is the ♯11 that makes a Lydian dominant worth
the name — all of it had to be reconstructed from seven note names, on a
picture deliberately drawn C to B and therefore never starting where the scale
does.

So every key in the scale now carries its degree as a Roman numeral, above the
note name.

### Degrees of the scale, not numerals of the key

Roman numerals already mean something a few centimetres higher up the panel:
`V7/vi`, the chord's function in the key. These mean something else — a single
note's place in one suggested scale — and two frames sharing one notation is a
real risk, so the second frame is pinned down by everything around it. The
scale's name sits directly above its own diagram. Every numeral is measured
from that scale's root and nothing else. And they are **uppercase, always**.

The uppercase rule is the part worth stating. Case carries chord quality
everywhere else here — `ii` is minor, `II` is not — and a lowercase numeral
under a single key would be claiming a quality for a chord nobody has built.
Case-by-quality was tempting, and would have said something genuinely useful
about a mode: that the IV of Dorian is major is the fact that makes Dorian
Dorian. It was dropped because it cannot be kept. Stacking thirds needs seven
notes and a third to stack; the blues scale has six notes, the whole-tone
scale six, the diminished scale eight, and the app suggests all three. A
convention that quietly stops applying to a quarter of the diagrams is worse
than no convention.

`formatRomanDegree` therefore lives next to `formatDegree` in `spell.ts` and
takes the same `{ degree, alter }` the whole app already uses. `analyse.ts` had
been carrying its own private copy of the numeral table and its own accidental
prefix; it now calls the shared one and lowercases the result when it means a
minor chord, which is the one place case is earned. A chord's numeral and a
note's degree should not be able to drift apart on the question of what a
fourth is.

### Measured from the scale's root, not from the chord

The other tempting frame was the chord: label each key `1 ♭9 ♯9 3 ♯11 ♭13 ♭7`
and tell an improviser what tension they are reaching for. That is a good
label. It is also already on the screen — the degree row above the keyboard
names every chord tone, in the same twelve colours as the diagram — and it
would have made the numerals under a scale whose root is _not_ the chord's into
a puzzle.

Those are common. B♭ melodic minor is suggested over A7♯9; C harmonic minor
over the G7 in a minor blues. Reading `VII` under the A, and `V` under the G,
is the lesson rather than the confusion: it is where that chord sits in the
scale you were just handed. Which note is home is a question the diagram
already answers, in fill rather than in type — the chord tones are solid, the
rest of the scale is the same colour held back.

It also makes the numerals the one thing on the drawing that does not move.
Twelve keys, C to B, means the scale itself slides around; `I` marks where it
starts, and the run of numerals is the mode's shape, letter for letter
identical on every root.

### The degrees are relaxed exactly where the spellings are

F♯ whole-half diminished contains an E♭. Strictly that is the ♭♭7 — a seventh,
because it is some kind of E — and every player alive calls it the 6.

This is the same collision the note spellings already hit, for the same reason:
eight degrees, seven letters. So `scaleDegreeIn` takes the same way out as
`readable` does one function above it, and through the same `spellChromatic`.
Spelled first, always: the F♭ in C altered stays `♭IV` rather than becoming
`III`, because it really is a diminished fourth and that is the whole character
of the scale. Only when the strict answer needs a **double** accidental is the
plain enharmonic degree used instead, leaning the way the note was already
leaning.

That also bounds the label. `♭VII` is now the longest a degree can be, four
monospaced glyphs, and a test walks every scale in every key to prove it —
which matters, because a black key on this diagram is 25 units wide and `♭VII`
measures 20.2 of them.

### Size, not dimming

The first version held the numerals back at three quarters opacity, on the
principle that an annotation should not shout over the note name.

Measured against the palest key a numeral can land on, that put it at 2.65:1,
where the note names sit at 3.49:1 — small type, on a diagram meant to be read
from a music stand at arm's length, made deliberately harder to read than the
type beside it. A label nobody can make out from where they are sitting is not
restraint, it is a label that failed.

So the numerals are full-strength ink and the hierarchy is entirely size and
position: two sizes smaller, one line above, the note name still hanging at the
end of the key. Both labels sit at exactly the same contrast as each other on
every key, which is the app's existing bar rather than a new one.

### Eight units taller, because the usable strip is not the key

A white key is only readable below where the black keys end. That strip was 36
units and one label; two labels squeezed into it left the numeral three units
under the black keys' ends, which reads as a collision rather than as a line of
type.

The keys went from 88 units to 96, and the black keys from 52 to 57 with them.
Both labels now hang from the end of whichever key they are on, at the same two
offsets, so the numerals form one clean band across the black keys and another
across the white: 6 units clear of the black keys' ends, 7 between numeral and
note name, 10 below. The diagram grew about ten pixels on screen, which is the
cheapest thing in this whole section.

### Spoken as numbers, not as numerals

The `aria-label` describes the same drawing as `C 1, D 2, E♭ ♭3, …`. Speech has
no use for a Roman numeral — `♭VII` comes out of a screen reader as "flat vee
eye eye" — and the degree is the content, not the notation it happens to be
drawn in.

---

## A record worth keeping, and someone to keep it for

Four requirements, and none of them is small: aim at multi-user, make the chord
badges belong to the tune that won them, track everything and put it on a
profile, and replace the chart importer with an editor that can be used without
guessing. The plan is in `ROADMAP.md`; what follows is why it has the shape it
has, including the two places where this reverses something written above.

### The reason that expired

Three separate places in this file decline to write something down, and all
three give the same two-part reason: the tables the long view would need are
still parked, and none of this was asked for.

The second half is now spent — it has been asked for — and it was always the
weaker half. The first half survives intact and turns out to say something
different from what it looked like it said. `takes`, `analysis_facts` and
`transfer_events` are shaped for analysis of recorded MIDI. **A streak record
does not fit any of them**, so "do not quietly start filling the parked tables"
was never an argument against persisting; it was an argument against persisting
into the wrong tables, and it still is. What is being built is new tables that
mean what they hold.

The part of that reasoning that was genuinely wrong is smaller and worth naming:
a combo counter is not what should start filling the long view, but the
per-chord judgements underneath it are exactly that, and they were being thrown
away every time the page closed.

### Accounts stop being an anti-goal

`auth.ts` says user accounts are an explicit anti-goal. That was true when the
only problem auth solved was standing between the internet and one person's
practice vault, and it is no longer the direction. It is recorded here rather
than quietly edited away, because it was a reasonable decision that has been
overtaken rather than a mistake.

What has not changed is the appetite for building accounts now. There is one
player, and registration, password hashing and email would all be machinery
serving nobody. So the decision is narrower than it sounds: **build the seam,
not the feature.**

### One seam, not a column on every table

The tempting version of "prepare for multi-user" is to put `user_id` on all
twelve tables now and backfill it with the one value there is. That is not
preparation, it is building it badly — twelve columns that are provably constant,
each encoding a guess about a question nobody has asked yet.

The seam is two things instead. A `users` table with exactly one row, and
`currentUserId()`, which every query touching owned data goes through from the
first day. Today it resolves to the seeded row; later it reads a claim off the
cookie. If that discipline holds, a second player is a change in one function
plus a login form. If it does not, no amount of columns would have saved it.

Tables get `user_id` when this work writes to them and not before. New ones
carry it from their first migration, and `charts` gets it because the editor is
rewriting how charts are entered anyway. `cards`, `srs_state`, `reviews` and
`sessions` wait — not because they will never need it, but because each poses a
real question (is the seeded skill graph shared, or copied per player?) that
cannot be answered honestly without a second player to answer it for.

The `users` table holds an id, a name and a timestamp. No empty `password_hash`
column waiting for accounts to arrive: nothing exists until it is reached, and a
column nothing writes is the same smell as a table nothing reads — which is the
thing that got the record button deleted.

### Some settings belong to the instrument, not to the player

The singleton `settings` row is where multi-user actually bites, and pulling it
apart turned up a distinction worth keeping. The twelve pitch colours exist to
match coloured stickers on real keys. The wheel calibration exists to match a
physical wheel that somebody built by hand. **Neither of those is a preference;
they are measurements of the room**, and two players sitting at the same piano
would want them identical.

So the singleton stays, holding what belongs to the instrument, and what belongs
to the player — session length, reveal delay, where they are on the ladder —
moves to a row of its own. The check constraint that pins the settings row to
`id = 1` never has to be dropped, which is the cheapest possible outcome for the
table that looked hardest to move.

Two values sit on the line and are recorded as unresolved rather than settled by
whoever happened to be typing: MIDI latency is a property of the cable, and how
wide a rolled chord may be before it stops being one chord is a property of the
hands. They will be decided when there is a second player to disagree.

### A badge belongs to the tune it was won on

Badges were global — six tiers, first earned wins, and once `nice` had been
taken it could never be earned again on anything. That made the shelf a record
of one afternoon rather than of the repertoire, and it made every tune after the
first one unrewarded.

Per-tune fixes it, and sharpens what a badge claims. Fifty in a row **on this
tune** is a much harder and much more specific statement than fifty in a row on
whatever happened to be playing; it is three clean passes of that form, which is
the thing anybody would actually want to be able to say.

The migration costs nothing, because a badge has recorded `chart` since the day
badges shipped. Every stored badge already knows which tune won it and moves to
that tune's shelf with its date and its colour intact. Nothing is invented,
which is the same standard the colour rule holds itself to.

### The shelf is a ladder on a tune and a record on the profile

"All six on show, earned or not" was argued from a real distinction: a cabinet
shows what you have won, a ladder shows what is next, and this is a ladder.
Per-tune badges do not weaken that on the tune — six empty sockets under a chart
still say that twenty is next and fifty exists.

On the profile it inverts. Thirty tunes with six sockets each is a hundred and
eighty mostly-empty slots, and a page composed largely of things you have not
done is not a ladder, it is a scolding with a grid layout. The profile shows
what was won. The same rule, applied honestly to a different question, produces
opposite answers in the two places — which is a good sign it is a rule rather
than a habit.

### The clock runs when the music does

"Hours played" is the number on a profile most likely to become a lie, because
every easy way to compute it is generous. Page-open time counts reading email
with a tab in the background. Session start to session end counts the evening
the browser was left open.

Counted: the transport running and not paused, plus practice blocks that
actually finished. Not counted: the page merely being open, a paused transport,
a session abandoned mid-block, time spent on Explore. Likewise "tunes
practised" counts a chart something was played over, not a chart opened.

This is the tone rule the score already follows, applied to a different number.
Silence is dropped rather than marked wrong; "you have not played yet" is not
the same statement as "you scored zero"; and an hour claimed is an hour where
something was actually sounding.

### No daily streak, and that is a design decision

Specified, and it also falls out of everything above. The chord streak counts
chords landed back to back — it measures playing. A daily streak counts days
attended, punishes a week away from the piano, and would be the first thing in
this app to tell anyone off. There is no calendar of dots, no days-in-a-row
counter, and nothing on the profile that turns a day off into a loss.

It is worth being explicit that this is a decision and not an omission, because
a profile page is exactly where somebody will later assume one was forgotten.

### A grid, not a paragraph

Every complaint about the chart importer is the same complaint: you cannot see
what it is going to do until it has done it. Bars are pipe characters, which is
a key nobody's hands are near. The written key silently governs every numeral
stored, so choosing it wrong produces a chart that is wrong in all twelve keys
identically — the one error the app cannot catch for you. `G7alt` parses as a
plain `G7` without a word. And the problems arrive as line numbers, after
saving, against a text box that now has to be re-read.

The fix is not a better error message, it is moving the whole check forward: a
grid of bars, chords parsed as you type and echoed back formatted, and the
numeral each bar will be stored as printed underneath it while you work. That
last part already exists — `check-chart.ts` prints exactly this — so the change
is largely about where it runs. Logic that has to live in a script the user
never sees is a user interface problem wearing a tooling costume.

Pasting `| Dm7 | G7 |` still works, because that path is how long transcriptions
and agent-assisted ones get in. It becomes an input to the grid rather than the
only way through it.

### The editor is not songwriting mode

Asked directly, and worth answering in writing because the guess was reasonable.
M8 was for inventing a progression that does not exist yet; the editor is for
entering one that is already on the paper in front of you. Different jobs, and
only one of them is blocking anybody today.

They do share a grid, which is the useful part of the answer: M11 should build
that grid as a component rather than as a page, and what is left of M8
afterwards is a blank one, a way to hear it, and export. That is a much smaller
milestone than the one currently parked, and it is smaller because of work being
done for another reason.

### What this unparks

The reason recorded for parking M6 was that the vault and the blind-spot report
could work sooner but not without the capture habit transfer detection was
supposed to justify. That has quietly stopped being true. Play along judges
every chord occurrence against the chord that is sounding, and writing those
judgements down is the capture habit — arriving from the other end, without a
single recorded take or a `recognise()` pass.

So the blind-spot report is unblocked and becomes a `GROUP BY`. The vault stays
parked, because nothing here produces recorded MIDI. Transfer detection stays
parked unchanged, for the reason it was parked in the first place: its consumer,
the mastery gate, is still deleted, and it would feed a report and nothing else.

## Verify checks this repo, not the copies of it

`npm run verify` started failing on files nobody had written. Prettier walks
from the repo root, and the agent worktrees live at `.claude/worktrees/` —
inside it. Each one is a complete checkout, so the format check was reading
three copies of the tree and reporting style issues against files that are not
this repo's working copy of anything.

The obvious guess was that the copies had gone stale, and two of them had: both
sat at older commits than `main`, both were fully merged, and they are gone now.
But staleness was not the fault. The worktree actually in use failed too, on the
five tracked files under `.claude/`, and it was sitting at exactly the commit
`main` was on. Same bytes in git, different bytes on disk — the copies had CRLF
where the originals had LF.

That is precisely what `.gitattributes` is here to prevent, and it is not
broken. `git check-attr` reports `eol: lf` inside a worktree and git honours it
on checkout. Those files simply do not arrive by checkout: the harness writes
`.claude/` into a new worktree itself, and on Windows they land with CRLF. A
line-ending rule in this repo cannot govern a file git did not put there.

So the ignore entry is the fix, and removing the dead worktrees was only the
tidying. Deleting them would have shortened the error and left the failure
standing, because the worktree in use breaks the check too, and so would the
next one anybody opens. What `.claude/worktrees` says is that this repo's style
rules cover this repo's own tree, and not whatever working copies happen to be
nested inside it while somebody is working.

---

## The chart editor, and a slash that was already spoken for

Typing a tune in meant a text box that wanted pipe characters, a key whose
consequences were invisible, and a list of line numbers after saving. Four
complaints, one shape: **you could not see what it was going to do until it had
done it.** So the checking moved to the keystroke, and one thing that had been
quietly wrong for as long as the importer existed had to be fixed first.

### The slash was already taken

`C/E` used to store as `C`. Not an error — a wrong chord, silently, in a tune
about to be practised for an hour, and the songbook notes had to warn about it
in prose because nothing in the app could.

The cause was smaller than it looked. `AbstractChord` has carried a `bass` field
since M1 and `parseChord` has always read it; the only place it fell off was
`romanNumeral`, because a numeral had nowhere to put one. The slash was already
spoken for: `V7/vi` is the dominant of vi.

The two are told apart by which set of numbers follows the slash. **Arabic is a
bass degree, Roman is an applied dominant.** `I/3` is C over E; `V7/vi` is still
E7. Nothing already written changes meaning, which is what made this additive
rather than a migration of every stored chart.

### Measured from the key, not from the chord

`G/B` in C could be `V/3` — the chord's own third — or `V/7`, the seventh degree
of the key. It is `V/7`.

Every other numeral in this app answers the question "where in the key", and the
root of that same chord is already answered that way. Two different origins in
one symbol would mean reading `V/7` required knowing which half meant what. It
also reuses the accidental-handling that resolving a root already needed, which
is why `I/b3` spells correctly in every key without a second copy of that code —
the two now share `degreeNote`.

### A bass note the bass player ignores has not been stored

Storing the bass and stopping there would have been the same bug with a longer
reach: the chart says `C/E`, the walking bass starts the bar on C, and the
disagreement is now between the screen and the speakers rather than between the
sheet and the database.

`walkingBass` takes the named bass on the downbeat, and aims at the next chord's
named bass when it walks. The inner beats still step through the chord — a slash
chord is an instruction about the bottom of the bar, not a bar of one note.

### The checking moved to the keystroke

A bar is a cell. Under it sits the numeral it will be stored as, and that is the
whole answer to the written-key trap: the key is not a label on the form, it is
the thing every numeral is measured from, so changing it moves the numerals
where you can watch them. If they stop making sense, the key is wrong — which
was previously discoverable only by saving the tune and playing it.

Under the grid sits what comes back out again. That is what `check-chart.ts` has
always printed, and it needed to be somewhere a person could see without
knowing there was a script.

### One implementation, three callers

`editor.ts` is pure and holds all of it. The editor calls it to show you the
bars as you type. The server calls the same functions before writing, and
derives the numerals itself rather than trusting the ones the browser worked
out — a browser is not the authority on what a chord means. The songbook script
calls it too, and lost its own copy of the round trip in the process.

Deriving one answer from one source in three places is the only reason the
screen, the database and the command line cannot end up describing different
tunes. The script's previous copy was already drifting: it tokenised the source
itself to line the bars up, which worked only because a chart with problems had
been rejected before it got there.

That refactor closed a documented gap for free. `alt` is lost on the way _in_ —
`G7alt` parses as a plain `G7` — so a round-trip check provably cannot see it,
and the skill file said as much. Catching it by name in the shared module means
the script catches it now too.

### Drift refuses the save

The old form offered to "save the understood bars". The editor does not: a chart
whose bars come back as different chords is not a chart of that tune, and the
non-punishing tone this app takes with _playing_ has never applied to data
integrity. What changed is that refusing is now fair — the editor has already
told you which bar, what it became, and that there is a way to write it that
survives.

Nothing goes red, still. The report sits in muted ink like everything else here.
A chord typed wrong while writing a tune down is not a mistake in playing; it is
a sentence still being written.

### The pipe syntax is an input, not the interface

Pasting `| Dm7 | G7 |` fills the grid. It is how a tune arrives from an email or
a transcription, it is what the songbook skill produces, and it is faster than
clicking for anyone who can touch-type. Removing it to make a point about pipe
characters would have cost the fastest route in and fixed nothing — the
complaint was never the syntax, it was being made to type it blind.

### `slug`, `mode` and `notes` stopped hiding in a JSON column

The slug is how a chart is addressed in a URL and how the built-ins are told
apart from yours, and it lived inside `grid_json` — so the page read every row
on every load and filtered them in application code against a value the database
could not see. They are columns now, with the slug unique.

The generated migration would have added `slug` as `NOT NULL` with no default,
which cannot work on a table with rows in it, and would have left the values it
needed inside the document it was replacing. It is hand-written: nullable, then
filled from the JSON, then tightened. A row with no slug of its own takes one
from its id rather than colliding with another untitled chart.

No `user_id`. It belongs on this table and is left to M9, which creates the
`users` table and the accessor every owned query goes through. Adding the column
first would mean inventing half of that seam early, and guessing at the half
that is actually a decision.

## Two chords the model could not hold

Transcribing Resurrections turned up a failure the round-trip check is
structurally unable to catch. `Am(add2)` came back as `Am` and `Ammaj7` as
`Am7`, and the checker reported both as clean — because it compares the _parsed_
chord against playback, and the loss had already happened by the time it looked.
This is the same shape as the `alt` problem, which is why `alt` was called out by
name rather than detected: a chord that parses into a different real chord is
invisible to a check that starts from the parse.

The `alt` answer was a warning. That works when the chord is genuinely
unwriteable, and it was the wrong answer twice over here, because both of these
are ordinary chords that a chart is entitled to contain.

### A minor-major seventh is a quality, not a minor chord with a suffix

`m` then `maj` fell through to the minor token and the `maj` was consumed as
nothing. There was nowhere for it to land: the quality list had no minor-major,
and `SEVENTH_FOR_QUALITY` maps `min` to a minor seventh, so even a `7` extension
could only ever produce the G natural.

It is now a quality of its own, with its seventh in the base intervals rather
than in the extensions — the same treatment `dom` gets, for the same reason.
Take the seventh away and there is no chord left, only a minor triad, so the
seventh is not something the symbol might decline to ask for.

The numeral spells it out: `imMaj7`, not a case distinction. Roman numerals carry
major against minor in the case of the letters and have exactly one bit to spend
there, which the minor third has already taken.

### An added tone is not an extension

`Cadd9` and `C9` differ by the one note that makes `add9` worth writing. Every
rule about extensions is wrong for it — that they imply the seventh, that the
symbol names only the top one — so it is a separate field rather than an
extension with a flag beside it.

`add2` and `add9` are kept apart. They are the same pitch class, and the second
sits under the third while the ninth sits above the chord; a page that writes
`Am(add2)` should not get `Amadd9` back. That distinction only survives if the
interval list stays in pitch order, because `closeVoicing` walks it lifting each
note above the last — so a second pushed onto the end arrives at the keyboard as
a ninth. The list is sorted, but only when something has been added: everything
else already builds it ascending, and a sort that can only be a no-op is a sort
that can only introduce a bug.

Parsing strips `add` before anything else reads digits. Left in, the `9` of
`Cadd9` is found by the degree match and the chord becomes a dominant — with a
seventh, which is precisely the note being avoided.

### What is still silent

`maj` alone still means `maj7`, so `Emaj` stores a D♯ that was never written.
That one is not a loss the parser can be blamed for — both readings are real
chords and the symbol is genuinely ambiguous — so it is documented in the
songbook notes next to `alt` rather than guessed at.

## Licence

AGPL-3.0-or-later. Recorded here because a licence is the one decision in a
project that other people are entitled to have explained to them.

### What it does not do

Worth stating plainly, because the AGPL has a reputation assembled mostly by
people who wanted permissive terms and did not get them. None of the
following changes:

- **Self-hosting is free and unrestricted.** Run it on a laptop, a NAS, a VPS or
  a company server. Nothing is owed. This is the free tier and it stays the real
  thing rather than a crippled one.
- **Forking is free**, including hostile forking. If this project is run badly,
  somebody else may run it better with the same code, and that possibility is a
  feature — it is the accountability that comes with taking contributions.
- **Reading, learning from and contributing to it are unaffected**, and there is
  no CLA and no copyright assignment. Contributors keep their copyright.
- **Charging money is allowed.** The AGPL is not a non-commercial licence and
  never was.

The single obligation lands on one kind of user: modify it, run the modified
version as a network service, and you must offer your users its source.
Everyone else is where they were.

### The cost, and it is real

The AGPL deters companies from adopting the code, because many have blanket
policies against it. For a harmony trainer aimed at individual musicians that
costs nothing anyone will miss, but it is a real narrowing and pretending
otherwise would be dishonest.

Some contributors dislike copyleft on principle and will not send patches to an
AGPL project. At this size that is a handful of people at most.

### One codebase, no proprietary fork

A hosted instance, were one to exist, would run the same code as the
repository. No open core, no stripped community edition, no features held
back. Secrets live in environment variables, which is where they already
live.

This is partly principle and mostly arithmetic: a solo maintainer running a
public core and a private fork is a solo maintainer doing everything twice, and
the second copy is the one that rots.

## Somebody else's account

The fifth requirement is that the hosted instance be offered to other people.
It arrives after the four that produced M9 to M11, and it does something none
of those did: it puts a date on _later_.

`ROADMAP.md` has the plan — M12 for accounts, M13 for the subscription. What
follows is why the shape is what it is, including the place where it reverses a
decision recorded above and the place where doing nothing turned out to have
been right.

### The seam was built for exactly this, and holds

"Prepare for multi-user now, build it later" was written when the second player
was hypothetical. The temptation at the time was to build the whole of it — user
columns on twelve tables, an empty `password_hash`, a login form nobody would
use. What was built instead was a `users` table with one row and one accessor
that every owned query goes through.

That decision is now being tested by the thing it was made for, and it passes.
Nothing in M12 is a migration of work done wrongly; it is rows arriving in a
table that already exists, through a function that already resolves them.
`currentUserId()` stops being a constant and starts reading a cookie, which was
the entire claim. The columns deliberately not added are added now, in the
milestone that can finally say what they should mean.

The lesson worth keeping is narrower than "build seams". It is that a seam is
worth building when it is one function and one table, and not worth building
when it is twelve columns encoding twelve guesses.

### The room stops existing

Here is the reversal. The M9 analysis argued that the twelve pitch colours and
the wheel calibration are not preferences but measurements: they match coloured
stickers on real keys and a wheel somebody built by hand, so two players at the
same piano want them identical. The singleton keeps what belongs to the room.

That argument was correct and is now void, because it quietly assumed the two
players are in the same room. A subscriber in another country shares no
stickers, no hand-built wheel, no cable and no laptop with anybody. Hosting does
not answer the question of who owns a setting; it deletes the entity the answer
appealed to.

So everything moves to the player, including the two values recorded as
genuinely unresolved — latency is a property of one subscriber's cable, and how
wide a rolled chord may be is a property of one subscriber's hands. They were
flagged as needing a second player to decide them. A second player decided them
by existing, which is not how anybody expected that to be settled.

The singleton is not dropped. It changes job: it becomes the defaults a new
account is born with. The check constraint pinning it to `id = 1` was called the
cheapest possible outcome for the table that looked hardest to move, and it is
cheaper than that — the table did not need to move at all, only to be re-read.

### A definition is shared, data is not

The other question left open was whether the seeded skill graph is shared or
copied per player, and whether charts you typed in are visible to anyone else.
Both fall out of one distinction rather than needing a policy.

`skills` is the curriculum. It is seeded, never authored at runtime, identical
for everyone, and re-seeding matches on `code` so editing it never orphans
review history. That is a definition, and definitions are shared. `cards` are
generated from it as a ladder is climbed, at a rate that is personal, carrying
FSRS state that is the most personal thing in the database. That is data, and
data is owned.

The same cut settles a smaller thing M9 had got slightly wrong. `charts` was to
take a `NOT NULL` owner backfilled to the one existing player — but `db:seed`
writes the built-in forms, cycles and standards into that table, so the backfill
would have handed the shared repertoire to whoever happened to be first. The
column is nullable: null is built-in, a value is yours.

Charts you typed in are private for a blunter reason: a hosted service where a
stranger's tune turns up in your list is a bug. Sharing is a feature nobody
asked for, and this file has a long record of what happens to those.

### Family accounts are the first half of M12, on purpose

The second player stopped being hypothetical before public registration or
billing was useful: a few family members are enough to exercise different
ladder positions, schedules, palettes and playing records. That creates a useful
cut through M12. The data and credential model has to be real; the machinery for
unknown people does not.

So the first account release is invite-only. The operator provisions an email,
name and generated temporary password with `account:create`; there is no signup
page and no email provider. Passwords use the platform's scrypt with the full
parameter set stored beside each hash. The alternative was magic links, but
making mail delivery the only entrance to a family test would have introduced
the first external service before it could teach anything about the product.
Password reset email is still mandatory before strangers can register.

The old local player keeps the fixed UUID every existing row already names. The
accounts migration gives it a deliberately unusable placeholder credential,
backfills cards and sessions to it, and copies the singleton settings into its
`user_prefs` row. A valid pre-account cookie remains accepted only while that
player's revocation epoch is zero. Provisioning the owner bumps the epoch, so
the compatibility door closes by itself instead of becoming a permanent second
login system.

New accounts copy the singleton as a template and own everything that can move:
cards and their schedules, sessions and their blocks, the whole settings object,
custom charts, runs and badges. Child tables keep learning ownership from their
parent. That makes deletion structurally plausible now, but public M12 is not
declared complete until a real cascade test, export/deletion UI, reset delivery
and database-backed abuse limits exist.

### The record has to exist before the account can be sold

The most useful thing this exercise turned up is not in the plan for either new
milestone. It is that M9 was already load-bearing for the fee and nobody had
said so.

Streaks and badges still live in `localStorage`. Sell an account today and a
subscriber signs in on the laptop to find their badges are on the desktop — not
lost, but not theirs either, because they belong to a browser rather than to a
person. An account whose contents live in one browser is not an account, and the
money would be buying a login and a nicer URL.

So M9 stays first, and gains a second justification it did not have when it was
written for a single player who could not tell the difference.

### The provider sits behind a seam, and stays there

Provider selection is a commercial decision — cost, settlement speed, and the
tax mechanics of selling across borders all bear on it — and none of that
belongs baked into the schema. So `provider` is a column and `entitled()` is
a single function, and whichever provider ends up live behind them can change
without anything else in the app noticing.

What the seam has to hold onto regardless of provider: hosted subscribe,
change and cancel pages, so none of that UI is built or maintained here, and
a webhook-staleness guard, because retry windows are not something any
provider guarantees generously — see the next section.

The full comparison that led here — cost, tax treatment, which provider hosts
which pages — is commercial reasoning rather than architectural reasoning,
and it is tracked outside this repository. What earns a place in this record
is the seam, because the seam is what the rest of the codebase actually
depends on.

### Webhooks stop being the source of truth

One design consequence follows from keeping the provider behind a seam and
deserves its own note, because it looks like an implementation detail and is
not.

Some providers retry a failed webhook for days. Others give as little as half
an hour of tolerance for an endpoint being unreachable before giving up —
less than one bad deploy. An integration that assumes the generous case can
get away with treating the webhook as the only mechanism that ever makes the
local row true. One that does not assume it, cannot.

So the subscription row carries `checked_at` and is re-read from the provider
when it goes stale. Webhooks become an optimisation that keeps it fresh rather
than the sole path to correctness, and a missed event costs a lazy read
instead of a subscriber quietly losing access on a Sunday.

This would be the right shape on any provider. The narrower the retry window,
the less optional it is.

### Lapsing is read-only, and that is a tone decision

The scoring rules in this app drop silence rather than marking it wrong. The
profile refuses a daily streak because it would be the first thing here to tell
anyone off. A lapsed subscription is the same question wearing a suit.

So a lapsed account keeps signing in, keeps reading its own history, and keeps
being able to export all of it. What stops is starting a session and saving a
run. Nothing is deleted for non-payment and nothing is held hostage — an app
that has never once scolded anybody does not open its commercial career by
locking a year of practice behind a single missed renewal.

The free tier question answers itself for the same reason. The software is
copyleft, self-hostable and documented, so the free version already exists and is
the real thing rather than a crippled one. The fee buys somebody else keeping a Postgres
alive. Nothing has to be taken away from anyone to make it worth paying, which
is a comfortable position arrived at by accident, a long way back, by making the
thing open in the first place.

### What this costs the project, honestly

Two properties currently advertised stop being true, and they are worth naming
rather than letting the copy quietly change.

The first is that there are no external services. Accounts need e-mail — for a
reset, or for a magic link, but for one of the two — and that is the first
outside dependency this project has ever had. It sits on the path into an app
somebody has paid for, which is why passwords are recommended over magic links:
a password degrades better on the morning the mail provider is having a bad day.

The second is bigger and is the actual price of admission. "Your practice data
belongs on your machine" stops being a promise about everybody and becomes a
promise about self-hosters. Other people's practice history lands in a database
someone else is responsible for, which is what a controller of personal data is,
and it brings backups that have been restored at least once, an export, a
deletion that actually deletes, terms, and a privacy policy. The export and the
deletion are built in M12 rather than left to the legal page, because a right to
erasure implemented as a promise in prose is a schema bug with good manners.

The landing page currently sells the opposite of all of this — _one musician per
instance_, _no user accounts_ — and none of it is edited until M12 ships, per
the rule that the app must not hint at what it cannot do. The replacement keeps
both halves true and apologises for neither: run it yourself, or let somebody
else run it for you.

## M9 and M10 — the record, and the page that reads it

The plan is deleted from `ROADMAP.md`, per that file's own rule. What follows is
what building it actually taught, which is mostly the places where the plan was
right and one or two where it was not.

### The local player has a fixed id

Not in the plan, and it removes a whole class of problem. The seam needs a
`users` row for the foreign keys to point at, and the obvious way to make one is
`gen_random_uuid()` in the migration. The obvious way is wrong here: cookies last
ninety days, `verifyToken` names a user in the payload, and a database rebuilt
from scratch would hand out a new id — so every cookie in circulation would name
a row that no longer exists, and the first insert after that would fail on a
foreign key rather than on anything a person could read.

So the local player is `00000000-0000-4000-8000-000000000001`, written once in
the migration and once in `user.ts`. It is the same trick as pinning `settings`
to `id = 1`, for the same reason: there is exactly one of these, the value is
recognisable on sight in every foreign key, and `currentUserId()` needs no query
at all to resolve a claim. A constant duplicated in two files with a comment on
each beats a lookup on every request that can only ever return one answer.

### `verifyToken` returns a claim, not an id

The plan said it would return "the id or null instead of a boolean". It cannot,
quite, and the reason is the one requirement that mattered most: **nobody gets
signed out by this change.** A cookie minted before M9 carries a timestamp and
no user, and it is a perfectly good session — so there are three outcomes, not
two: refused, valid and named, valid and naming nobody.

It returns `{ userId: string | null }` or null. The payload is signed whole
rather than in halves, so the user and the timestamp cannot be swapped
independently; there is a test for exactly that, because it is the kind of thing
that is obviously fine until it is obviously not.

`event.locals` carries the raw claim and `currentUserId` is the only thing
allowed to resolve it. That is not ceremony — it is the difference between one
place to change when accounts land and a search across every query.

### The migration has to know which charts were built in

`charts.user_id` is nullable, and the null means something: shared repertoire,
seeded from code. A value means yours. The plan settled that. What it did not
say is how the migration tells one from the other in a table that already holds
both, and the answer turns out to be unpleasant in a way worth recording: it
hardcodes the eighteen built-in slugs.

The alternatives were worse. Leaving every existing chart null would have made
the tunes somebody typed in read as built-in for ever — invisible to the owner
query today, and handed to a stranger on the day accounts land. Discriminating
on `style = 'custom'` does not work, because half the built-in standards are
`custom` too. A migration is a statement about what was true at one moment and
it only runs once; a list of slugs correct at that moment is exactly the sort of
thing it is allowed to contain. It ran, and it claimed three charts and left
five shared, which is the right answer.

### A run ends when the transport restarts, not only when it stops

The plan said one row per run of the transport, and the page said a run is one
press of play to one press of stop. Those agree until you change the chart or
the loop while the music is going, which calls `track.start()` again — the form
returns to the top and the tally on screen is cleared, because what was counted
is not part of what follows.

One row records one chart in one key at one tempo. A row spanning a chart change
could not honestly say what it was played over, so those moments end a run and
begin another. That is not bookkeeping pedantry, it is the row's own claim being
kept true. It also means a sitting spent drilling two bars produces several rows
rather than one, which is a better description of the sitting than one row would
have been.

A run is written only if the transport actually ran for a second. Below that
nothing was played and nothing was heard, and a row saying otherwise is a
double-tap of the play button pretending to be practice.

### `best` is gone, and the reconciliation went with it

`parseRecord` used to reconcile a stored `best` against the badges, because the
two could disagree and the badges were the harder evidence. That code is
deleted, not fixed. A streak cannot outlive the transport, so `MAX(best_streak)`
over the runs is the only answer and there is no second copy to argue with it.
The done-when asked for the two to agree without reconciliation code; they agree
because there is nothing left to reconcile.

The shelf does show the run under way against both bests, which is not a stored
value but a `Math.max` against the streak in progress — otherwise landing a new
personal best means watching the shelf quote the old one for the rest of the
sitting.

### The outbox merges, and settles by id

Local storage stopped being the record and became a write-through cache. The
interesting part is not the caching, it is what happens when a post fails.

Everything waiting merges into one flush rather than queuing as separate posts,
because a sitting spent offline should arrive as one request and the far end
treats replays as no-ops anyway. And what is cleared afterwards is exactly what
was accepted, matched by id, rather than the whole key — because a run that
finished while the previous post was in flight would otherwise be thrown away,
and that is precisely the sitting where somebody is playing hard enough for it
to matter. There is a test named after that case.

The badges that lived only in a browser reach the record the same way: on the
first load after this shipped, anything the cache knows and the database does
not is queued as a badge with no run. The unique constraint means doing it on
every load costs nothing after the first, so there is no migration flag anybody
has to remember to remove.

### The profile counts chords, not minutes, and says so

The plan asked for "hours by key and by chord quality, straight out of
`chord_attempts`". It cannot be done honestly. A run knows how long it lasted; a
chord does not. Splitting a run's minutes across its chords by count is an
estimate, and the done-when for this page is that none of its numbers is one.

So the panel reports chords judged and how they went, and a sentence on the page
explains why it is not minutes. That is a smaller claim than the plan made and a
true one, which is the trade this project keeps making. Everything else survived
intact: the clock counts the transport running and not paused plus practice
blocks that finished, and "tunes practised" counts a chart something was played
over rather than one opened.

`practiceTotals` filters on no user at all, and that is deliberate rather than
forgotten. `sessions`, `session_blocks` and `reviews` were left without an owner
because each poses a question that cannot be answered without a second player.
There is one player, so it is one player's total, and the query lives in one
place so that the day it stops being true there is one thing to change.

### Two guards that are not needed today

A chart id arriving with a run is checked against the charts that caller owns,
and the delete action scopes to the owner rather than trusting an id off a form.
Neither can currently be violated — there is one user — and both are here
anyway. "It happens to be true" and "the database will not let it be otherwise"
are different guarantees, and the second is the one M12 will be glad of.

### What a badge now knows

It records the key it was won in, which the old one did not. A badge carried in
from local storage gets an empty key rather than a guessed one, and the shelf
simply omits it. Inventing a plausible key for an old badge would have been the
one thing the colour rule has always refused to do: nothing on a badge is made
up, which is why its colour is the pitch class of the chord that clinched it
rather than a tier.

## The profile earns its colour, and the instance goes public

Two changes on the way to a deployed instance: the profile stopped being a wall
of grey numbers, and "there is one player" stopped being a thing that merely
happened to be true.

### Colour on the profile is derived, never decorative

The first version of the page was deliberately monochrome, on the grounds that
hue means pitch everywhere in this app and cannot be handed a second meaning. It
was right about the rule and wrong about the conclusion, and the mistake is
worth writing down because it is an easy one to repeat.

**A key has a tonic. A tonic is a pitch.** Colouring the by-key bars by their
tonic's swatch is not a second meaning for hue, it is the first one, applied
where it happens to be useful — and it makes the panel say something the numbers
did not: a row of greens really is a lot of time on F. The old comment claimed a
bar chart of keys would make hue mean "row". That was simply a misreading of the
app's own rule.

The rule then does the rest of the work, and it does it by refusing things. A
chord quality has no pitch, so those bars are drawn in weight — the same
language the note spread already uses on the play-along page. Landing a chord is
not a pitch, so the landed/part/missed meter is weight too. Nothing on the page
is coloured because the page looked bland; every colour on it is a pitch, and
the greyness of the rest is the rule holding rather than an oversight.

### Twelve swatches say more than the panel under them

The addition worth having is a strip of the twelve keys in circle-of-fifths
order, each filling with the chords judged in it. Modes fold into their tonic,
because B♭ major and G minor are the same seven notes under the hands and the
question being answered is which corners of the keyboard you have been in.

It needs no prose. Five pale outlines in a row is the blind-spot report arriving
about a milestone early, and it arrives without telling anybody off — an unplayed
key is drawn as an empty socket, exactly like an unearned badge, rather than as
a gap with a number attached to it.

The swatches stand upright and fill from the bottom rather than lying on their
sides. Twelve horizontal bars sorted by length is a ranking, and a ranking is
the wrong idea here: no key is supposed to win.

The panel hides itself until something has been played along, which is the
ladder-versus-cabinet rule applied once more. Six empty sockets under a tune are
a ladder — they say twenty is next and fifty exists. Twelve empty keys shown to
somebody who has only ever done practice sessions are a wall of things they have
not done, which is the one thing this page must never become.

### The log stores keys the way the schema says to

`chord_attempts.local_key` was being written by `formatStudyKey`, which produces
`B♭ major` — a display string with a real flat sign in it. The schema's own
conventions say a key centre is `C`, `Eb`, `F#`, and that spelling has to
survive a round trip through the database. `B♭ major` does not: `parseKey`
cannot read it back, so nothing could tell which pitch class a row was about,
which is exactly what the colouring above needs.

It writes `formatKey` now — `Bb`, `F# dorian` — and the profile parses it and
prints it with the accidental. The bug was invisible for as long as the column
was only ever shown as text, which is the usual way a violated convention gets
noticed: not when it is broken, but the first time something tries to use it.

### One player, enforced rather than observed

`currentUserId` used to hand back whatever the cookie claimed, falling back to
the local player. That was safe by circumstance — the server mints every token
and always names the same user — and circumstance is a poor thing to rest on
once the instance is deployed and the file is one edit from meaning something
else.

It now collapses every claim to the local player. Nothing creates a user row, no
route registers anybody, the migration seeds exactly one, and so a cookie naming
somebody else is not a user; it is a string. Honouring it would have meant the
number of accounts this app supports was decided by what happened to be in a
browser. There are tests, and they are written so that they fail when M12 lands
— which is the reminder that `SECURITY.md`, the README's opening claim and the
landing copy all have to change in the same release.

**No sign-up exists anywhere in the app, and that is the decision rather than
the absence of one.** Hosted accounts are not open, the legal and financial
questions behind them are not settled, and a page that says "coming soon" is
still a page hinting at something that does not exist. The demo's only exit
stays "run it yourself", which is a real offer and has been since the licence
moved.

### A flush is bounded as a whole

The endpoint capped runs per post and chords per run, which multiply: a hundred
runs of twenty thousand chords is two million rows in one transaction. The cap
that matters is the one spent across the whole post, oldest run first, and runs
past the budget are still written — losing the chords off the end of a long
sitting is a smaller loss than losing that the sitting happened, and the run's
own totals do not depend on its attempt rows.

## Grooves

### A feel was two things wearing one name

`Feel` was `'swing' | 'straight'`, and it did exactly one honest job: it moved
the offbeat eighth from halfway through the beat to two thirds of the way. Then
it did a second job it had never been given, which was to stand for the whole
rhythm section. There was one drum pattern — a ride cymbal playing
spang-a-lang — one bass player, who walked, and one way of comping, which was
sparse and pushed. Picking "straight" got you that same jazz trio with the
eighths evened out.

So a pop tune played over this app arrived with a walking bass and a ride
cymbal, and there was no control anywhere that could do anything about it. The
two chips were not restrictive because there were only two of them. They were
restrictive because they were the wrong noun: a subdivision was being asked to
name an arrangement.

The feel is still a feel and still means the one thing. What the player picks is
a **groove** — a kit, a bass style, a way of comping, and the feel those are
played with. There are eight: swing, straight, shuffle, rock, pop, ballad, bossa
and funk. The first two keep their names, because those names were never wrong
about the music, only about their scope, and because a preference or a logged
run written before this existed still means what it said.

### The bass had to move before anything else would

Changing the drums alone would have got nowhere. A backbeat over a walking bass
is a jazz trio with a rock drummer sitting in, which is a worse noise than
either. So `bass.ts` gained four lines to sit beside the walking one: roots held
for the whole chord, root and fifth in two, the root–fifth–sixth–fifth boogie
that is most of what a blues bass player does, and roots on every beat with an
eighth-note pickup into the change.

`walkingBass` was not touched. It is the only line here with somewhere to get
to — the one that has to know what chord is coming — and it had tests that were
worth keeping green as evidence that nothing about the jazz grooves moved.

What did move is how long a bass note is held. Every note used to last 0.86 of a
beat, which was right when there was a note on every beat and nothing else. A
ballad's root has four beats to itself, and 0.86 of one would have been a bass
player playing staccato with three beats of silence after each note. The
duration now comes from the gap to the next note, which yields exactly 0.86 for
a walking line and holds everything else for as long as it is supposed to ring.

### The voicings are the same in all eight

The comping styles differ in rhythm and nothing else: when the chord is struck
and how long it is held. It is tempting to give rock its triads back with the
root in them, but the bass has the root in every groove here, and the reason the
comp is rootless is the bass, not the genre. A groove is a rhythm. Making it a
voicing rule as well would have been two changes hiding in one word again, which
is the mistake this whole section exists to undo.

### A chart says what it is

A tune needs more than a chord grid to arrive as itself. The blues opened at 120
in swing, which is a blues nobody plays; a pop tune typed in by hand opened as
jazz in C whatever key it was written in. So `charts` gained `default_groove` and
`default_key` beside the `default_bpm` it already had, and choosing a chart now
brings all three.

The key is the interesting one, because it is the only one that is sometimes
absent and the absence means something. A form has no key: a twelve-bar blues is
a twelve-bar blues in all twelve, and dragging the key back to C on the way past
would undo the one setting a practising musician most often makes deliberately.
So `default_key` is null for every built-in, and null is the claim rather than a
missing value. A song does have a key, and it is the key you wrote the chart down
in — which the editor already asked for, to decide the numerals. Storing what it
had rather than asking again is one fewer field and one fewer chance to
contradict yourself.

Three new forms come with it, because eight grooves and nothing to play them
over is a control panel rather than a feature: the four-chord loop, the doo-wop
turnaround, and the ♭VII rock vamp. All three are generic devices in the sense
the file already means it — nobody's composition, and the raw material of a few
thousand of them.

### A column called `feel` holding `'rock'`

`play_runs.feel` was renamed to `play_runs.groove`, by rename rather than by
drop and re-add, so every run already logged survives with its swing or straight
meaning exactly what it always did. The endpoint reads `groove` and falls back to
`feel`, and the player reads both out of `localStorage` the same way — a browser
can be holding an unflushed run or a set-up sitting written by the old page, and
losing an evening's playing to a renamed field would be a poor trade for a
tidier column name.

### The one drop, which is mostly a silence

Reggae is the ninth groove, and it is the one where the defining gesture is
something that does not happen. Beat one has no kick and no snare on it — the
kick and the snare land together on three instead, and the hole where the
downbeat should be is what the name is about. Put a kick on one and it is a slow
rock tune immediately.

The hi-hat plays eighths with the offbeat _louder_ than the beat, which is the
other half of the lean. That is one number, and it is the difference between
this and the ballad kit.

The comp earns its own style rather than borrowing one. The skank — a short
chord on every offbeat and nothing anywhere else — is the most recognisable
single thing in any groove here, and it is also the reason this is the one
groove whose note tells you to turn comping on. Comping is muted by default,
correctly, because the usual reason to run a backing track is to comp for
yourself. A reggae backing with the comping off is a bass and a drummer and no
reggae.

The bass rests on three, where the drums are, so the two interlock instead of
doubling. It does not rest on beat one, though plenty of real reggae lines do:
a backing track has a job a record does not, which is that the chord has just
changed and you have to be able to hear what it changed to. That is a deliberate
departure from the idiom and it is the only one here.

### An edit action, and a slug that does not follow the name

Charts could be created and deleted and nothing else, which was survivable while
the only thing a chart carried was a tempo and was suddenly not once it carried
a groove and a key as well. Getting the groove wrong and having to delete the
tune and type it in again is not a workflow.

So `update` exists, and `create` and `update` now read their submission through
one function. That is not tidiness for its own sake: the validation is the part
that decides what a chord means, and two copies of it would eventually disagree
about a chart depending on which button was pressed.

**The slug is frozen at creation and stays frozen through a rename.**
`play_runs.chart_slug` and `badges.chart_slug` are strings rather than foreign
keys — deliberately, so that a run over a built-in has something to point at —
which means a slug that followed the name would orphan every run logged and
every badge won on a tune the moment somebody fixed a typo in its title. The
name is what you read; the slug is what the record is filed under; those are
allowed to differ, and here they have to.

The update is scoped to the owner and not just to the id, exactly as `remove`
already was. An update that trusts an id from a form is the same bug as a delete
that does.

### A chart has to come back out as something readable

A chart goes into the database as Roman numerals and the editor works in chord
symbols, so opening one for editing means realising it back — through
`realiseChart`, the same function the player uses to put a chart into a key, in
the key it was written in.

The round trip is the whole of this feature's correctness, so it is tested
rather than assumed: every chart, in all twelve keys, out to symbols and back to
numerals, has to play the identical chord in every bar. Two hundred and fifty
assertions for a button, which is the right number for a button that silently
rewrites your chords if it is wrong.

The test asserts on the chords and not on the numeral strings, because those are
not the same claim. `charts.ts` writes a diminished chord by hand as `#iv°7` and
`romanNumeral` produces `#ivdim7`. Both resolve to F♯dim7. Asserting the strings
match would be asserting about spelling and would fail over a difference nobody
can hear — and the second test covers what that leaves open, which is that the
round trip is a _fixed point_: whatever normalising happens, happens once.

### A refused save used to lose the grid

The editor's own comment said a refused save comes back with what was typed so
nothing is lost. The chords were not among the things it came back with — the
failure payload carried the name, key, mode, tempo and notes, and `initial.text`
was never set by anything. Type in thirty-two bars, get one bar wrong, and the
save is refused and the thirty-two bars are gone.

It carries the grid now, rebuilt in the shape `parseIntoGrid` reads. It carries
the chords **as typed** rather than as read back, because telling somebody that
bar three would come back as a different chord and then replacing bar three with
that different chord is the editor arguing with itself.

## Words

### Two traditionals, and a category that says why they are here

`charts.ts` lets in public domain standards on one condition: US publication in
1930 or earlier, with the year recorded on the entry so the claim can be checked
rather than taken on trust. Mango Walk and Linstead Market are Jamaican folk
songs. They have no author to credit and no first publication to record, so the
field that exists to make the claim checkable had nothing true to put in it — and
inventing a year to fill it in would have been the exact opposite of what that
field is for.

So they go under a category of their own. `traditional` **is** the claim, in
place of the year: these are nobody's composition in the same way a twelve-bar
blues is nobody's, and saying so plainly is more honest than a number that looks
like evidence and is not.

Both open in `reggae`, which is an anachronism and a deliberate one — they are
mento tunes and predate the groove by decades. It is what they were asked for
and it is what they sound good over.

### The words go under the bar, and the bar is already lit

A chart sheet aligns words to chords. That alignment is the only timing anybody
actually wrote down, so it is the only timing this stores: a fragment per bar,
lighting up when the bar does.

Spreading those words evenly across the bar's four beats was the obvious next
thing and would have been worse. Nobody sings evenly. A cursor stepping word by
word would look more precise while drifting away from where the singer is
actually going, and a practice tool that invents the one quantity its user is
listening for is not being helpful, it is being confident. Bar-level is what the
data supports, so bar-level is what is drawn.

It costs almost nothing to render, which is the sign it was put in the right
place: `is-now` is already on the bar for the chord highlight, and the lyric line
simply reads it. There is no second highlight, no second clock, and nothing new
to keep in sync with the transport.

**A chart with no words draws nothing at all.** Not an empty row, not a
collapsed one — the markup is not emitted. The requirement was that an
instrumental look exactly as it did before lyrics existed, and the only way to be
sure of that is for there to be nothing there. Within a chart that _does_ have
words, a wordless bar still gets its line, invisible, so the row keeps a straight
baseline instead of the bars jumping about at different heights.

### The format a song actually arrives in

Nobody hands you a grid and a separate list of lyrics. They hand you chords
spaced out above the words, which is what a songbook, a forum post and an email
from the person you are playing with all use — so that is what the editor takes.

A chord's column in the line above is a claim about which word it lands on.
Turning that claim into "these words belong to this bar" is the whole of
`lyrics.ts`, and the one piece of judgement in it is that a hand-typed column is
approximate: it is eyeballed, often against a different font from the one you are
reading in, so a chord very often sits a character or two inside the word it
belongs to. Cuts snap to the nearest word boundary, which is what turns
`did a-tel|l me` into a split a person would have made.

Two things this refuses to do. It will not read a line as chords unless _every_
token on it parses as one, because "A man walks in" is not a bar of A. And it
will not claim a lyric line twice.

Faithful is not the same as right. Where a sheet's spacing is loose the split
lands where the sheet said, not where the tune goes — the words for both
traditionals here were placed by ear rather than by the column arithmetic. The
editor shows every fragment in an editable box for exactly that reason: the
parser gets you most of the way and then you fix the two bars it got wrong.

### One filter for the chords and the words

`gridToRows` drops empty bars, and empty rows after that. The words have to be
dropped in precisely the same places or every lyric after the first blank bar is
sung over the wrong chord — a bug that would be silent, would only show up in the
middle of a tune, and would look like a transcription mistake rather than a
missing filter.

So the lyric rides on the bar through `readGrid` rather than travelling beside
it, and `lyricsToRows` and `gridToRows` share the function that decides which
bars survive. They cannot disagree, rather than merely being written today in a
way that agrees.

### `vii` could not say "minor"

Adding a reggae tune with a G♯m in A major turned up a round-trip bug that had
been sitting there since charts were first stored as numerals. `romanNumeral`
wrote it as `vii`; `chordFromNumeral` read `vii` back as the key's own chord on
the seventh degree, which is diminished. G♯m went in and G♯dim came out.

Both halves were behaving as designed. A bare lowercase numeral _should_ take
its quality from the key — that is what makes `ii` and `vi` readable without a
suffix, and it is what every chart does. The gap is the one chord the convention
has nowhere to put: a plain minor triad on a degree whose diatonic chord is
diminished.

The fix is on the writing side. `viim` already read back correctly, because a
suffix naming a quality wins over the key's — so the analyser now spells the
minor, and only in the case that needs it. Reading is unchanged, which matters:
changing the reader would have quietly re-pointed every `vii` in every chart
already stored, while writing more explicitly can only ever add information to
charts written from here on.

The drift check caught it before anything was written, which is the entire
reason that check runs before every save and refuses the chart rather than
warning about it. It is the third time now it has stopped a wrong chord rather
than a crash.

### The songbook script had been writing charts nobody could see

`add-chart.ts` predates the migration that made `charts.user_id` mean something,
and it never set one. Null used to mean nothing in particular; since that
migration it means **built-in and shared**, and the play-along page fetches your
charts by owner. So every chart added with the script went into the table, was
never shown under Yours, and would have been handed to a stranger on the day
accounts land.

It writes the local player now. The same edit gave it the two things it had also
fallen behind on — a groove and a home key — and taught the check script to
print the words under the bars they are sung over, because a split in the wrong
place is not an error and nothing downstream will ever complain about one.

## M15 — the practice room, rebuilt around the band

The plan is deleted from `ROADMAP.md`, per that file's own rule, and the status
is in the README table. What follows is what building it taught over five
phases — including the three places the plan was wrong, one of which the record
had already answered, and one musical bug that was caught in review rather than
by a test.

The milestone started as four complaints about daily use, stated plainly: the
session orbits one subject, it ends too easily, tomorrow looks like today, and
half of it is a worse version of a page that already exists. All four were true,
and the useful thing about them is that every one of them turned out to have a
cause in the code rather than in taste.

### Four complaints, and a cause in the code for each

**One subject.** `startOrResume` narrowed every drill to a single skill code on
every path, _including the default_. `focusSkills` was always exactly one entry,
so twenty minutes orbited a rung holding between one and seven facts, asked four
ways. The narrowing had been written as a courtesy — a chosen focus narrows the
drills — and nobody noticed it also applied to the day nobody chose anything. A
courtesy applied to a choice not made is a cage.

**Ends too easily.** Blocks were sized by a timer and filled from the FSRS due
pile, and FSRS exists to make that pile small. A well-run deck has almost
nothing due, so "Nothing due for this block today" was the _normal_ sight and a
twenty-minute session could be clicked through in three. Worse, the timer
measured nothing: no block ever ended because of one. The scheduler was doing
its job; the session had been built as though the scheduler's leftovers were a
syllabus.

**The same thing tomorrow.** Composition was static — six blocks, same order,
same copy, forever — and the only input that varied was the due pile, which
varies towards _less_. The one block named for novelty showed the same rung text
every day until the ladder was advanced by hand on the home page, which made it
the most repetitive thing in the app.

**Already practised elsewhere.** The warm-up asked `see_play`, and a chart on
the play-along page _is_ `see_play` with a rhythm section behind it and
chord-by-chord judging in front. "Name what you play" was `/play` with a timer
on it. "Apply it" embedded `BackingControls`: `/backing` with fewer knobs, no
scoring, no streaks, no badges and no record. A player who drifts to the better
page and skips the section is not lazy, they are correct, and a practice feature
that is rational to skip is a bug in the feature.

### If the band can ask it, the band asks it

That is the whole principle, and everything else in this milestone is a
consequence of it. The drill room keeps only the questions the band cannot pose:
**the ear**, because the transport never plays you a chord and waits; **the
name**, because the chart names everything for you and never asks you to;
**the function**, because a chart shows symbols and never numbers; and
**coverage**, because total freedom is how twelve keys become four.

Everything else stopped being a block beside the band and became a **mission on
the transport** — the real play-along page, under a constraint, with a goal that
can be missed. That also ends the two-currency problem the app had grown without
naming it: practice used to mint review rows nothing celebrated, while playing
deposited into the record, the streaks and the badges. Now both go to the same
place.

### The session was founded before the band existed

The root mistake is historical rather than anybody's judgement, and it is worth
writing down because it is the shape of mistake this project will make again.
The session engine was designed at M5 as the centre of the app. The rhythm
section did not exist yet. M7 and everything after it — scoring, streaks,
badges, the record, grooves — made `/backing` the centre, and the session was
never re-founded on it. It kept being extended, correctly, on foundations that
had quietly stopped being true.

The lesson is not "rewrite more often". It is that when the centre of an app
moves, the things built around the old centre do not become wrong loudly. They
become wrong by still working.

### The 70% bar was wrong, and the record said so before a mission was played

The plan proposed _land 70% of guide tones over two choruses_ and said to tune
it once missions produced rows. The record could answer sooner, and it did:
**813 chord attempts across 19 runs were already there, and 92% of them landed
every guide tone.** Across the seven runs long enough to mean anything — twelve
attempts or more — the median run landed 93%, the lower quartile 81%, and
exactly one run in the whole record fell below 70%.

So a 70% bar was not a goal. It was a thing that happens anyway, and a goal that
cannot be missed teaches nothing and celebrates nothing. The bar is 85%, which
sits above the lower quartile of comfortable playing and below its median: a run
in a key you know at a tempo you like clears it, and a mission — which is by
construction neither — has to reach for it.

Two things about those figures argue against ever calling this settled, and both
are written beside the constant rather than left here. **All 813 attempts come
from two keys**, C and A; the other ten hold none at all, so the high percentage
is what a familiar tune in a comfortable key sounds like. And **tempo has moved
the rate further than key has** — the blues at 140 lands 69–81% while rhythm
changes at 100 lands 92–94%, in the same key. If the first month of mission rows
clusters under the bar, 80 is the number the record already argues for, being
the top of the only uncomfortable-conditions band it holds. That is one edit, in
one place.

Two smaller things are worth noticing about this having happened at all. The
figures came out of a `GROUP BY` over `chord_attempts` — which is the blind-spot
report from M6, doing its job a phase before it was scheduled to exist. And the
coverage number is the milestone's own premise, quantified: two keys out of
twelve, 19 runs against 8 reviews. The exercises were not being skipped because
practice is unwelcome. They were being skipped because the band is better
company.

### A single percentage is the wrong shape, so a verdict carries its context

Given that tempo moves the rate further than key does, no single global
percentage is the right shape for this goal whatever number is chosen. That is
an argument for a bar _per context_, and a bar per context cannot be fitted to a
bare boolean after the fact — so every `Verdict` carries the key, the tune and
the tempo it was reached in, from the first one written. The constant is a
placeholder that knows it is one, and the rows being collected around it are the
ones a later pass will need.

### Scales stayed in the ear pool, against the plan's recommendation

The plan left open whether the ear task should ever play sequences and
recommended chords only. It was overruled — by another line of the same plan.
The done-when says _a brand-new account's first workout is playable start to
finish with C major material only_, and a brand-new account owns exactly one
rung: the C major scale. Chords-only ear material would have left that account
with nothing to hear at all, on the very first morning, which is a worse failure
than an inelegant question.

It costs less than it looks. `directionsForRung` already refuses to ask a scale
to be _named_, so the only thing that can be posed is "listen, then play it
back", and being asked to play a scale back is a fair question. Where a plan
contains a recommendation and a constraint that contradict each other, the
constraint is the one that was reasoned about hardest.

### `play_name` was already asking the degree question

The plan justified the new `degree_play` direction on the grounds that "seeing
A♭ and producing A♭ is spelling, while seeing IV of E♭ and producing A♭ is
harmony", and treated the question as one the app had never asked. It had. A
triad or seventh card carries no `detail`, so `pose` fell through to
`payload.degree` — and `play_name` on a numbered chord had been showing a bare
`IV` and asking you to play it and name it, for as long as the ladder has
existed.

`degree_play` still earns its place, on narrower and more honest grounds than
the plan claimed:

- **The key travels with the question.** A workout's function task crosses keys
  by design, so `IV` on its own is not a question. `IV — E♭` is.
- **It is generated only where a degree exists**, item by item rather than rung
  by rung, so nothing gets asked a numeral it does not have.
- **It is weighted differently.** `play_name` sits at 1.6 as the weakest link;
  `degree_play` at 1.3, just behind it. They are two questions with different
  answers about the same chord, and the scheduler now knows that.

Being wrong about the novelty is not the same as being wrong about the feature.
It is worth recording because the plan's argument would have been quoted later
as though it had been checked.

### A degree prompt that routes around the scheduler answers to nobody

The composer's first version built degree prompts by walking `itemsForRung` over
everywhere the ladder had reached. It was quick, it worked, and it was wrong:
a prompt invented at composition time is never due, never graded and never
recorded. The same plan that asked for `degree_play` asked for its entry in
`DIRECTION_WEIGHT` in the next breath — and a weight means nothing to something
that never passes through `selectDue`. Making a card direction and then routing
around the scheduler is two decisions contradicting each other.

So degrees are generated in `cards.ts` like every other question and the
function task is a queue of card ids exactly as the ear task is. What survived
from the first version is the round-robin: the queue spreads across keys,
because a numeral is the one thing in this app that means the same in all twelve
of them, and eight `IV`s in one key is a spelling drill wearing a numeral. A key
holds twenty-two numbered chords once its sevenths are up, so taking the first
eight of a flat list would have rebuilt the milestone's opening complaint inside
the task meant to answer it.

### "i — C" would have been a wrong question with the right answer behind it

Caught in review, not by a test, and it is the most musical bug in the
milestone. The relative-minor rung holds a scale and three triads. The triads
are filed under the C stage, because that is where the rung lives — but their
numerals are numerals of **A minor**. Posing them against the card's own key
would have asked for "the i chord of C", accepted A minor as the answer, and
recorded a correct review against a question that was false.

The fix is `degreeOf` on the item: the key a degree is counted from, when that
is not the stage's own. The prompt uses it where it exists and the card's key
otherwise. The general shape is worth keeping in mind — a rung is not
necessarily uniform, so the _item_ gets a say about what can honestly be asked
of it as well as the rung, which is also what stopped the A minor scale being
asked which numeral it is.

### `Goal` lives beside the evaluator, not beside the composer

A departure from the plan's letter, and a forced one. `Goal` and `describeGoal`
were written in Phase 1 in `session/workout.ts`. The page that has to _show_ a
goal is `/backing`, and no route may import the workout composer — a route
pulling in composition before the pages were rebuilt would have wired up half a
milestone and made Phase 3 unshippable on its own.

They moved to `practice/goal.ts`, beside the evaluator that answers them, and
the dependency now runs one way: `workout.ts` → `goal.ts` → `match.ts`. The
evaluator itself judges no notes; every landing it reads was decided by `judge`
and every percentage it quotes comes out of `add`, `accuracy` and `coverage`. A
second opinion about what counts as a landed chord is the one thing that file
must never grow.

### Completion replaced the clock, and a short pool cycles rather than ending early

Timers may still bound a task from above; nothing ends because of one. The
harder half of that promise is the queue: "the task ends at the count, never at
pile-empty" is only true if there is always something to ask, so the ear task
falls through due, then near-due, then anything already reached. Fresh material
sits at the _back_ rather than in the due pile, because a card met this morning
has no business outranking review work that is actually owed.

Even that runs out. An account three days old owns four ear questions in total,
so the pool cycles — at most three passes over it. Ten questions from four cards
is ear training; ten from one is a punishment, and four and a shrug is the bug
being fixed.

### A block names its task by kind and position, and the six old names are history

`session_blocks` is keyed by session and type, and a long workout holds two
missions, so the kind alone cannot say which one finished. The position can, and
the kind stays in the name so a row read on its own still says what it was:
`mission_2`, `ear_0`.

`block_type` is text narrowed by a union rather than an enum, which is what made
this free — and it is also what makes the deletion safe. The six original names
are still readable and no longer writable, and the code says which is which:
`LegacyBlockType` holds them with a comment explaining that they are rows and
not vocabulary, `BlockType` is the union the column carries, and `beginBlock` and
`finishBlock` take a `WorkoutBlockType` and nothing else. The hours those blocks
hold are still counted by the profile, unconditionally, because they happened and
no rebuild gets to revise them. Anyone who finds `LegacyBlockType` and reads it
as dead code will fail a test named for exactly that mistake.

### The day stopped having a maximum

What is in flight is the latest unfinished workout, not today's session.
Finishing one used to end the day, because the query that found a session asked
for one started since midnight and the page had nothing else to offer. A day has
no maximum, so the question is now "is there one open", and the answer to "I
have finished" is a fresh workout rather than a sentence telling you that you
have practised enough. This app has never told anyone off, and it does not start
by congratulating someone into stopping.

There is still no daily streak, and that was never reopened.

### What the deletion removed, and the one thing it could not

`plan.ts` and its tests are gone, and with them the proportional `SHAPE` timer
model, `SECONDS_PER_CARD`, and the four block types the app used to offer as
vocabulary. `Timer.svelte` went too — the last thing that rendered a countdown,
dead the moment `/session` became a task list. Nothing imported any of it;
`chooseKey` and `coldestKeys` had already been rewritten inside `workout.ts`
against different inputs, so the old copies were not shared code, they were a
second answer to a question that now has one.

The self-rating on the log block turns out to have been an even weaker thing
than the plan said. The plan recorded it as "written and never read"; in fact it
was never written either. `logRatings` was component state, set by four buttons,
and the block's own "Done" posted `{ answered: pending.length }` — so the rating
never left the browser and no row in the database has ever held one. Nothing had
to be migrated because nothing was ever stored. The grade already comes from
performance, which is the right place for it: a self-rating typed at the end of
a sitting grades the sitting's mood.

What could not be deleted, and must not be, is anything that makes those old
rows unreadable. That distinction — a vocabulary closed, a record kept — is the
one thing about this deletion worth remembering, and it is the reason
`LegacyBlockType` exists as its own type rather than as six strings quietly left
in a union.

### The home page was grey because the rule says it may be

The complaint was that the daily page is bland and uninspiring, and that some of
the profile's progress elements would look good on it — as long as none of it is
fluff. The first half of that is true and the cause is not taste. **Hue means
pitch**, and almost everything the page said had no pitch in it: a task, a rung,
a count of reviews due. Every obvious fix — a green bar for progress, an amber
pill for the due pile, a tint for "ready to move on" — is a colour standing for
nothing, and the house rule says out loud that a screen which can only be fixed
that way stays grey.

What the rule licenses is the thing the page was barely using. A **key** has a
tonic, so it may wear that tonic's swatch, and this page is mostly about twelve
of them. So the keys are drawn at the size the subject deserves: a banner that
is one whole panel of the key about to be played, and twelve swatches below it
big enough to read across a room. Twelve saturated colours is a strong image and
every one of them is information. Everything else — the task list, the ticks,
the rung marks, the ladder controls — stayed in weight, and the page is not grey
any more without a single colour having been invented.

The audit found one colour already standing for nothing: the "ready for the next
rung" button was outlined in `--pc-5`, which is F. Being ready is not a pitch.
It is ink now.

### A key you have never played is the most interesting thing on the page

The swatches fill with what the record actually holds — the same `GROUP BY` over
`chord_attempts` the profile's twelve keys are drawn from, deliberately, because
two pages drawing one fact from two questions is how they come to disagree about
it. On the record this was designed against that means two keys with something
in them and ten with nothing, which is the shape this layout has to be good at
rather than the shape it tolerates.

So an untouched key is drawn as a **full-strength coloured outline, dashed,
waiting to be filled**, and labelled _new_ rather than 0. It is not dimmed, not
faded and not marked absent: the ladder suggests an order and the strip refuses
to make the other eleven look unavailable, because every one of them is one
press from being today's workout. The words were chosen with the same care as
the styling — "new ground", "not been here yet — somewhere to go", "the rest are
open whenever you want them". Nothing on the page can fall while you are away
from the piano.

Two numbers were removed rather than restyled. **Reviews this week** can only go
down while you are not practising, printed on the page you open when you have
come to practise; there is no phrasing that rescues it. **Total cards** was
never read by anything at all. Per-key accuracy was wanted and refused: a
percentage beside ten keys, on the screen where you decide what to do today,
is a verdict handed down before the day has started.

One presentational liberty is taken and is worth writing down. A key with a
single chord in it against another with five hundred would fill a third of a
pixel, so a non-empty swatch gets a minimum sliver. The count printed beside it
is exact; the fill is a picture of a proportion and says so in `warmth.ts`.

### The state a returning player sees most often was the barest one

With a workout in flight the page used to collapse to a title, one line and a
button. It now shows the workout: its key in the banner, which task is next, and
the whole task list with the finished ones ticked and dimmed. Every one of those
facts comes from `session_blocks` — a mission's block is ended by the run that
met its goal — so this is the record's answer to "where was I" and not the
browser's. The twelve keys stay on screen underneath as a record rather than a
picker, because a strip you cannot start anything from must not look like one
you can.

The picker's agency is untouched: every key, every rung and every progression is
still visible and still startable, the ladder still marks its suggestion and
still gates nothing, and choosing something still does not move it. What changed
is that the picker is no longer folded away behind a summary that had to be
clicked before the page showed you anything worth wanting.

## M16 — tempo, measured

Both phases of it. The first built the grade and the shelf; the second built the
per-tune ladder, the mission that targets the next band up, the profile's second
dimension, and settled the two questions the roadmap left open.

The complaint underneath the milestone is that a badge earned at half speed is
not the badge earned at tempo, and until now the app could not tell them apart.
That made the top of the ladder reachable by slowing down until it was easy,
which is the one thing a practice tool must not reward — and it was blind in the
other direction too, because somebody grinding a tune from 80 up to 130 saw six
badges that stopped changing on day one.

### A band is a share, and it does not get a colour

The obvious design is fixed BPM bands, and the record says why that is wrong
before any argument does: Three Little Birds is logged at 99 and rhythm changes
at 100, and those two numbers mean opposite things. So a band is a share of the
tune's own `default_bpm` — under 60% `learning`, 60–79 `working`, 80–99
`nearly`, 100–119 `attempo`, 120 and over `past` — and the same five words stay
honest on a ballad and on a burner.

The thing most likely to have gone wrong here is colour, and it was refused.
**Hue means pitch**, a tempo has no pitch in it, and bronze-silver-gold or a
green-for-fast heat scale would have handed the palette a second meaning for the
sake of one row of hexagons. A badge goes on wearing the pitch class of the
chord that clinched it, and the band beside it is drawn entirely in weight: a
mark on a short track with a notch where the tune's own tempo sits, the share
printed underneath, and the mark thickening from muted ink to full ink at and
above tempo. That is the whole visual vocabulary of the band, and it is the
house rule's own uncomfortable test passed rather than dodged.

It is a **mark on a road and not a meter filling up**, and that distinction is
the non-punishment rule showing up in geometry. A five-segment bar with two of
them filled says three are missing; a mark at 63% with a notch at 100% says
where you are and that the road continues — which is also true past the notch,
because taking a tune faster than it goes is a real practice device. The words
follow the same rule: rhythm changes reads _"Held on Rhythm changes at working —
100, 63% of the 160 it goes at. Real work at this tempo, with road above it."_
Nothing there is red, nothing is called slow, and the fact comes before the
invitation in every one of the five sentences.

### The grade is a question, never a column

The temptation was `badges.best_bpm`. M9 deleted a stored best for exactly this
reason — it could drift from the runs justifying it — and a stored tempo grade
is that same bug wearing a new name, so there is no new column and no migration
in this phase at all. The badge answers _when did you first get there_ and the
grade answers _how fast have you held it_, one row each, neither able to
contradict the other.

The roadmap writes the grade as `max(bpm) where best_streak >= tier.from`, six
times over. It is asked once per streak length instead, grouped by chart and
`best_streak`, and the ladder is applied in `gradeShelf` — same answer, a
handful of rows rather than the whole log, and the six thresholds stay in
`streak.ts` where they already live instead of being spelled out again in SQL.
It also means the entire grade is a pure function with a test file and no
database anywhere near it.

Resolving the tune's own tempo is the wrinkle the query alone does not solve:
`default_bpm` is in `charts.ts` for a built-in and in the `charts` row for one
you typed in, and two of the three tunes in this record have no row at all. So
targets resolve **code first, then the database**, the way the rest of the app
resolves a chart. A tune that resolves to neither — a chart of your own since
deleted — grades nothing rather than being measured against a guess.

### `coalesce(best_streak_bpm, bpm)`, and why it is not a fudge

`play_runs.best_streak_bpm` was captured during M15 precisely so this milestone
would have something honest to grade, and it is null on every one of the
nineteen runs recorded before it existed. It cannot be backfilled; those runs do
not know. Grading strictly on it would therefore show nothing at all today, and
grading on `bpm` alone would reintroduce the flattery it exists to prevent — a
run started at 140 and slowed to 60 whose streak was clinched after the
slowdown.

So a run is graded on `coalesce(best_streak_bpm, bpm)`: a run recorded before
the column existed is graded on the tempo it was logged at, because that is the
only tempo it ever knew, and every run since is graded on where its best streak
was actually reached. That is not an estimate — no number is invented, each run
is graded on the best tempo it can honestly report — and the coalesce disappears
by itself as the old runs age out of being the fastest.

The share is rounded to whole percent **before** it is graded rather than after,
so the band and the number printed beside it can never disagree: 95 of 160 is
59% and `learning`, 96 is 60% and `working`, and nothing in between can print
60% while being graded as the band below.

### Checked against the record before it was believed

Graded by the rule above, the three tunes in this record come out as rhythm
changes `working` at 63% of 160, the jazz blues `attempo` dead on 140, and Three
Little Birds `past` at 130% of 76 — the three the shelf could not tell apart.
All three are fixtures in `tempo.test.ts` rather than a paragraph here, so the
day the logic stops agreeing with them a test says so.

### The ladder suggests, and there is nothing in it that could gate

"Start slow, stay consistent, move up" is the key ladder's shape on the other
axis, and the strongest way to keep it a suggestion was to build it so that
gating is not expressible. `TempoLadder` has six fields — the band held, the
tempo and share it was held at, the tune's own tempo, the band above and what
that one starts at — and not one of them is a permission. Nothing in `/backing`
consults it before doing anything, because the transport takes the tempo it is
given and always has. The line under the shelf ends with _"A suggestion — every
tempo stays playable"_, which is that rule said out loud on the one screen where
somebody might otherwise assume a tempo had been taken away.

Per tune, because tempo does not transfer: holding rhythm changes at 100 says
nothing whatever about a bossa. The ladders are keyed by chart slug and a tune
missing from the map is a tune the ladder has nothing to say about — which is
different from a tune with runs and nothing held clean, and the two are kept
apart in the shape rather than collapsed into one absent value.

### One definition of "held it", and the half of it the rows cannot answer

The roadmap asks the threshold to reuse M15's mission goal rather than inventing
a second standard, and `heldCleanly` imports `GUIDE_TONE_TARGET` from `goal.ts`
so that moving the bar moves both. `landed` over `voiced` on a `play_runs` row is
the very number `evaluateGoal` judges — `accuracy` counts chords, not tones — so
this is the same question reaching the same answer from stored rows.

**The roadmap was optimistic about the other half.** A mission goal is a
percentage _over a number of choruses_, and a run row does not record how far
round the form the run got: `barsCovered` counts bar-number transitions in the
chords a run judged, and reconstructing that in SQL would be a second, weaker
copy of it living where it cannot be tested. Estimating choruses from `voiced`
would be worse — a run where you rested half the bars would under-report, and
this record has never held an estimate.

So the ladder asks the half the rows answer exactly, and borrows a floor the app
already owns for the other: the run must also have reached the **first rung of
the streak ladder**, because `streak.ts` already says that two in a row happens
by accident inside any ii–V and three is where a streak starts being real. That
stops one perfect chord from setting a tune's band without inventing a number to
do it. It is a floor on which runs are worth reading, not a second definition of
holding something together.

### A mission expresses "the next band up" by carrying a band

Where M15 and M16 meet, and it needed one field. A mission already carried a
tune, a key and a tempo, so the whole of "hold the bar at the next band up on
this tune" is `bpmFloor` coming from the ladder instead of from `charts.ts`, plus
a `band` saying which band that number names. No new task kind, no second goal
type, no change to what `/backing` reads off the URL.

Rhythm changes is the case: held clean at 100 on a tune that goes at 160, the
mission asks for **128 and not 160** — the thing to practise rather than the
thing to bounce off. It stays a floor, exactly as it always was, so playing it
faster than asked is still not cheating and a mission asking below the tune's own
tempo is a suggestion about where the work is rather than a speed limit. A tune
the ladder cannot speak for keeps the tempo it goes at, which is what every
mission did before this.

The instruction says why: _"That is nearly on this tune — one band up from where
you have held it."_ A mission asking for 128 on a tune the player knows goes at
160 has to explain itself or it reads as a bug.

**The grade reaches the composer as an input.** `composeWorkout` is pure and
stays pure, so `ladders` arrives on `WorkoutInput` exactly the way `coldSpots`
does — derived from the runs by `loadTempoGrades` and handed over — rather than
the composer reaching for a database. The whole of the mission-targeting
behaviour is therefore provable with no database anywhere near the test.

### The profile's second dimension, and the figures it refused

The twelve keys are breadth; **how fast it has been held** is depth, and it sits
directly under them because they are two readings of one record. Per tune: the
fastest band anything on that tune has been held at, drawn as the shelf's mark on
a road at reading width — mark, notch at the tune's own tempo, road continuing
past it. No colour, again: hue means pitch and a tempo has no pitch in it.

The improvement figure is the first thing in the app that measures getting better
rather than doing more, and it is the one most able to say more than the rows do.
It reports three counts and keeps them apart: tunes the last thirty days took to
a faster band, tunes that held the band they already had, and tunes whose whole
history is inside the window and therefore have **nothing to be compared
against**. The third is not a tune standing still, and conflating the two would
have been the invented fact this page has never printed.

Movement is reported upward only. The band on a tune is the fastest it has _ever_
been held, so it cannot fall, and a quieter month than the one before it is not a
decline. And a month that moved nothing is reported as _"2 tunes held the band
they already had over the last 30 days"_ — what the tunes did, never what the
player failed to do. There is a test asserting that sentence contains no word of
reproach, because that is the kind of thing a later edit loosens by accident.

**Not enough history to say is its normal early state**, and reads as a fact:
this record has no month-over-month history at all yet, so the honest answer today
is that every run is inside the window and there is nothing before them.

Three figures were wanted and refused. An _average band_ across the record, which
would be a mean of five ordinal words and traceable to nothing. A _tempo trend
line_, which is the same decoration `loadTrends` already refuses for accuracy.
And _tempo per key_, because a band is a share of a tune's tempo and a key does
not have one — the record's 813 attempts come from two keys anyway, so the
figure would have been a shape with two points in it.

### `past` is shown and awards nothing

Settled against awarding it, and the argument is stronger than the roadmap's own
worry. A band is a share of the tune's own `default_bpm`, and on a chart you
typed in yourself that is a field you can edit — so an award at `past` would be
collectable by opening the chart editor and lowering a number, without playing
anything. Even on a built-in it would be collectable by dragging the tempo
slider, which is the mirror image of the flattery this whole milestone exists to
remove: M16 stops the ladder being gamed by slowing down, and a prize at the top
would make it gameable by speeding up.

So `past` is shown, described as _"showing off and is allowed"_, and that is the
whole of it. `bandAbove('past')` is null, `describeLadder` says there is _"nothing
to collect for being here"_, and a mission on a tune already held past tempo goes
back to asking for the tune's own tempo rather than inventing a sixth band. The
scale still does not stop at "correct" — being past tempo is visible, on the
shelf, in the profile and in the ladder's own sentence. It is simply not
currency.

### Crossing a band gets the quietest noise the fun layer owns

Settled in favour, narrowly, and on the house terms. Crossing into a band the
record has never held this tune at is worth a word — it is the one moment where
depth is actually happening, and the app was previously silent about it.

It is the **one-word callout** and never the confetti cannon, which stays
reserved for a badge earned for the first time: `celebrateChord` ranks a fresh
badge, then a tier callout, then a band crossed, then the streak ending, and only
the loudest speaks. It fires on a run that has just set its own best streak, at
three in a row or more, once per band per tune per sitting — landing one chord
fast is not crossing anything.

It is opt-out and it obeys the preference **without any new code**, which is the
reason to route it through `fx.say` rather than anywhere else: `Fireworks`
already computes `live = enabled && motionOK`, so the existing switch turns it
off and `prefers-reduced-motion` silences it.

And the score is not behind it. The bands and the ladder's line live on the
shelf, which has been part of the game layer since it was built and goes away
with the switch — but the two places the tempo grade actually _does_ anything are
not on the shelf at all. A mission's floor comes from the ladder whether or not
the fireworks were ever on, and the profile's tempo panel and month figure read
the same rows on a page that has no fireworks switch. Turning the noise off costs
a callout and a row of hexagons; it costs no number anywhere.

Arriving in `learning` is never announced. It is the ground floor rather than a
crossing: nobody has gone anywhere by playing a tune slowly for the first time.

### No migration, and nothing new stored

Phase 2 adds no column and no table. The ladder, the mission's band, the profile
panel and the month figure are all functions of `play_runs` rows that already
exist, `best_streak_bpm` included — which is the same argument Phase 1 made
against `badges.best_bpm`, holding for a second time under more pressure. The one
thing that changed shape is `TempoRecord`, which now carries `ladders` beside
`byChart`; it is a wire format rather than a stored one, and `parseTempoRecord`
rebuilds each ladder through `suggestLadder` so a hand-edited cache cannot
produce a ladder this build would not.

---

## The gap between the two rooms, and a medal for two bars

Two complaints from the same sitting, and they turn out to be one shape twice: a
measurement that never asked how much of the thing had actually happened.

The first. On the second rung of the first key — the C major scale, then the C
triad — the drill room asked for a C triad and the seven notes of C major, which
is exactly right, and then the same workout sent the same person to the
play-along page to get round a **three-tonic cycle**: Cmaj7 into E♭7 into A♭maj7
into B7, eight bars, two chords a bar, at 160. Not one of those chords had been
mentioned. Most of them are not in the key. It is a fine thing to practise and it
is about eighteen months away.

The second. Wanting to work on the first bar of that cycle, you set a loop over
two bars, played them cleanly at full speed, and the shelf filled up: every badge
on the tune, from a run that never saw bar three.

### What was actually wrong

`composeMission` reached into the whole chart list. Cold spots steered it, the
day rotated it, the tempo ladder set its floor — and nothing anywhere asked
whether the chords on the page were chords anybody had been shown. The ladder
knew what had been taught and the chart list knew what was being asked for, and
the two had never been introduced.

The obvious fix is a difficulty number typed onto each chart, and it is the wrong
one. A hand-written rating is a second opinion about material that already
describes itself, it drifts the moment a grid is edited, it says nothing about a
chart you typed in yourself, and it cannot answer the only question worth
answering, which is _which chord is the problem_.

### A tune states its own demand

So `curriculum/vocabulary.ts` derives the demand from the grid that is already
there, on two axes, because there are two ways to be lost.

**The shape** — can your hands make this chord at all. Read off the quality, at
the grain a player cares about: major, minor, diminished, the four sevenths.
Folded where the fold is about the hand rather than the theory, and the folds are
pinned by tests so that changing one has to be deliberate — a C6 is a major triad
with a sixth on it and the chart prints the symbol, a fully-diminished seventh is
the vii° you already met with the stack carried one third further. Never folded
is anything whose middle changes: a minor seventh is not a minor triad plus
colour, it is the sound the entire sevenths rung exists to teach.

**The ground** — how far the chord stands from the key. Three ordered steps.
`in_key`, every note from the scale. `coloured`, the root is a degree of the key
but a note is not: the blues I7, a secondary dominant, a borrowed iv — one foot
outside. `off_key`, the root itself has left: ♭II7, ♯iv°7, ♭III7.

A chart demands the union of its shapes and the furthest ground it stands on. A
mission is set only where what you have been taught covers both. That is not a
promise the tune is _easy_ — how fast to play it is M16's question and stays
there — only that nothing in it is unheard-of.

### The two halves of the drill room already divided the work

The part worth recording is that neither module had to be edited for this to come
out right, which is the argument that it is the real structure rather than one
imposed to make a gate work:

- **The ladder teaches shapes, and never leaves the key.** Seven rungs a key: the
  scale, the triads a few at a time, the sevenths. Every chord it builds is
  diatonic by construction.
- **The progression library teaches ground.** It is the only thing in the app
  that takes you outside a key, and it does so exactly at levels four and five —
  the blues is where a dominant seventh first sits somewhere it has no business
  sitting, and the tritone sub and the backdoor are where the root itself leaves.
  There is a test asserting that no progression below level four is anything but
  `in_key`, because if that ever stops being true the gate has quietly moved.

Both sides run through the same classifier, so what a progression teaches and
what a chart demands cannot be measured on different rulers. A chart of your own
is read from its stored grid on identical terms — being yours does not wave it
through.

### What the curriculum looks like now

Ordered by reach, against the material actually shipped:

| Where you are                                      | What opens                                                   |
| -------------------------------------------------- | ------------------------------------------------------------ |
| The scale                                          | nothing, and that is the fix                                 |
| The home chord                                     | Linstead Market — I–IV–V–I, sixteen bars, reggae, with words |
| All seven triads                                   | the four-chord loop, doo-wop                                 |
| All seven sevenths                                 | Mango Walk, St. James Infirmary                              |
| The blues progression                              | the twelve-bar blues, and most of the standards              |
| Secondary dominants, the tritone sub, the backdoor | rhythm changes, the cycles, bird blues                       |

A test asserts that with every rung and every progression met, **nothing is
stuck**: the far end is reachable rather than decorative.

### Day one is two tasks long, and says so

The composer's own note used to say the mission was "always buildable because the
built-in charts are always there", and the fallthrough leaned on it. It is not
buildable any more. On the first day of an account there is one rung, no chord
shape at all, and no degree card to build a function task from — so the workout
is genuinely two tasks and nothing can honestly make it four.

It therefore says so rather than padding. `missionHeld` names the nearest tune
and what it is waiting for, in words, with the progressions that would teach it
in the library's own order — _the nearest tune is the four-chord loop, and it
wants a minor triad_. The size picker counts the tasks that were actually
composed instead of printing `TASK_COUNT`, because a button saying 4 above three
things is the same broken promise the old minutes picker made. **A count that is
true is worth more than a count that is round.**

Refusing to be a locked door is the whole design of that field. A page that can
only say _not yet_ teaches nothing; a page that says which chord is missing and
where it is taught is a curriculum.

### A badge is a claim about a tune, so the tune has to happen

The second complaint, and the same disease. A streak counts landed chords, and
the chords in a two-bar loop are genuinely landed — nothing was cheating, the
measurement simply never asked how much of the tune it had seen.

The chorus count had the identical hole in a politer form, and a comment in
`goal.ts` claimed the opposite: that counting bar _changes_ meant "looping a
turnaround cannot be mistaken for playing the tune". It plainly could. Twelve
changes are twelve changes, and twelve of them over a twelve-bar form was a
chorus. Six passes of a two-bar loop met a goal that asks you to get round a
blues. There was even a test called _does not let a four-bar loop add up to a
chorus_ whose assertion said it added up to a chorus and a half.

One rule now, in `practice/form.ts`, serving both: **distinct bars of the form,
carried across the wrap rather than reset by it.** A loop shorter than the tune
reaches its own length and stays there forever, however long it runs. A bar
rested through on one pass and played on the next completes the form on the next,
because the set carries over. A bar rested through _every_ time never counts, and
that was already the rule for a single pass.

The badge does not vanish, it **waits**. Everything earned is held on a shelf
that belongs to the run, and the moment the transport has been through every bar
it all lands at once, with the whole confetti cannon and with the timestamps it
was earned at — a badge answers _when did you first get there_, and rewriting
that to the downbeat that released it would be a small lie about a fact already
recorded correctly. Playing a tune from the top therefore feels exactly as it
did: the first chorus of a blues takes twenty seconds and the badges arrive on
the downbeat of the second.

Two deliberate details. The form is tracked from **the transport**, not from the
chords you played, so laying out for eight bars still takes the tune round —
where the goal evaluator reads the chords, because that one is asking whether
_you_ went round rather than whether the tune did. And the feedback while playing
is untouched: the streak counts, the callouts fire, the tempo shows. Woodshedding
two bars and watching how it is going is the reason the loop exists. What you
cannot do is take the medal home.

Silence would have been worse than the bug, so it is said out loud in three
places: a held badge gets the one-word callout naming what it waits for (_nice ·
9 bars to go_), the score strip carries a line while any are waiting, and a run
that ends still holding some says how many were let go and why. Dim ink, no hue —
hue is pitch — and nothing red, because nothing has gone wrong.

---

## M14's plan is retired, and this is the argument it was carrying

The demo shipped some time ago and its section went on standing in `ROADMAP.md`,
which breaks that file's own rule: a landed milestone's plan is deleted, its
status goes to the README table and its reasoning comes here. The status was
already right. This is the reasoning, moved rather than rewritten, so that
deleting the plan costs nothing.

**Why a demo went in front of a payment page.** It was the cheapest item on the
list and the only one that produced evidence rather than capability. The landing
page was public, detailed and good — it described a rhythm section that listens
to you and a chart that follows the music — and then offered a password box. The
only way to actually see the product was to install Postgres. Every other
milestone in the plan was an argument about how to charge for something nobody
had been able to try, and the order that puts a payment page first is the order
that spends three months learning nothing.

**What it had to show, and what it had to refuse.** It had to show the
**scoring**, because that is the entire differentiator: a demo of the transport
and the chart without the judging is a worse iReal Pro, and anybody who knows the
category reads it that way in four seconds. It had to refuse to offer to save
anything, refuse to show an empty profile, and refuse to put a sign-up anywhere
until there was something to receive one — which is the same decision recorded
under _Somebody else's account_, reached from the other side. The only honest
exit was, and still is, the source and _run it yourself_.

What it is now needs no plan to describe it: `/demo` is public in
`isPublicRequest`, it mounts the real `PlayAlong` with `demo` set, it reads the
built-in charts out of code and the default palette out of `$lib/settings`, and
it writes nothing anywhere. Not a mock-up and not a video — the same page, with
the record turned off.

---

## The curriculum, counted — and a room for the songbook

Three things in one pass, and they turned out to be one thing: making readiness
real exposed how lumpy the material behind it was, and fixing that needed more
material, which needed somewhere to put it.

### Counting beat arguing

The gate shipped and the roadmap recorded a suspicion that one step out of the
key might be a cliff. Rather than argue about it, the climb was walked and
counted — how many of the songbook's tunes are open at each rung of the ladder
and then each level of the progression library:

```
1 → 3 → 5 → 5 → 5 → 5 → 5 → 16 → 16 → 23
```

Five tunes for the whole ladder plus seven progressions. Then **eleven at once**,
then **seven at once**. Two progressions carried eighteen of the twenty-three
tunes, and the second of them was the last item in the library.

Nothing was broken. The curriculum was lumpy, nothing measured it, and so nobody
knew. That number is now a test — `walk.test.ts` — and its header says it is
meant to be read when it fails, because a failure means the material moved rather
than that something is wrong.

### An ordered scale was the wrong shape for the thing being described

The cause was in the model. A tune's distance from its key was `in_key <
coloured < off_key`, three ordered steps — so crossing one opened every tune
sitting on it, and whichever progression happened to sit behind the crossing
became the only one that mattered.

The mistake was assuming these things are ordered. They are not. A tune full of
borrowed chords is not harder or easier than one full of secondary dominants; it
is a **different thing to learn**. So it became a set of four named devices,
exactly as the shapes already were:

- `blues` — a dominant seventh on I or IV, where the key asks for neither.
- `borrowed` — a chord from the parallel key: the minor iv, the ♭VII, the ♭VImaj7.
- `secondary` — a dominant aimed at a degree of the key other than the tonic.
- `chromatic` — a chord belonging to neither parallel key and resolving to
  nothing inside it.

The order of the tests in `deviceOf` is the argument: everything in the key is no
device at all; everything in the _parallel_ key is borrowed, checked before
anything else because the parallel key is a real place a tune goes rather than a
coincidence — that is what makes ♭VII7 the backdoor dominant instead of a
chromatic accident. Only then do the dominants split, by where they resolve.

The progression library was re-levelled to match, and now says something rather
than describing something: levels one to three are movement _inside_ a key, and
levels four to seven are one device each. A test asserts that — if a level ever
holds two devices, the gate has quietly moved back to where it was.

### The rest was a shortage of tunes, not a shortage of model

Even with the model fixed, the early bands were thin: the whole ladder opened
five tunes because only five were `in_key`. That is a content problem and it took
content to fix.

Twelve tunes went in, chosen for the bands that had none rather than for being
good — though they are: three of nothing but major triads so the second rung of
the first key has something, four adding the minor triads and the sevenths, a
mixolydian fiddle tune and House of the Rising Sun for the borrowed step, and
three eight- and twelve-bar blues for the blues step.

**On the licence**, since it is the question that decides whether a tune can be
here at all. Ten are traditional — no author to credit and none to clear, which
is what that category _is_. Two are standards with the year recorded so the claim
can be checked: Trouble in Mind, 1924, and How Long, How Long Blues, 1928, both
comfortably inside the file's own rule of US publication in 1930 or earlier.
Berger and Israels' Public Domain Song Anthology, 348 songs released CC0, was
used to corroborate public-domain status; the harmonisations here are the
ordinary ones anybody plays rather than anybody's arrangement. Every one of the
twelve was run through the songbook skill's round-trip check before it was
written down, and all twelve come back through the numerals unchanged.

The climb is now **3, 7, 12, 15, 20, 28, 35**.

Two bands still open nothing, and both are honest: the very first rung, where you
know seven notes and no chord shape, and levels one to three of the library,
which teach movement through chords the ladder has already taught. The second is
asserted rather than tolerated, so nobody later reads it as a bug.

### The songbook gets a room

Thirty-five built-in tunes is past the point where a list is something you read.
It becomes something you scroll past — and the list lived in a collapsible
sidebar on the play-along page, with **the chart editor opening inside the
practice area**: writing a tune down replaced the chart, the transport and the
score with a grid of text boxes, reached by a small link at the bottom of the
list.

It read as bolted on because it was. Two activities were sharing one screen for
want of anywhere else to put the second.

They are separated by **what you are doing** rather than by what they operate on.
`/backing` is for playing, and keeps its list, because choosing the next tune
mid-sitting is part of practising. `/songbook` is for finding and for writing
down — both things you do with your hands off the keys. The three chart actions
moved with the editor, unchanged; the redirect after a save still lands on the
play-along page with the tune open, because you typed it in in order to play it.

The list narrows by words, by kind, by the rhythm section a tune opens with, and
by whether you can play it. The filter chips are derived from the entries rather
than from the vocabularies — a filter offering a choice that empties the list is
a filter that has lied to you once.

### Readiness is a signpost and never a lock

The same fact the workout uses to place a mission is now visible where tunes are
chosen — the question the list previously could not answer at all was _which of
these can I actually play today_.

Three rules it obeys, and they are the whole design:

- **Every tune stays open.** In every key, whatever the ladder says. Nothing here
  is disabled, greyed out, or behind a padlock.
- **It says what, not no.** A tune you are not ready for reads _wants minor,
  blues sevenths_ — the next thing to learn rather than a closed door.
- **Weight, never hue.** Hue means pitch everywhere in this app and a tune is not
  a pitch. Ready is full ink, not-yet is dim ink, and nothing anywhere is red.

The play-along sidebar carries the same mark as a single quiet `· not yet`, and
the entry stays clickable. The gate steers what is **offered**; it has never
gated what you may **play**, and this was the change most able to break that
promise by accident.

---

## The first run, and the pedal that carries it

Two things arrived in the same week and only make sense together: an account
that is now genuinely one person's, and a way in that assumes nothing about who
that person is. Until the family beta there was exactly one player, and he wrote
the app — the first thing anyone saw could be a practice screen, because the
only person who ever saw it already knew what every control did.

### It opens at the instrument, and that was the second attempt

The tour first explained the app and offered to set MIDI up somewhere in the
middle of it. That was the wrong order and it showed immediately: every screen it
describes afterwards is about hands on a keyboard, so a tour that talks for four
cards before finding out whether there _is_ a keyboard is describing somebody
else's setup.

So step zero is setup, in three stages — have you played before, connect, then
prove it works — and nothing else is explained until it has an answer. The five
page cards come after, and they are the shorter half.

### Three notes, and they have to be different

A connection is only tested by playing it, and playing it is only tested by
counting. `hasConfirmedInput` wants **three distinct notes** before it calls MIDI
good, because a key held down, a stuck key, or one key tapped three times all
produce a confident stream of messages from an instrument nobody could practise
on. Distinct pitches are the cheapest question that can tell those apart, and it
is asked of the on-screen keyboard on exactly the same terms.

The on-screen route is a first answer rather than a failure branch. It is offered
beside MIDI, the tour continues along it, and the copy changes with it — the
pedal card says `Space` to somebody who has no pedal instead of describing a
piece of hardware they were just told they do not need.

### Two answers, and a ladder they are not allowed to touch

`prefsForExperience` changes exactly two values: how long a workout aims to be,
and how long you get before a chord is revealed. Ten minutes and three seconds
for a beginner, twenty and one and a half for somebody returning.

It deliberately does not move the ladder, and the temptation was real — an
experienced player starting on the C major scale looks like a bad first
impression. But the ladder is a record of what has been done, and one answer on a
welcome screen is a guess about yourself. Writing the guess into the record makes
it indistinguishable afterwards from practice that happened. Nothing is gained by
it either, because Today already starts any key, any rung and any progression on
request: the experienced player is one click from where they wanted to be, and
the record still says the truth about how they got there.

If the settings write fails, the tour says so in one line and carries on. A
first-run screen that dead-ends on a failed `PATCH` is worse than one that
starts you on defaults.

### The pedal is the lesson, so the tour takes a press

The second card asks for a press of the damper pedal, and the press is the
content. It is the one control that still works with both hands busy, it already
meant _next_ on the practice screens, and now it means the same on every one of
them — next question, open the play-along, play and pause the band.

Teaching it needed a change underneath. `onPedal` was a single slot, set by
whichever page was showing and cleared on the way out, which is right for pages
and impossible for a layer that sits above one: the tour would have had to
disconnect the page to hear anything, then hand it back intact. So handlers
became a set with priorities, and **a handler that returns `true` claims the
press**. The tour subscribes at priority 100 and consumes every press while its
setup cards are up, so a press aimed at the overlay cannot start the band behind
it.

`onChord` and `onNote` became sets in the same pass and now return their own
cleanup rather than being nulled. The single slot had been a latent bug for as
long as it existed — two pages briefly mounted during a transition would have
silently stolen each other's chords, and the fix costs one closure.

### Seen is a fact about a browser, for now

Whether the tour has run is a `localStorage` record keyed by the player's name,
holding how it ended, which answers were given and a version. It is not in the
database, and that is a decision rather than an oversight: it is presentation
state, it is wanted before the first render, and the family beta's operator knows
everyone who could possibly be affected by it being wrong.

What it costs is honest and small. A second machine runs the tour again, a
cleared browser runs it again, and nobody can reset it on somebody else's behalf.
All three are survivable precisely because the profile menu replays the tour on
demand — the menu item forces the tour to be re-runnable, which means _seen_ was
never load-bearing in the first place. It moves to a column on `user_prefs` when
registration opens to people the operator has never met, and `ROADMAP.md` lists
it under what M12 still owes.

Keyed by name rather than globally, because the case this beta exists to serve is
two family members and one laptop.

### A portrait made of the same twelve colours

Every account carries a chromatic avatar derived from its name: a hash, a small
xorshift generator, four **distinct** pitch classes and one geometric variant.
The same name always draws the same portrait, so there is no upload, no file to
serve, no column to keep in sync, and nothing to moderate.

Four distinct pitch classes rather than four random ones, because a portrait can
otherwise come out as one colour on itself. The name is normalised for case and
surrounding space first, so somebody who is `Bruno` on one screen and `bruno` on
another is not two people.

It is `aria-hidden` and decorative. The name sits next to it in text, and text
says who somebody is far better than an abstract shape can — the portrait is
there to be recognised at a glance across a room, not to carry the identity.

### The wheel follows the hands

Explore was the last page where playing the piano did nothing. It is a study
bench — the wheel is driven by clicking cells — and that made it the one screen
where a connected instrument looked disconnected.

The notes sounding under your hands now join the notes you pinned, in the same
lit layer rather than in a second one. That is the whole design decision: a note
you clicked and a note you are holding are making the same claim about the
wheel, and giving them separate treatments would ask the reader to learn which
kind of light means which. `session.live` already follows note-off and the
sustain pedal, so nothing new tracks state.

A lit cell now takes its own pitch colour's ink rather than the muted ink, which
is what keeps the label readable when the ring lights up underneath it, and the
ring arrives with a 140ms grow from 0.975 — short enough to read as the attack of
the note rather than as an animation of a user interface. Under
`prefers-reduced-motion` it does not animate at all, like everything else on that
page.

---

## A separator that only looks safe

`badgeKey` joined a chart slug to a tier id with `\0`. As a Set/Map key that
works: the lookup is exactly as correct as any other separator would make it.

The risk is everything downstream that assumes a string is text. Git decides a
file is binary by finding a NUL byte inside it, so a `\0` pasted instead of
typed — indistinguishable in most editors from the escaped form that behaves —
turns `git diff` into `Bin X -> Y bytes`, turns `grep -r` into "the file
matched, somewhere", and turns an exact-string edit near that line into one
that silently does nothing. The escape avoids the byte only for as long as
nobody ever reaches for the byte directly, which is a thin guarantee for a
character with no visible representation.

The key is a bar now. It is unambiguous for the same reason the NUL was — a
slug is `[a-z0-9-]+` and a tier id comes from a closed set, so neither half can
contain one — and it has the property the NUL lacked even written safely: a
person reading the source can see it. Changing it was free because the key
never leaves memory: what the outbox writes is the badge, and the server
settles duplicates on `badges_user_chart_tier` rather than on any string built
here.

---

## What M12 was still owing

The family beta shipped the seam — accounts, cookies, the epoch, every table
that generates practice data getting an owner. What it left standing was
everything that turns "an account exists" into "an account is safe to
depend on": nobody had proven two accounts could not read each other's rows,
deleting one did not work at all, nothing exported, a wrong password could
be tried forever, and a lost one had no way back in but the operator's own
terminal. Five gaps, closed in one slice, in the order their dependencies
actually run: isolation first, because everything after benefits from the
harness it builds and needs no schema change to start; deletion next,
because export benefits from two tables it finally gives an owner; rate
limiting before reset, because reset needs it; first-run last, because
ROADMAP.md had already said it could wait and it still could — it went in
anyway because there was no reason left not to.

### A test that is not allowed to reach production, even by accident

None of this is testable by the rule `CONTRIBUTING.md` states — "if your
change needs a database to be tested, that is usually a sign the logic
wants extracting from the query" — because the logic under test **is** the
query. Isolation and deletion are properties of what SQL actually runs, not
of anything that can be pulled out and proven on plain arrays. So this is
the one exception to that rule the project has needed, and it is treated as
an exception rather than a quiet erosion of it: a second Vitest project,
named `integration`, matched only by `*.integration.test.ts`, and excluded
from the project everything else runs under. `npm test` and `npm run
verify` still run exactly what they ran before — the promise holds for
every file that was already keeping it.

The sharper problem surfaced before a line of test code did: the developer
machine's own `DATABASE_URL` points at the live production database, and a
deletion test is destructive by design — it proves nothing survives by
creating rows and then cascade-deleting them. Pointed at the wrong
database, the test that proves deletion is safe becomes the thing that
makes deletion unsafe. The fix is in `src/lib/server/db/index.ts`, one
guard in `connect()`: under Vitest — `process.env.VITEST`, set
unconditionally by the runner itself, never by this app — `DATABASE_URL` is
never read, full stop. Only `TEST_DATABASE_URL` is consulted, and its
absence throws rather than falling back to anything. This is stronger than
routing the integration suite through its own connection and hoping nobody
imports the wrong one: every module the tests exercise — `session-store.ts`,
`play-log.ts`, `settings.ts`, `accounts.ts` — already imports the one `db`
from `index.ts`, so the guard protects all of them by construction, not by
discipline. `test-helpers.ts` accordingly does not open a second
connection; it reuses the same `db`, which is the point.

`TEST_DATABASE_URL` itself is a disposable Neon branch — copy-on-write off
production, nothing written to it ever reaches the parent, gone on its own
in about a day. The repeatable pattern is a fresh one per working session
rather than a standing local Postgres, which is why `.env.example` documents
both: `npm run db:up`'s docker-compose instance for anyone who wants a fixed
one, a throwaway branch for anyone whose provider already offers branching.
CI gets a third option again — its own ephemeral `postgres:17-alpine`
service container, migrated and seeded fresh on every run, because a
workflow should not depend on a branch somebody remembered to create by
hand.

### Two tables that were never actually owned

`takes` and `repertoire` predate accounts entirely and were never revisited
when `user_id` went onto everything else, because both are parked — the
record-take feature that would have written to them was built and then
removed, and nothing in the app writes to either today. That made the gap
easy to miss and, once looked for, easy to find: `takes.session_id` is
nullable and `set null`, and `repertoire.source_take_id` is nullable and
`set null` and lands on `takes` — so neither table had a _reliable_ path
back to a user, only an optional one that a real row could easily lack.
Deleting an account was never going to reach either.

The fix is the one M9 already wrote down as the rule and this milestone
applies literally: a row that cannot exist without its parent does not
repeat the parent's owner, but a row whose relationship to its parent is
optional is not that case — it needs its own `user_id`, direct, the same
shape `cards` and `sessions` already carry. Both tables took the migration
with the nullable-column-then-backfill-then-tighten shape `0008` used for
the original accounts migration, purely as a safety net: with nothing
writing to either table, no real installation should have a row to
backfill, and the migration says so in its own comment rather than assuming
silently.

### Deleting an account is now one statement

With the graph actually complete, `deleteAccount` is `DELETE FROM users
WHERE id = $1` and Postgres does the rest in the same transaction — no
hand-written list of tables to keep in sync with the schema. The
integration test that proves it seeds one row in every owned table,
including `takes` and `repertoire`, and checks each by the id it created
rather than by a table-wide count, so a stray row left behind by another
test running against the same shared database cannot make this test lie.

Nothing in the app had ever asked for confirmation this size before. The
nearest precedent — removing a chart in the songbook — is a two-step inline
toggle, "Delete? · Delete · Keep," which is right-sized for one row you can
retype in a minute and clearly not right-sized for an account and
everything it has ever recorded. The account page now asks you to type the
account's own email address before the button un-disables, which is a
courtesy the server re-checks independently rather than trusts — the
enabled button decides nothing; `?/delete`'s own comparison does. Nothing
about it goes red. It is the same plain border and muted text every other
panel on that page already uses, because the rule was never "make
destructive things alarming," it was "make destructive things confirmable,"
and those are not the same rule.

### Exporting the rows, not a reading of them

"Exporting everything you own is the same requirement wearing a different
hat" as deletion, ROADMAP.md said, and placed it on the profile — but the
profile's own load function computes aggregates, not a record, and
"everything you own" is a claim about rows, not about a page. `exportAccount`
reads every owned table directly instead: two passes, first the tables with
a direct `user_id`, then their children by `inArray` on the ids just
collected, which stays a handful of cheap queries rather than one query
trying to join fourteen tables into a shape nothing else needs. The one
column with no honest JSON representation, `takes.midi_blob`, goes out as
base64 — a decision that will matter the day something actually writes to
that table again, and costs nothing while it does not.

### One table, two kinds of attempt

Sign-in failures and reset requests share `rate_limit_events` rather than
each getting a table, because they are the same shape — a key, a kind, a
timestamp — and ROADMAP.md's own reasoning for wanting one at all applies
equally to both: no shared memory across serverless instances, and Postgres
is already the one thing every instance can already reach. The `kind`
column keeps failing one from ever locking the other; a family member
mistyping a password does not cost anyone a reset link.

The one piece of this worth unit-testing on its own is `windowStart` — the
arithmetic that turns "fifteen minutes" into a cutoff timestamp — because it
is genuinely pure and everything downstream of it is not. `isRateLimited`
and `recordEvent` stay in the shape `accounts.ts` already established for
`authenticate` and `resolveSessionUser`: thin, DB-backed, proven by the
integration suite rather than the fast one. Verified live rather than only
by assertion — eight failed sign-ins pass, the ninth is refused with the
same plain, un-red message the login form already uses for a wrong
password, and the tenth still is.

### Reset, over a provider chosen for its SMTP relay

Maileroo was already set up with SMTP credentials before this milestone
reached it, so the mail layer is Nodemailer against `smtp.maileroo.com:587`
with STARTTLS rather than a provider-specific SDK — one more reason this
stays swappable if the provider ever changes, since the only thing that
would need to move is `src/lib/server/email.ts`. The token itself is
stored hashed, never in the clear, the same discipline the session cookie's
signature already keeps: a leaked table row should not be a leaked
credential. `createResetToken` is deliberately its own function, separate
from `requestPasswordReset`, purely so the integration suite could prove
the whole token lifecycle — issue, spend, replay, expire — against the real
database without the tests ever touching Maileroo or the network. They
still don't.

Two things surfaced only by actually sending a real email, which is exactly
why that was worth doing rather than trusting the code review: Maileroo
rejected the first attempt outright, `550 5.7.1 This app does not allow
emails to be sent from this domain`, because the from-address's domain
was not yet on that Maileroo app's allow-list — a dashboard setting, not a
bug, fixed once the domain was added and confirmed on retry. The second was
a real bug: the unhandled rejection from a failed send crashed the whole
form action into a raw 500, which is a poor thing to show someone who is
already locked out of their account and already anxious. `requestPasswordReset`
now catches its own mail failure, logs it server-side for the operator to
notice, and still returns the same generic "if that email has an account…"
result either way — matching the discipline `authenticate` already keeps
for a missing user, extended to cover the provider itself having a bad
morning.

### The first run stops being a fact about the browser

`tourSeen` is one boolean on `user_prefs`, exactly the shape ROADMAP.md
already specified for it — which meant deliberately not carrying over the
`experience`/`inputMode` values the old `localStorage` record also kept,
since a boolean has nowhere to put them. Replaying the tour now always
starts from the same defaults rather than remembering last time's choice,
which is a real but minor loss and the one the roadmap's own wording asked
for. The `userName` prop existed for exactly one purpose — building the
`localStorage` key — and once that key was gone the prop was simply unused;
it left with the code that needed it rather than staying as an argument
nothing reads. The "replay the tour" menu item needed no change at all: it
already worked by bumping a `request` counter the component watches
independently of whatever `tourSeen` says, so replaying and having already
been seen were never the same question.

### What is left

ROADMAP.md's status section has the detail; the shape of it is that
everything closeable from a keyboard now is closed. What remains is an
acceptance pass with two real family accounts on one real evening,
confirming by eye what the integration test already proves in code —
and that is the one item on this list that was never going to be finished
by writing more of it.

## The page that never said where you had been

Somebody who opens this app most days said it felt jammed: always C, always
"the home chord", no history on the front page, and no path they could see. All
three were true, and none of them was a scheduling bug. The ladder was in the
page the whole time — folded into a disclosure labelled "choose something
else", which is a filing cabinet and not a route — and the record was on the
profile, one navigation away from the screen you actually open at eight in the
morning.

The ladder never moves on its own, by design: `ladder.ts` says progress is
suggested and never enforced, and that is right. But the only thing on the home
page that offered to move it was a mono-type footnote under the start button,
sitting between "← step back" and the size picker at 0.7rem. So an account can
sit on rung two of key one for a fortnight while the app quietly does exactly
what it promised, and the person doing the practising has no way to tell the
difference between "this is where you are" and "this is all there is".

### Two readings of rows already being written

`session/journey.ts` is pure and adds no new measurement. It answers two
questions the page could not previously ask.

**A window on the ladder,** not the whole of it. Five or six steps — a couple
behind, where you are, three ahead — because the complete eighty-four are still
one press away below and a path you can read in a glance beats a complete one
you have to study. Each step behind carries the count the record actually holds
for it, so "done" is `11 of 14 right` rather than a tick meaning the settings
row moved past here. Steps ahead carry the rung's own `teaches` line, which was
already written for exactly this purpose. `opensKey` marks the seam where the
window crosses into a new key, since "G · the scale" arriving after "C · the
relative minor" is the most important thing this strip has to say.

Every step is pressable, and what pressing one means depends on which side of
you it is on: behind is _play it again_, ahead is _look at it now_. Both pin the
workout without moving the ladder, which is the rule the library below has kept
since the picker was built.

**What the last few days were made of** — task titles, in the key they were in,
on the day they happened, read straight off `plan_json` and the finished blocks.
It has to survive one test to belong on this page: it must not be able to fall.
It does. A workout that happened stays happened, an abandoned one keeps whatever
it got through, and there is no streak anywhere near it. `describeWhen` names
today, yesterday, then the weekday, then the date, and never says "3 days ago" —
a count of days since is the shape of a reproach, and this strip is for what was
done rather than what was missed.

### One rule, written once

`looksSolid` moved out of `rungProgress` and into `journey.ts`, because the path
now asks it about every rung behind you and the store asks it about the one you
are standing on. A step drawn as solid next to a "move on" button that refuses
to light up would be the page arguing with itself. `ladderRecord` is the same
count as `rungProgress` with the `where` clause taken off — one `GROUP BY` over
cards, skills and reviews, left-joined so a rung whose cards exist but which has
never been asked comes back as a zero rather than as an absence. The page draws
those two states differently and has to be able to tell them apart.

### Moving the ladder now lives on the path

The `back` and `advance` forms left the sticky footer and sit under the steps
they move along, at a size somebody might notice. When the rung looks solid the
button says _Ready — move on to the three main chords_; when it does not it says
_Move on to_, and the line under it says that moving on is your call and nothing
here is locked. That sentence is the whole policy, and it had never been printed
anywhere.

Colour follows the house rule without an exception. The only tinted thing in a
step is the key's letter, because a key is a pitch; behind, here and ahead are
ink, dim ink and a dashed outline, because none of those three is one.
