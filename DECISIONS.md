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
