# Roundel

A practice tool for chord progressions, laid out as a transit map of the twelve
keys — see how they move, hear them, and drill them until they are automatic
everywhere.

The twelve keys are stations on a network. Each curriculum step is a line across
it; a day's workout is a departure that calls at the keys you have opened. That
map is how you navigate and how the lessons are built. The circle-of-fifths
wheel is still here — it is the terrain the network is drawn on — and it is
where you explore chords, neighbours and voice leading.

A progression is the real unit of harmony, not the chords in isolation: a
ii–V–I means something as a single shape, not three symbols to memorise
separately. Roundel puts that shape in front of you — on the wheel and across
the map — while the rest of it makes sure you can also hear it, recognise it on
your own instrument, and find it again next week.

Not a music theory course. One loop, worked from every direction: take a
progression, hear it, drill it across all twelve keys, and apply it —
recognising it as you play, or playing along with a generated rhythm section.

```
SEE → HEAR → DRILL → APPLY
```

**No staff notation, anywhere, ever.** Not as an option, a toggle or an
advanced panel. Music is keyboard diagrams, the wheel itself, chord symbols,
scale-degree numbers, Roman numerals, intervals and colour. If you read chord
charts fluently and staves not at all, nothing here will ask you to.

Free software, AGPL licensed. Run it on your laptop, deploy it wherever you
like, change whatever you want. It is your own instance — no telemetry, and no
server anyone else controls. Invite-only accounts let a small trusted group
keep separate progress today; public registration and the paid hosted service
remain planned in `ROADMAP.md`.

## What it does

- **Play** — connect a MIDI keyboard and it names what you play as you play it,
  with the reasoning, on a harmonic wheel that shows why.
- **Today** — a workout of three to five tasks, composed fresh each morning and
  finished by meeting its goals rather than by running a clock down. Pick any
  key, any step or any progression to build it around; spaced repetition
  schedules the review and a twelve-key ladder suggests where to go next, and
  neither ever locks anything.
- **Play along** — a rhythm section generated from a chord chart. Walking bass,
  drums, optional comping, any key, any tempo, loop any bars. Blues, rhythm
  changes, cycles and public-domain standards, plus anything you type in.
- **Explore** — the wheel, chord neighbours, voice leading, with the notes under
  your hands lighting up as you play them.
- **Profile** — what has actually happened: hours played, chords judged, badges
  won, and the twelve keys as swatches so the ones you never play are visible at
  a glance. Every number traces to a row; none is an estimate, and there is no
  daily streak.

Signing in for the first time opens a short tour that sets the instrument up
before it explains anything, and hands you the sustain pedal as the way through
the rest of it. No MIDI keyboard? Everything works with the on-screen one, and
the tour takes that route instead.

---

## Before you start: browser support

**Connecting a MIDI instrument needs Chrome, Edge or Firefox on a desktop.**

Web MIDI does not exist in Safari — on iOS, iPadOS _or_ macOS — and every iOS
browser is forced onto WebKit, so an iPad cannot drive the parts of this app
that listen to a keyboard. See `DECISIONS.md` for the detail.

Everything else works everywhere, including on a tablet: the wheel, the
play-along charts, the on-screen keyboard.

Web MIDI also requires a secure context. `localhost` counts; a deployed
`http://` origin does not, and will disable MIDI with no error message. Serve
over HTTPS.

---

## Stack

| Layer  | Choice                                                   |
| ------ | -------------------------------------------------------- |
| App    | SvelteKit 2 · Svelte 5 (runes) · TypeScript · Tailwind 4 |
| Build  | Vite 8 · `@vite-pwa/sveltekit`                           |
| Data   | Postgres 15+ · Drizzle ORM · `node-postgres`             |
| Audio  | Tone.js — ear drills and backing tracks only             |
| MIDI   | Web MIDI API                                             |
| Deploy | `adapter-auto` — Vercel, Netlify, Cloudflare, or Node    |
| Tests  | Vitest                                                   |

Your instrument makes its own sound, so the app never synthesises a piano voice
for what you play. It only generates audio for ear drills, backing tracks and
the metronome — which is why there are no sampled instruments to vendor and the
whole thing is a few hundred kilobytes.

---

## Running it locally

