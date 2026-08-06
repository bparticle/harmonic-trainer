# Harmonic Trainer

A machine for naming what your hands already do.

Not a music theory course. Three jobs: **name** the progressions already under
your fingers, **perturb** them one voicing or substitution at a time so new
material grows out of old, and **prove transfer** — catch a thing learned on
Tuesday turning up unprompted in free playing two weeks later.

```
CAPTURE → NAME → PERTURB → RECOGNISE → TRANSFER
```

No staff notation, anywhere, ever. Music is represented as keyboard diagrams,
the harmonic wheel, chord symbols, scale-degree numbers, Roman numerals,
intervals and colour.

---

## Before you start: where this runs

**Practice sessions need a laptop running Chrome, Edge or Firefox.**

Web MIDI does not exist in Safari — on iOS, iPadOS _or_ macOS — and every iOS
browser is forced onto WebKit, so an iPad cannot run the parts of this app that
matter. See `DECISIONS.md` for the detail.

The iPad is still a first-class device for **Explore** mode: the wheel, the
blind-spot reports, browsing the vault. It just is not where you play.

Web MIDI also requires a secure context. Vercel serves HTTPS by default, so that
is handled; a plain `http://` origin would silently disable MIDI.

---

## Stack

| Layer  | Choice                                                   |
| ------ | -------------------------------------------------------- |
| App    | SvelteKit 2 · Svelte 5 (runes) · TypeScript · Tailwind 4 |
| Build  | Vite 8 · `@vite-pwa/sveltekit`                           |
| Data   | Neon Postgres · Drizzle ORM · `node-postgres`            |
| Audio  | Tone.js — ear drills and backing tracks only             |
| MIDI   | Web MIDI API                                             |
| Deploy | Vercel (`adapter-vercel`, Node runtime)                  |
| Tests  | Vitest                                                   |

Your digital piano makes its own sound, so the app never synthesises a piano
voice for what you play. It only generates audio for ear drills, backing tracks
and the metronome — which is why there are no sampled instruments to vendor.

---

## Getting started

```bash
npm install
```

Copy the environment template and fill it in:

```bash
cp .env.example .env
```

- `DATABASE_URL` — your Neon **pooled** connection string (the hostname
  containing `-pooler`). For local work, `npm run db:up` starts a Postgres in
  Docker and the default value in `.env.example` points at it.
- `APP_PASSWORD` — the single shared password gating the app.
- `AUTH_SECRET` — any long random string, used to sign the session cookie.

Apply the schema:

```bash
npm run db:migrate
```

Then run it:

```bash
npm run dev
```

---

## Scripts

| Command               | Does                                   |
| --------------------- | -------------------------------------- |
| `npm run dev`         | Dev server on `:5173`                  |
| `npm run build`       | Production build                       |
| `npm test`            | Vitest, once                           |
| `npm run test:watch`  | Vitest, watching                       |
| `npm run check`       | `svelte-check` type check              |
| `npm run db:generate` | Generate migration SQL from the schema |
| `npm run db:migrate`  | Apply pending migrations               |
| `npm run db:studio`   | Drizzle Studio                         |
| `npm run db:seed`     | Seed the curriculum (3024 cards)       |
| `npm run db:up`       | Start the local dev Postgres in Docker |
| `npm run db:down`     | Stop it                                |

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
      charts.ts      Blues, minor blues, rhythm changes, modal vamps
      mastery.ts     Unlock gating; needs transfer, not just accuracy
    srs/
      scheduler.ts   FSRS via ts-fsrs; direction and cold-key weighting
    midi/          Web MIDI, clustering, take recording
      cluster.ts     Note-ons gathered into chord events; pedal handling
      smf.ts         Standard MIDI File encode and decode
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

| M      | Deliverable                                  | Status |
| ------ | -------------------------------------------- | ------ |
| **M0** | Repo, DB, migrations, test runner, tokens    | done   |
| **M1** | Music core + golden fixtures                 | done   |
| **M2** | Harmonic wheel component                     | done   |
| **M3** | MIDI layer                                   | done   |
| **M4** | SRS + seeded skill graph                     | done   |
| **M5** | Session engine                               | done   |
| **M6** | Vault, blind-spot report, transfer detection | later  |
| **M7** | Backing tracks and play-along                | done   |
| **M8** | Songwriting mode and data export             |        |

`DECISIONS.md` records every non-obvious choice and why it was made.

---

## Playing along

**Play along** generates a rhythm section from a chord chart: walking bass,
brushed drums, and comping that is off by default. Nothing is recorded — the
line and the pattern are computed from the chart — so every form plays in all
twelve keys at any tempo without a single audio file existing.

Charts are stored as Roman numerals (`I7 · IV7 · V7`) and resolved into a key at
the last moment, which is what makes "the same blues in E♭" a parameter rather
than a second chart. Tap a bar to loop it and another to stretch the loop out;
tempo moves under a running track because every event is scheduled in musical
time rather than seconds.

The same rhythm section, with fewer knobs, is the "Apply it" block of a session.

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
