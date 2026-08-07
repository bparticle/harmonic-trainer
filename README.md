# Harmonic Trainer

A practice tool for naming what your hands already do.

Plenty of musicians can play far more than they can name. You improvise
fluently, you hear where a chord wants to go, and you could not say what you
just played or repeat it in another key. This is for that gap.

Not a music theory course. Two jobs: **name** the chords and progressions
already under your fingers, and **perturb** them one voicing or substitution at
a time, so new material grows out of what you can already play.

```
NAME → PERTURB → RECOGNISE → APPLY
```

**No staff notation, anywhere, ever.** Not as an option, a toggle or an
advanced panel. Music is keyboard diagrams, a harmonic wheel, chord symbols,
scale-degree numbers, Roman numerals, intervals and colour. If you read chord
charts fluently and staves not at all, nothing here will ask you to.

Free software, MIT licensed. Run it on your laptop, deploy it wherever you
like, change whatever you want. It is designed to be one person's instance —
there are no accounts, no telemetry, and no server anyone else controls.

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
git clone https://github.com/bparticle/siriuspiano.git
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
      __fixtures__/  263 hand-authored golden fixtures
    wheel/         The harmonic wheel
      geometry.ts    Ring/position to pitch class; shapes derived from intervals
      rotation.svelte.ts  Drag momentum, friction, detent snapping
      overlays.ts    Key, chord neighbours, brightness axis, modulation
      Wheel.svelte   Parametric SVG; knows no music, only cells
    curriculum/    The syllabus, as data
      skills.ts      The L0-L11 graph plus the application track
      cards.ts       Card generation from (skill, key, item, direction)
      ladder.ts      Twelve keys, seven rungs each; suggests, never gates
      charts.ts      Forms, cycles and public-domain standards, as numerals
      import.ts      Chord symbols you type in, stored as numerals
    srs/
      scheduler.ts   FSRS via ts-fsrs; direction and cold-key weighting
    midi/          Web MIDI and chord clustering
      cluster.ts     Note-ons gathered into chord events; pedal handling
      smf.ts         Standard MIDI File encode and decode — parked, see M6
      session.svelte.ts  Devices, hot-plug, live state, recording
    components/
      Glyph.svelte       Musical accidentals as vectors
      ChordSymbol.svelte Composed chord symbols with spoken labels
      Keyboard.svelte    On-screen keyboard; the no-MIDI fallback
    server/
      auth.ts        Password check and signed session cookie
      db/
        schema.ts    All 12 tables
        index.ts     Drizzle client
        settings.ts  The singleton settings row
    settings.ts    Shared setting types and defaults
  routes/
    layout.css     Design tokens as Tailwind theme
    +layout.*      Injects the database-owned palette during SSR
    explore/       The wheel with every overlay
    settings/
      wheel/       Calibration against your physical wheel
      colours/     OKLCH palette editor with live contrast
    api/settings/  Patches the singleton settings row
    login/         The password gate
  hooks.server.ts  Redirects unauthenticated requests to /login
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

| M      | Deliverable                               | Status |
| ------ | ----------------------------------------- | ------ |
| **M0** | Repo, DB, migrations, test runner, tokens | done   |
| **M1** | Music core + golden fixtures              | done   |
| **M2** | Harmonic wheel component                  | done   |
| **M3** | MIDI layer                                | done   |
| **M4** | SRS + seeded skill graph                  | done   |
| **M5** | Session engine                            | done   |
| **M7** | Backing tracks and play-along             | done   |

`DECISIONS.md` records every non-obvious choice and why it was made, including
the ones that turned out to be wrong. It is the most useful thing to read
before proposing an architectural change.

### Not built, on purpose

Two milestones from the original brief are deliberately unbuilt. Nothing in the
app hints at either, because a menu item leading nowhere is worse than an
absence.

| M      | Deliverable                                  | Why it is parked                                            |
| ------ | -------------------------------------------- | ----------------------------------------------------------- |
| **M6** | Vault, blind-spot report, transfer detection | Needs months of recorded playing before it can say anything |
| **M8** | Songwriting mode and data export             | Wanted later, not now                                       |

The plan for both is in `DECISIONS.md` under _M6 is parked_, along with what was
kept for whoever builds it.

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

MIT. See `LICENSE`.

Bundled musical material is generic (blues, rhythm changes, modal vamps, ii–V
cycles) or public domain, and every bundled standard records its publication
year. Nothing in copyright ships in this repository.