You need **Node 22+** and a **Postgres 15+**. Docker gives you the second one.

```bash
git clone https://github.com/bparticle/roundel.git
cd roundel
npm install
cp .env.example .env    # the defaults already match docker-compose
npm run db:up           # start Postgres in Docker
npm run db:migrate      # apply the schema
npm run db:seed         # skills and chord charts
npm run account:create -- owner "Your name" "you@example.com"
npm run dev
```

The account command prints a temporary password when one is not supplied. Open
`http://localhost:5173`, sign in with it, then change it from **Account**.
Practice material is created as you go, so a fresh account starts with one
thing to learn rather than three thousand.

Already have a Postgres? Skip `db:up` and point `DATABASE_URL` at it.

---

## Deploying it

`adapter-auto` detects Vercel, Netlify, Cloudflare Pages and Azure with no
configuration. Set the two environment variables from `.env.example` in your
host's dashboard, point it at any Postgres, and run `npm run db:migrate` once
against that database. Provision the owner account against the same
`DATABASE_URL` before signing out of an older single-player session.

To self-host instead, install `@sveltejs/adapter-node` and set it in
`vite.config.ts`; `npm run build` then produces a plain Node server.

Two things to get right wherever you put it:

- **Serve over HTTPS.** Web MIDI silently does nothing on an insecure origin.
- **Keep `AUTH_SECRET` long and private.** It signs every login cookie. Read
  `SECURITY.md` before putting the family beta anywhere public.

---

## Invite-only accounts

The first account must keep the original player's fixed id so the practice
history already in the database stays with its owner:

```bash
npm run account:create -- owner "Bruno" "bruno@example.com"
```

Add each family member with the `add` subcommand:

```bash
npm run account:create -- add "Family member" "player@example.com"
```

Each command prints a generated temporary password. Send it to that person out
of band; they can change it under **Account**, which also signs out any other
device. Running the command again for the same email resets that account's
password. A new account receives a fresh copy of the default palette, wheel and
practice preferences, starts at C major, and sees none of another account's
custom charts or progress.

Each account wears a **chromatic portrait** in the top-right menu — four of the
twelve pitch colours and one geometric shape, derived from the name. Nothing is
uploaded and nothing is stored: the same name always draws the same portrait, so
two people sharing a laptop can see whose progress is on screen at a glance.

This is intentionally an operator-managed family beta. There is no public
registration or email-based recovery yet; the remaining public-account work is
tracked under M12 in `ROADMAP.md`.

---

## The first run

A new account lands on **Today** with the tour already open. It runs once per
person per browser, and the profile menu replays it at any time.

It starts at the instrument rather than at a feature list. The first card asks
whether you have played before, then offers to connect MIDI — and then asks for
**three different notes** before it will call the connection good, because a
stuck key pressed twice looks exactly like a working piano to everything except
a count of distinct notes. Choosing the on-screen keyboard instead is a first-
class answer, not a fallback: the tour continues on that route and says so.

The answer about experience changes two settings and nothing else — how long a
workout is aimed to be, and how long you get before a chord is revealed. **It
does not move the ladder.** One answer on a welcome screen should not turn into
durable learning progress, and every key and rung is startable from Today
anyway.

Then it walks the five pages — Today, Play, Play along, Songbook, Explore —
lighting the part of each one it is talking about.

### The pedal is the way through

The second card asks for a press of the damper pedal, and that press is the
lesson: from there the pedal advances the tour, and everywhere else in the app it
means the same thing as the primary button. Next question on a workout task, open
the play-along on a mission, play and pause the band. The spacebar and the large
on-screen button do the same job for anyone without a pedal.

While the tour is open it takes the pedal from the page underneath, so an early
press cannot start the band or answer a card through the overlay it was aimed at.

---

## Scripts

| Command                       | Does                                         |
| ----------------------------- | -------------------------------------------- |
| `npm run dev`                 | Dev server on `:5173`                        |
| `npm run build`               | Production build                             |
| `npm test`                    | Vitest, once                                 |
| `npm run test:watch`          | Vitest, watching                             |
| `npm run check`               | `svelte-check` type check                    |
| `npm run format`              | Format with Prettier                         |
| `npm run verify`              | Format check, types and tests — what CI runs |
| `npm run db:generate`         | Generate migration SQL from the schema       |
| `npm run db:migrate`          | Apply pending migrations                     |
| `npm run db:studio`           | Drizzle Studio                               |
| `npm run db:seed`             | Seed the skills and chord charts             |
| `npm run account:create -- …` | Create or reset an invite-only account       |
| `npm run db:up`               | Start the local dev Postgres in Docker       |
| `npm run db:down`             | Stop it                                      |

