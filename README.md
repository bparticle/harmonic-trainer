# Harmonic Trainer

A harmonic wheel for practising chord progressions — see how they move, hear
them, and drill them until they are automatic in every key.

A progression is the real unit of harmony, not the chords in isolation: a
ii–V–I means something as a single shape, not three symbols to memorise
separately. The wheel puts that shape in front of you — spin it, transpose it,
watch a turnaround fall round the circle of fifths — while the rest of the app
makes sure you can also hear it, recognise it on your own instrument, and find
it again next week.

Not a music theory course. One loop, worked from every direction: put a
progression on the wheel, hear it, drill it across all twelve keys, and apply
it — recognising it as you play, or playing along with a generated rhythm
section.

```
SEE → HEAR → DRILL → APPLY
```

**No staff notation, anywhere, ever.** Not as an option, a toggle or an
advanced panel. Music is keyboard diagrams, the wheel itself, chord symbols,
scale-degree numbers, Roman numerals, intervals and colour. If you read chord
charts fluently and staves not at all, nothing here will ask you to.

Free software, AGPL licensed. Run it on your laptop, deploy it wherever you
like, change whatever you want. It is your own instance — no telemetry, and no
server anyone else controls. Today that means one shared password and one
player; per-player accounts are planned rather than built, and `ROADMAP.md`
says what is being done now to make them cheap later.

## What it does

- **Play** — connect a MIDI keyboard and it names what you play as you play it,
  with the reasoning, on a harmonic wheel that shows why.
- **Today** — pick any key, any step or any progression and practise it.
  Spaced repetition schedules the review; a twelve-key ladder suggests where to
  go next but never locks anything.
- **Play along** — a rhythm section generated from a chord chart. Walking bass,
  drums, optional comping, any key, any tempo, loop any bars. Blues, rhythm
  changes, cycles and public-domain standards, plus anything you type in.
- **Explore** — the wheel, chord neighbours, voice leading.
- **Profile** — what has actually happened: hours played, chords judged, badges
  won, and the twelve keys as swatches so the ones you never play are visible at
  a glance. Every number traces to a row; none is an estimate, and there is no
  daily streak.

No MIDI keyboard? Everything works with the on-screen one.

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
git clone https://github.com/bparticle/harmonic-trainer.git
cd harmonic-trainer
npm install
cp .env.example .env    # the defaults already match docker-compose
npm run db:up           # start Postgres in Docker
npm run db:migrate      # apply the schema
npm run db:seed         # skills and chord charts
npm run dev
```

Open `http://localhost:5173` and sign in with the `APP_PASSWORD` from your
`.env`. Practice material is created as you go, so a fresh install starts with
one thing to learn rather than three thousand.

Already have a Postgres? Skip `db:up` and point `DATABASE_URL` at it.

---

## Deploying it

`adapter-auto` detects Vercel, Netlify, Cloudflare Pages and Azure with no
configuration. Set the three environment variables from `.env.example` in your
host's dashboard, point it at any Postgres, and run `npm run db:migrate` once
against that database.

To self-host instead, install `@sveltejs/adapter-node` and set it in
`vite.config.ts`; `npm run build` then produces a plain Node server.

Two things to get right wherever you put it:

- **Serve over HTTPS.** Web MIDI silently does nothing on an insecure origin.
- **Set a real `APP_PASSWORD`.** It is the only thing in front of the app.
  Read `SECURITY.md` before putting it anywhere public.

---

## Scripts

| Command               | Does                                         |
| --------------------- | -------------------------------------------- |
| `npm run dev`         | Dev server on `:5173`                        |
| `npm run build`       | Production build                             |
| `npm test`            | Vitest, once                                 |
| `npm run test:watch`  | Vitest, watching                             |
| `npm run check`       | `svelte-check` type check                    |
| `npm run format`      | Format with Prettier                         |
| `npm run verify`      | Format check, types and tests — what CI runs |
| `npm run db:generate` | Generate migration SQL from the schema       |
| `npm run db:migrate`  | Apply pending migrations                     |
| `npm run db:studio`   | Drizzle Studio                               |
| `npm run db:seed`     | Seed the skills and chord charts             |
| `npm run db:up`       | Start the local dev Postgres in Docker       |
| `npm run db:down`     | Stop it                                      |

---

## Architecture

