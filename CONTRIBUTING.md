# Contributing

Thanks for looking. This is a small project with strong opinions; the fastest
way to get a change merged is to know what they are.

## Getting set up

You need Node 22+, Docker (or any Postgres), and a browser with Web MIDI —
Chrome, Edge or Firefox. See the README for why Safari cannot run it.

```bash
git clone https://github.com/bparticle/harmonic-trainer.git
cd harmonic-trainer
npm install
cp .env.example .env       # the defaults match docker-compose
npm run db:up              # starts Postgres
npm run db:migrate
npm run db:seed
npm run account:create -- owner "Your name" "you@example.com"
npm run dev
```

The account command prints a temporary password; there is no shared
`APP_PASSWORD` any more, and no sign-up page, so an instance with no account
provisioned has no way in.

A MIDI keyboard is optional. The on-screen keyboard feeds exactly the same
pipeline, so every feature can be exercised without hardware — including the
first-run tour, which offers it beside MIDI rather than as a fallback.

## Before you open a pull request

```bash
npm run verify   # format check, type check, tests
```

CI runs the same three. A pull request that fails them will not be reviewed
until it passes, and that is not a judgement about the change.

## The house rules

These are the constraints the project is built around. A change that breaks one
of them needs to argue the case in the pull request, not just pass the tests.

**No staff notation. Anywhere.** Not as an option, a toggle, or an advanced
panel. Music is keyboard diagrams, the harmonic wheel, chord symbols,
scale-degree numbers, Roman numerals, intervals and colour. This is the single
most load-bearing decision in the project: the whole point is to be usable by
people who read chord symbols fluently and staves not at all.

**Hands stay on the keys.** Nothing inside a practice session may require
typing or precise mouse work. Advancing happens by MIDI auto-advance, the
sustain pedal, the spacebar, or one large tap target. Type sizes assume a
screen most of a metre away. Setup screens are exempt; sessions are not.

The pedal now means _next_ on every page, so a new screen with a primary action
should subscribe to it. `midi.onPedal` returns its own cleanup and takes a
priority; return `true` from the handler to claim a press so no layer underneath
also acts on it.

**Everything transposes.** Musical material is stored as Roman numerals or
intervals and resolved into a key at the last moment. If you find yourself
writing a chord symbol into a data file, something has gone wrong.

**Notes are spelled, never numbered.** A note is `{ letter, alter, octave }`.
Pitch class and MIDI number are derived. G♯ and A♭ are different notes that
happen to sound the same, and the difference has to survive transposition.

**Celebration is a switch; the score is not behind it.** This rule used to read
"no gamification" and the app has since grown fireworks, a combo counter and a
shelf of badges — so here is what it actually means now. The honest number and
the noise made about it are separate by construction: `Tally` is what happened,
`Streak` is how loud to be about it, and nothing in the celebration feeds the
percentage on screen. Turning the fun off changes what the app celebrates and
never what it reports. Anything decorative is opt-out and obeys
`prefers-reduced-motion`.

**Hue means pitch, and nothing else.** The twelve pitch-class colours are the
app's one colour language, so a colour has to be derived from a pitch or it does
not get to be a colour. A key wears its tonic's swatch; a badge wears the chord
that clinched it. Anything with no pitch in it — a chord quality, whether a
chord landed, how many reviews were graded — is drawn in **weight**: ink, dim
ink, a dashed fill. This is the rule that keeps the palette meaning something,
and the test of it is uncomfortable on purpose: if a screen looks grey and the
only available fix would be a colour that stands for nothing, it stays grey.

**Nothing punishes.** No guilt, no daily streak, no calendar of dots, nothing
that turns a day away from the piano into a loss. Nothing goes red. A chord you
played nothing over is dropped rather than failed, because resting is something
musicians do on purpose. A chord streak measures playing; a daily streak would
measure attendance, and this app has never told anyone off.

**Nothing in copyright.** Only generic forms and public-domain material ships
in the repo, and every bundled standard records its publication year. Anything
still in copyright belongs in your own database, via the chart editor on
**Play along**.

## Code style

- Prettier decides formatting. Do not argue with it, and do not reformat code
  you are not otherwise changing.
- Boring, readable code over clever code.
- Comments explain **why**, not what. If a comment restates the line below it,
  delete it.
- No placeholder implementations, `TODO`s, or stubs on `main`. If it is not
  finished, it is not merged.
- New musical logic needs tests. The music core is the part everything else
  trusts, and "it looked right on screen" is not evidence.

## Tests

Vitest, no database required — the music core, the curriculum and the audio
generators are pure. If your change needs a database to be tested, that is
usually a sign the logic wants extracting from the query.

```bash
npm test               # once
npm run test:watch     # while working
```

## Where things live

`DECISIONS.md` is the log of every non-obvious choice and why it was made,
including the ones that turned out to be wrong. It is worth skimming before
proposing an architectural change — the question may already be answered there.
If your change overturns something in it, add an entry saying so.

`ROADMAP.md` is what is planned and not yet built, in enough detail to be picked
up cold. Two rules govern it: nothing in it is hinted at anywhere in the app
until it exists, and when a milestone lands its section is **deleted** rather
than rewritten in the past tense — the reasoning moves to `DECISIONS.md` and the
status to the README table. If you are looking for something to work on, that
file is the honest list.

## Licensing your contribution

The project is **AGPL-3.0-or-later**, and contributions are accepted under the
same terms — opening a pull request means you are offering your work under that
licence. There is no CLA and no copyright assignment; you keep your copyright.

It was MIT until August 2026, and it moved before there was anyone to ask. The
reasoning is in `DECISIONS.md`; the short version is that a hosted instance is
planned, and the AGPL is the licence that keeps self-hosting and forking free
while asking a competitor who modifies it into a service to publish what they
changed.

## Reporting bugs

Musical bugs are the interesting ones. If a chord is named wrong, a progression
resolves oddly, or a bass line sounds wrong, please include the exact chord
symbols or notes, the key, and what you expected instead. A golden-fixture case
is the ideal bug report and often the whole fix.