---

## Architecture

```
src/
  lib/
    design/        Colour science and design tokens
      color.ts       OKLCH <-> sRGB, gamut clamping, WCAG contrast
      palette.ts     12 pitch-class colours, ground, ink
      avatar.ts      A chromatic portrait derived from a name; no upload, no row
    music/         Music core
      note.ts        Note as letter + alter + octave; midi and pitch class derived
      interval.ts    Intervals as (diatonic steps, semitones); transposition
      key.ts         Keys, scales, all modes, circle-of-fifths distance
      spell.ts       spell(pitchClass, key, harmonicFunction) - used everywhere
      chord.ts       Abstract chord vs concrete voicing; symbols; diatonic harmony
      recognise.ts   Ranked candidates with confidence and reasoning
      analyse.ts     Roman numerals, secondary dominants, subs, modulation
      voiceleading.ts  Distance between chords; neighbours one or two notes away
      symbol.ts        Chord symbols split into typographic parts
      study.ts         What key each chord of a progression is heard in
      scales.ts        Scale suggestions, and every degree named
      __fixtures__/  263 hand-authored golden fixtures
    wheel/         The harmonic wheel
      geometry.ts    Ring/position to pitch class; shapes derived from intervals
      rotation.svelte.ts  Drag momentum, friction, detent snapping
      overlays.ts    Key, chord neighbours, brightness axis, modulation
      Wheel.svelte   Parametric SVG; knows no music, only cells
    curriculum/    The syllabus, as data
      cards.ts       Card generation from (skill, key, item, direction), and the
                     L0-L11 skill graph they are generated against
      ladder.ts      Twelve keys, seven rungs each; suggests, never gates
      progressions.ts  Named progressions to work on instead of a rung
      vocabulary.ts  What a tune asks of your hands, and what the ladder and
                     the progressions have taught. Both derived, so a mission
                     is never set on chords nobody has been shown
      walk.test.ts   The climb, counted: how much of the songbook opens at
                     each step. Meant to be read when it fails
      charts.ts      Forms, cycles, public-domain standards and traditionals,
                     as numerals, with the words where a tune is sung
      import.ts      Chord symbols you type in, stored as numerals
      editor.ts      Writing a chart down: what each bar stores, and what
                     comes back out. Shared by the editor, the server and
                     the songbook script, so all three agree
      lyrics.ts      Chords written above the words; splits a sung line
                     onto the bars it is sung over
    practice/      Being judged on what you play
      match.ts       Did you land the chord, and where did your notes sit
      goal.ts        Was a mission's goal met, judged from the chords it judged
      form.ts        How much of the tune a run has been round. What a badge
                     waits on, and what a chorus is counted in
      target.svelte.ts  Lends the sounding chord to the header
      run.ts         A run of the transport on its way to the record, and the
                     outbox that holds it when the network is away
    effects/       The fun, on a switch, kept apart from the score
      streak.ts      Chords landed in a row, and the ladder of tiers
      badges.ts      What the streaks leave behind, one shelf per tune
      sparkle.ts     Burst geometry
    audio/         Generated, never sampled
      backing.ts     The transport: bars, loops, count-in, live tempo
      bass.ts        Bass lines from the chart: walking, boogie, roots, driving
      groove.ts      The nine grooves — kit, bass style, comping and feel
    session/       The daily workout
      workout.ts     Which tasks today holds, composed from the record and
                     the date, and seeded so a reload resumes rather than re-rolls
      progress.ts    A stored workout and its blocks, read back as where you are
      report.ts      What changed while it ran - counted, never estimated
      drill.ts       Posing one card, and marking what was played or named
    srs/
      scheduler.ts   FSRS via ts-fsrs; direction and cold-key weighting
    midi/          Web MIDI and chord clustering
      cluster.ts     Note-ons gathered into chord events; pedal handling
      smf.ts         Standard MIDI File encode and decode - parked, see M6
      session.svelte.ts  Devices, hot-plug, live state, recording
      shared.svelte.ts   One connection, shared by every page
    components/
      Glyph.svelte       Musical accidentals as vectors
      ChordSymbol.svelte Composed chord symbols with spoken labels
      Keyboard.svelte    On-screen keyboard; the no-MIDI fallback
      ChartEditor.svelte A grid of bars, checked as you type
      OnboardingTour.svelte  The first run: set the instrument up, learn the
                     pedal, then walk the five pages
      UserAvatar.svelte  The chromatic portrait, drawn
      PlayAlong.svelte   The play-along page, shared by /backing and /demo
      StreakBadges.svelte  This tune's six sockets
      Fireworks.svelte   Sparks, bursts and callouts
    server/
      auth.ts        Signed, revocable session cookie
      password.ts    Versioned scrypt password hashing
      db/
        schema.ts    All 17 tables
        index.ts     Drizzle client
        user.ts      currentUserId() - the whole multi-user seam
        accounts.ts  Provisioning an invite-only account, and resetting one
        settings.ts  Per-account settings, cloned from defaults
        session-store.ts  Workouts, blocks, reviews, and card creation
        play-log.ts  The play-along record: runs, chords judged, badges
    settings.ts    Shared setting types and defaults
    onboarding.ts  What the first run asks, and what its answers may change
  routes/
    layout.css     Design tokens as Tailwind theme
    +layout.*      Injects the database-owned palette during SSR
    +page.*        Today: the departure board, and the network you pick from
    play/          Name what you play, live
    backing/       Play along, for the player who owns the instance
    demo/          The same page, public, writing nothing
    explore/       The wheel with every overlay
    profile/       What has actually happened
    session/       Today's workout, task by task
    songbook/      Finding a tune, and writing one down
    settings/
      wheel/       Calibration against your physical wheel
      colours/     OKLCH palette editor with live contrast
    account/       Password and session controls
    api/settings/  Patches the signed-in account's settings
    api/session/   The workout's write endpoint
    api/runs/      Where a run of the transport is written down
    login/         Email and password sign-in
    logout/        Drops the cookie
  hooks.server.ts  Redirects unauthenticated requests to /login, and puts
                   what the cookie claims on event.locals
```

