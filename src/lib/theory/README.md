# Theory arcade

`/theory` is a separate five-game course. It uses the app's pitch palette,
spelled music primitives, shared MIDI session and pedal convention. It does
not import or alter the daily workout composer, ladder, cards or SRS state.

- **Circle navigator:** a full 13-note trip from C to C, clockwise or
  counter-clockwise. Recall hides unvisited station labels. Piano answers
  accept the tonic in any octave; the enharmonic spelling change is explained.
- **Signature lock:** count a major key's accidentals, then assemble their
  spelled names. C's empty signature is a valid answer. The full range includes
  C-sharp and C-flat major.
- **Chord workshop:** construct interval formulas, then find a requested chord
  tone. All intervals are measured from the root. Advanced rounds add major
  sevenths, diminished triads and half-diminished sevenths.
- **Numeral signal:** identify all seven diatonic triad degrees across major
  keys, including quality and the diminished seventh-degree triad.
- **Relative connections:** find relatives in both directions, distinguishing
  shared signatures from parallel keys with a shared tonic.

Guided rounds keep field notes visible. Recall rounds hide them; asking for a
hint prevents that question counting as independent first-try recall. Wrong
answers remain open until corrected. Each missed or hinted item is also queued
once at the end, so completing a round requires retrieving it again. There is
no timer or forced auto-advance. Three recall stars require 100% unaided first
answers, two require 75%, and one marks completion including second looks.
Guided rounds never award recall stars.

Pitch questions accept real notes. Abstract single-choice questions display
an explicit piano-controller mapping. Multi-select recipes/signatures use
touch or computer number keys, with Space or pedal to submit. Input handlers
unsubscribe on navigation and defer to modal onboarding.

## Persistence and future daily buckets

`RoundSpec` is the reproducible unit: game, mode, level, direction and seed.
`makeDeck(spec)` generates stable questions with concept IDs; `beginRound`,
`submitAnswer` and `resultOf` implement the bounded round and review queue.
These pure functions can be called by a future theory bucket without changing
how existing daily task kinds work. Daily integration is deliberately not
enabled in this addition.

Completed rounds are sent to `/api/theory`. The server validates and replays
every answer, requires completion of second looks, calculates the result and
saves an idempotent UUID. Queries are account-scoped; deletion cascades and
account exports include the raw theory rounds. Pending saves are retained in
an account-scoped browser outbox and retried on reconnection or page load.
Unfinished rounds are not persisted.

Apply `0018_theory_arcade.sql` with `npm run db:migrate` before deployment.
Run the unit tests with `npm test -- src/lib/theory`. The database integration
test requires a working, disposable `TEST_DATABASE_URL` and applied migrations:
`npm run test:integration -- src/lib/server/db/theory.integration.test.ts`.