```
src/
  lib/
    design/        Colour science and design tokens
      color.ts       OKLCH <-> sRGB, gamut clamping, WCAG contrast
      palette.ts     12 pitch-class colours, ground, ink
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
    session/       The practice sitting
      plan.ts        Which blocks, in which order, for how long
      drill.ts       One block's worth of cards
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
      PlayAlong.svelte   The play-along page, shared by /backing and /demo
      StreakBadges.svelte  This tune's six sockets
      Fireworks.svelte   Sparks, bursts and callouts
    server/
      auth.ts        Password check and signed session cookie
      db/
        schema.ts    All 16 tables
        index.ts     Drizzle client
        user.ts      currentUserId() - the whole multi-user seam
        settings.ts  The singleton settings row
        session-store.ts  Sessions, blocks, reviews, and card creation
        play-log.ts  The play-along record: runs, chords judged, badges
    settings.ts    Shared setting types and defaults
  routes/
    layout.css     Design tokens as Tailwind theme
    +layout.*      Injects the database-owned palette during SSR
    +page.*        Today: pick what to practise
    play/          Name what you play, live
    backing/       Play along, for the player who owns the instance
    demo/          The same page, public, writing nothing
    explore/       The wheel with every overlay
    profile/       What has actually happened
    session/       A practice sitting, block by block
    settings/
      wheel/       Calibration against your physical wheel
      colours/     OKLCH palette editor with live contrast
    api/settings/  Patches the singleton settings row
    api/session/   The session's write endpoint
    api/runs/      Where a run of the transport is written down
    login/         The password gate
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

Vercel, connected to the repo. Set `DATABASE_URL`, `APP_PASSWORD` and
`AUTH_SECRET` as environment variables in the project settings. Migrations do
not run automatically — apply them with `npm run db:migrate` against the
production `DATABASE_URL` when the schema changes.

`docker-compose.yml` is **not** a deployment artifact. It exists only to run a
local Postgres for development and tests.

---

## Milestones

| M       | Deliverable                               | Status |
| ------- | ----------------------------------------- | ------ |
| **M0**  | Repo, DB, migrations, test runner, tokens | done   |
| **M1**  | Music core + golden fixtures              | done   |
| **M2**  | Harmonic wheel component                  | done   |
| **M3**  | MIDI layer                                | done   |
| **M4**  | SRS + seeded skill graph                  | done   |
| **M5**  | Session engine                            | done   |
| **M7**  | Backing tracks and play-along             | done   |
| **M9**  | The record, and the multi-user seam       | done   |
| **M10** | The profile                               | done   |
| **M11** | The chart editor                          | done   |
| **M14** | The way in — the public demo              | done   |

Work after M7 shipped unnumbered, all of it on the play-along page: chord-by-chord
scoring against the sounding chord, the chart following the music, streaks and
badges, the suggested scales drawn on a keyboard, and every key in them named
with its degree. `DECISIONS.md` has the reasoning for each.

### Planned

| M       | Deliverable                                                     | Status  |
| ------- | --------------------------------------------------------------- | ------- |
| **M15** | The practice room, rebuilt around the band                      | planned |
| **M12** | Accounts — real credentials, and every owned row actually owned | planned |
| **M13** | The subscription — a hosted instance somebody else can pay for  | planned |

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
and the profile's _where the time went_ panel is its first draft. See
`ROADMAP.md`, _What this changes about the parked milestones_, and
`DECISIONS.md` under _M6 is parked_ for what was kept for whoever builds the
rest.

---

## Choosing what to practise

The home screen is a picker, not a verdict. Every key, every rung and every
progression is listed and startable, whether or not the ladder has got there —
the ladder marks its suggestion and nothing else. Choosing something further
along starts a session there and leaves the ladder where it was: exploring and
advancing are separate decisions, and only the arrows at the bottom advance.

Cards for a step you have never visited are created the moment you pick it.

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

The same rhythm section, with fewer knobs and the forms only, is the "Apply it"
block of a session.

---

## The record

Every run of the transport is written down: the chart, the key, the tempo, how
long the transport actually ran, and one row per chord judged — what it was,
what it was heard as, and how it went. Badges are kept per tune, so six sockets
sit under each chart and "fifty in a row" means fifty in a row **on this one**.

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

Hours played counts the transport running and not paused, plus practice
blocks that finished; it never counts a page left open or a session abandoned
halfway. "Tunes practised" counts a chart something was played over, not a chart
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

`--reset` clears every generated row first and puts the ladder back at C.
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

**AGPL-3.0-or-later.** See `LICENSE`. Copyright © 2026 the Harmonic Trainer
contributors.

Run it, read it, change it, fork it, host it for yourself. The licence asks one
thing in return, and only of one kind of user: if you run a **modified** version
as a service other people use over a network, publish your changes. Running it
unmodified costs you nothing, self-hosting costs you nothing, and forking is
explicitly fine.

It was MIT until August 2026. `DECISIONS.md` records why it moved and what the
change is and is not meant to prevent.

Bundled musical material is generic (blues, rhythm changes, modal vamps, ii–V
cycles) or public domain, and every bundled standard records its publication
year. Nothing in copyright ships in this repository.