### Two things worth knowing before editing

**Notes are spelled, never numbered.** A note is `{ letter, alter, octave }` —
pitch class and MIDI number are _derived_. In E♭ major the fourth degree is A♭,
never G♯. Storing notes as integers and back-inferring spelling poisons every
downstream feature, so the music core resolves spelling against a key context
everywhere.

**The twelve pitch colours are database-owned.** They are not in any stylesheet.
They live in `settings.color_map_json`, are injected as `--pc-0` … `--pc-11`
during SSR, and each carries a computed contrast-safe `--pc-N-ink` so text on a
swatch is never unreadable — including after you have edited the palette to
match your physical wheel. Structural colours (ground, ink) _are_ in
`layout.css`, and a test fails if they drift from `palette.ts`.

---

## Deployment

Vercel, connected to the repo. Set `DATABASE_URL` and `AUTH_SECRET` as
environment variables in the project settings. Migrations do
not run automatically — apply them with `npm run db:migrate` against the
production `DATABASE_URL` when the schema changes.

`docker-compose.yml` is **not** a deployment artifact. It exists only to run a
local Postgres for development and tests.

---

## Milestones

| M       | Deliverable                                | Status |
| ------- | ------------------------------------------ | ------ |
| **M0**  | Repo, DB, migrations, test runner, tokens  | done   |
| **M1**  | Music core + golden fixtures               | done   |
| **M2**  | Harmonic wheel component                   | done   |
| **M3**  | MIDI layer                                 | done   |
| **M4**  | SRS + seeded skill graph                   | done   |
| **M5**  | Session engine                             | done   |
| **M7**  | Backing tracks and play-along              | done   |
| **M9**  | The record, and the multi-user seam        | done   |
| **M10** | The profile                                | done   |
| **M11** | The chart editor                           | done   |
| **M14** | The way in — the public demo               | done   |
| **M15** | The practice room, rebuilt around the band | done   |
| **M16** | Tempo as the other axis                    | done   |

M5 built the session engine and M15 replaced it. The six timed blocks are gone —
the rows they wrote are still counted, and the reasoning for taking them out is
in `DECISIONS.md`.

Work after M7 shipped unnumbered, all of it on the play-along page: chord-by-chord
scoring against the sounding chord, the chart following the music, streaks and
badges, the suggested scales drawn on a keyboard, and every key in them named
with its degree. `DECISIONS.md` has the reasoning for each.

Since M16, also unnumbered and all of it from playing the thing: a **readiness
gate**, so a mission is only ever set on a tune whose chords have been taught; a
**badge that waits for the form** to have been round before it lands; and **the
songbook** — a room of its own for finding a tune and writing one down, which
used to be a sidebar and an editor standing in the practice area. What is still
open is in `ROADMAP.md` under _What the readiness gate left open_.

Since the family beta, and all of it about arriving: **the first run**, a tour
that sets the instrument up before it explains anything; **the pedal as
navigation**, which the tour teaches by taking a press and which now means _next_
on every page; a **chromatic portrait** per account, derived from the name; and
the **wheel following your hands** on Explore, so the study bench never looks
disconnected from the piano.

### In progress and planned

| M       | Deliverable                                                     | Status      |
| ------- | --------------------------------------------------------------- | ----------- |
| **M12** | Accounts — real credentials, and every owned row actually owned | family beta |
| **M13** | The subscription — a hosted instance somebody else can pay for  | planned     |

`ROADMAP.md` holds the plan: schema, scope, order and the decisions still open.
This table carries status and nothing else, so the two cannot drift into
different accounts of the same work.

`DECISIONS.md` records every non-obvious choice and why it was made, including
the ones that turned out to be wrong. It is the most useful thing to read
before proposing an architectural change.

### Not built, on purpose

Still deliberately unbuilt, and nothing in the app hints at any of it, because a
menu item leading nowhere is worse than an absence.

| Deliverable          | Why it is parked                                                       |
| -------------------- | ---------------------------------------------------------------------- |
| The vault            | Nothing yet produces recorded MIDI to browse                           |
| Transfer detection   | Its consumer, the mastery gate, was deleted in the depth-first rebuild |
| **M8** — songwriting | Wanted later; smaller than it was, now M11 has built the grid          |

The blind-spot report was parked with the other two and is now unblocked, with
the rows it needs already being written: M9 records every chord judged on the
play-along page, which is the capture habit the vault was supposed to supply,
and the profile's _where the time went_ panel is its first draft. M15 took the
next step and used it: the same grouping now steers which key and which chord
quality a mission is set on, so the blind spots arrive as an input to practice
before they ever arrive as a report. What is still unbuilt is the part that says
something out loud. See `ROADMAP.md`, _What this changes about the parked
milestones_, and `DECISIONS.md` under _M6 is parked_ for what was kept for
whoever builds the rest.

---

## The daily workout

**Today** is a workout: three to seven tasks, composed fresh each morning, each
one ending because its goal was met rather than because a clock ran out.

One rule decides what is in it. **If the band can ask it, the band asks it** —
so anything the play-along page can pose belongs there, with a rhythm section
behind it and chord-by-chord judging in front, rather than in a thinner copy of
it somewhere else. What is left is the handful of questions a chart cannot ask,
plus the chart itself under a constraint:

| Task              | What it asks                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| **On sight**      | Six symbols, read and played. Only shapes not yet shown to be playable, so most mornings there are none |
| **Ear**           | Ten questions: listen and play it back, or listen and name it                                           |
| **Function**      | Eight degrees, spread across keys: "IV — E♭", played and then named                                     |
| **The hinge**     | Six pivots: one chord doing two jobs, named by its function in two keys at once                         |
| **Mission**       | The play-along page itself, with a key, a tempo floor, a groove and a bar to clear                      |
| **One new thing** | A single unseen item: the next rung, a progression, a groove never played over. Shown once, tried once  |

**On sight** is the one task the band could ask, and it is here anyway for as
long as the symbol is new: it is the only question that shows you a chord's name
and its notes at once, so it is where the material arrives. A shape you have
shown you can play leaves the pool and comes back only if you fail it. It leads
the workout when there is anything in it, and takes nothing from the rest of the
day — meeting a chord is not one of the day's exercises, so it does not cost
one.

The tasks are composed from four inputs — what spaced repetition says is due,
where the ladder has got to, the keys and chord qualities the record shows you
avoiding, and one slot kept for something you have not met. Composition is
seeded on the date, so a reload resumes the same workout and tomorrow's is
genuinely a different one.

**A task never runs out of questions.** The ear task fills its ten from the due
pile first, then near-due, then anything already reached — so "nothing due
today" is not a sentence it can produce, which is what a well-scheduled deck
used to say most days.

**A mission is the play-along page, not a version of it.** It opens the real
page with the constraint in the address bar, so the scoring, the streaks, the
badges and the record are the same ones, and the verdict is worked out from the
chords that were actually judged — traceable afterwards to the run that earned
it. Missions are aimed at what the record shows you avoiding, which is how
twelve keys stop being four.

**And only ever at a tune you have been taught the chords of.** Each chart
derives its own demand from its grid — the shapes it uses, and the ways it leaves
the key — and the ladder and the progression library derive what they have
taught. The ladder teaches shapes and never leaves a key; the library teaches the
four ways out of one, a level each. Where what you know does not cover what a
tune asks there is no mission, and the workout says which tune is nearest, what
it wants and where that is taught, rather than sending you to a cycle of chords
nobody has mentioned.

Short, standard and long are three, four and five tasks. Minutes were always an
estimate; tasks are countable, which is why the home screen can show exactly
what today holds instead of a set of durations that never varied — and on the
first day or two, when there is one rung reached and no tune is playable yet, it
shows the shorter count it can actually fill instead of a round number.

The end screen says what changed, and every figure on it traces to a row: the
questions this workout graded against the last workout that graded any, each
mission's verdict, a key the record held nothing in before today, a badge won
by a run this workout set. Where a number would have to be estimated there is
no line at all, and a shortfall is stated as a distance rather than as a
failure.

### Choosing what to practise

The home screen is a network diagram, not a verdict. Seven lines are the seven
rungs, twelve stations are the twelve keys, and how far each line has been built
is the frontier drawn as a shape. Every station and every line is pressable
whether or not the ladder has got there — the ladder marks its suggestion and
nothing else. Pinning one leads the workout's queues and takes it to that key; it
gates nothing, and it leaves the ladder exactly where it was, because exploring
and advancing are separate decisions.

**Travel and open never share a control.** Pressing the map costs nothing and
moves nothing. The one panel that changes what exists is named for the station
you are reading and offers the move that reaches it — open a line one more stop,
open the next line, or close the last stop. Nothing there is a lock.

Cards for a step you have never visited are created the moment you pick it, so a
station the ladder has not reached is still somewhere a workout can depart from —
it simply says it is ahead of the ladder while you are there.

Finishing a workout offers another one. There is no maximum, no daily streak and
no calendar of dots: "you have practised enough today" is a sentence this app has
no business saying, and so is anything at all about a day you did not play.

---

## Playing along

**Play along** generates a rhythm section from a chord chart: walking bass,
drums, and comping that is off by default. Nothing is recorded — the line and
the pattern are computed from the chart — so every form plays in all twelve keys
at any tempo without a single audio file existing.

Charts are stored as Roman numerals (`I7 · IV7 · V7`) and resolved into a key at
the last moment, which is what makes "the same blues in E♭" a parameter rather
than a second chart. Tap a bar to loop it and another to stretch the loop out;
tempo moves under a running track because every event is scheduled in musical
time rather than seconds.

Every bar is tinted by its root, in the same twelve colours the wheel and the
keyboard use, so a form's harmonic motion is visible before a note is played.
Whichever bar is selected — the one sounding, or the last one tapped — is taken
apart underneath: chord symbol, Roman numeral, each note with its scale degree,
and the shape under the hands.

The charts come in three kinds, and the difference is deliberate:

|           |                                                                         |
| --------- | ----------------------------------------------------------------------- |
| Forms     | The generic shapes: blues, minor blues, rhythm changes, a vamp          |
| Cycles    | Named devices — bird blues, the three-tonic cycle, ii–V round the wheel |
| Standards | Real repertoire, public domain only: US publication ≤ 1930              |
| Yours     | Whatever you typed in, kept in the database                             |

There is no fake book here. Every standard records its publication year, a test
enforces that the year exists and is 1930 or earlier, and nothing in copyright
ships in the repo.

### Typing in your own

**+ Add a chart** takes a tune the way it is written on paper:

```
| Dm7 | G7 | Cmaj7 | Cmaj7 |
| Am7 D7 | Dm7 G7 | Cmaj7 | Cmaj7 |
```

Say which key it is written in and it is stored as Roman numerals, so typing it
once gives you all twelve keys. Bars are split on `|`, chords within a bar on
spaces, and repeat marks are ignored. A chord it cannot read is named with its
line number and the rest of the chart is kept — one typo should not cost you a
re-type.

Charts you add live only in your database. That is the right place for anything
still in copyright, and it never enters the repo.

This page under a constraint — a key, a tempo floor, a groove and a bar to clear
— is a workout's **mission**. Not a copy of it with fewer knobs: the same page,
reading a few more parameters out of the address bar, still scoring and still
keeping badges.

---

## The record

Every run of the transport is written down: the chart, the key, the tempo, how
long the transport actually ran, and one row per chord judged — what it was,
what it was heard as, and how it went. Badges are kept per tune, so six sockets
sit under each chart and "fifty in a row" means fifty in a row **on this one**.

**A badge waits for the tune to have been round.** Anything earned before the
transport has been through every bar of the form is held and lands the moment it
has — so playing from the top feels exactly as it did, and looping two bars of a
standard earns nothing however cleanly it goes. The scoring while you play is
untouched: the streak counts, the callouts fire, and the strip says what is
being held and how many bars are left.

Two consequences worth knowing. There is no stored "best": a streak cannot
outlive the transport, so the best ever is simply the highest any run reached,
which means the number and the badges cannot drift apart. And a run played with
the network away is queued in the browser and sent on the next load, because a
run played on a train should not cost a badge.

**Profile** — in the settings menu, not the main nav — is where that is read
back. It opens with the twelve keys round the circle of fifths, each swatch
filling with the chords judged in it, so the pale ones are the corners of the
keyboard you have not been in. Colour there means what it means everywhere else:
a key has a tonic and wears that tonic's swatch, while a chord quality has no
pitch and is drawn in weight instead.

Hours played counts the transport running and not paused, plus practice tasks
that finished; it never counts a page left open or a workout abandoned halfway.
Blocks of the six-block session that came before the workout still count too —
those hours happened, and nothing this app rebuilds gets to revise them. "Tunes practised" counts a chart something was played over, not a chart
opened. Where a figure would have to be estimated it is not shown.

There is no daily streak, no calendar of dots and no days-in-a-row counter. A
chord streak measures playing; a daily streak would measure attendance, and this
app has never told anyone off.

---

## Seeding

```bash
npm run db:seed
```

Seeds the skeleton only: the skills and the five chord charts. There is no card
bank and no simulated history, and both absences are deliberate — see
`DECISIONS.md`. Cards are created a rung at a time as the ladder is climbed, so
a new account starts with the C major scale and nothing else.

`--reset` clears every account's generated rows first and puts every ladder back at C.
Re-seeding without it matches existing rows by identity, so editing the
curriculum never orphans review history.

---

## Contributing

Pull requests are welcome. `CONTRIBUTING.md` has the setup steps and the house
rules — the constraints above are not negotiable defaults, they are the point
of the project, so it is worth reading before writing code.

```bash
npm run verify   # format check, types, tests — the same three CI runs
```

## Licence

**AGPL-3.0-or-later.** See `LICENSE`. Copyright © 2026 the Roundel
contributors.

Run it, read it, change it, fork it, host it for yourself. The licence asks one
thing in return, and only of one kind of user: if you run a **modified** version
as a service other people use over a network, publish your changes. Running it
unmodified costs you nothing, self-hosting costs you nothing, and forking is
explicitly fine.

`DECISIONS.md` records the reasoning behind it, and what it does and does
not restrict.

Bundled musical material is generic (blues, rhythm changes, modal vamps, ii–V
cycles) or public domain, and every bundled standard records its publication
year. Nothing in copyright ships in this repository.
