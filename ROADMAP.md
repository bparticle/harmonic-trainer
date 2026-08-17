# Roadmap

What is planned and not yet built, in enough detail to be picked up cold.

Two rules govern this file, both learned the hard way and both recorded in
`DECISIONS.md`:

- **Nothing here is hinted at in the app until it exists.** A menu item leading
  nowhere is worse than an absence, and documentation describing software that
  does not exist is the same bug as a button that does nothing.
- **The README carries status, this file carries detail.** One line per
  milestone there, the plan here, so the two cannot drift apart into two
  different accounts of the same work.

When a milestone lands, its section moves out of here: the reasoning goes to
`DECISIONS.md` in prose, the status goes to the README table, and what is left
of the plan is deleted rather than left standing as a description of the past.

---

## Where this came from

Four requirements, stated by the owner:

1. Aim for a multi-user setup — prepare for it now, build it later.
2. Chord badges become **per song**, so every tune keeps its own best streak.
3. Track everything, and put it on a profile: badges, tunes practised, hours
   played.
4. A real chord editor for adding tunes. The current one is a text box that
   wants pipe characters and tells you what was wrong only after you save.

Everything below is derived from those four. Where a requirement forced a choice
that was not in it, the choice is argued in `DECISIONS.md` rather than smuggled
in here.

---

## M9 — The record

**Persistence for everything the play-along page already knows, a user to own
it, and per-song badges.** Nothing else on this list works until this does.

Today the streak record — `best`, `bestByChart`, six badges — lives in
localStorage under `backing:streaks-v1`, and the per-chord judgements that
produced it are discarded when the page closes. The reason given at the time was
half "the parked tables should not start quietly filling up" (still true, and
they are not the right shape anyway) and half "nobody asked for it" (spent).

### The user seam

Accounts are not being built here. What is being built is the seam they will
arrive through, so that arriving is a change in one function rather than a
migration of every table.

- A `users` table with **exactly one row**, seeded by the migration: the local
  player. Client-generated UUID, per the schema's own convention.
- Columns are `id`, `name`, `created_at` and nothing else. No `email`, no
  `password_hash` sitting empty against the day accounts land — nothing exists
  until it is reached, and an unused column is the same smell as an unread
  table.
- `currentUserId()` in `src/lib/server/db/user.ts`, the single accessor. Today
  it resolves to the seeded row. Later it reads the cookie's claim. **Every
  query that touches owned data goes through it from day one**, which is the
  entire point of doing this now.
- The session token gains the user in front of the timestamp:
  `userId.issuedAt.signature`, signed exactly as now. A payload with no dot in
  it is an old cookie and resolves to the local player, so nobody is signed out
  by the change. `verifyToken` returns the id or null instead of a boolean, and
  `event.locals` gains `userId` beside `authed`.

### What the seam is not allowed to pretend

`SECURITY.md` states the threat model plainly: one shared password, no roles, no
reset, no rate limiting, adequate for a personal instance and not for anything
else. That sentence is also the hard boundary on this milestone.

**Multi-user cannot ship on a shared password.** Two players behind one secret
are not two users; they are one login with two names on it, and every row's
`user_id` would be decoration. So the order is fixed: the seam now, real
per-player credentials before a second row is ever inserted into `users`.

Building the seam changes none of that today, which is why it is safe to build.
The signed payload naming a user is not a security claim — `AUTH_SECRET` still
gates minting a token at all — it is a place for the answer to live once there
is more than one.

When accounts do land, these say something that will have stopped being true and
must change in the same release: `SECURITY.md` (threat model and "no
multi-tenancy"), `.env.example`, the README's opening claim, and the public
landing copy in `LandingPage.svelte`. None of them is edited now, because the
app must not hint at what it cannot do.

Worth a second look at the same time, though not a blocker: `db/index.ts` picks
its driver and a pool of exactly one partly on the grounds that this is a
single-user app.

Which tables get `user_id` now: **the ones this work writes to.** New tables
carry it `NOT NULL` from the first migration.

`charts` gets it here too. The original plan was to add it during M11, which was
in that table anyway — and M11 deliberately did not, because the column is
useless without the `users` row it points at and the accessor every query goes
through, and inventing half of this seam early would have been the worse of the
two mistakes. So it is a column and a backfill in this milestone: one row's
worth of data, pointed at the one user that now exists.

`cards`, `srs_state`, `reviews`, `sessions`, `session_blocks`, `takes` and the
rest do **not** — not because they will never need it, but because each needs a
decision that cannot honestly be made without users existing (is the seeded
skill graph shared? is a chart you typed in visible to the other player?), and
guessing now buys nothing.

### Settings, and who owns them

`settings` is the interesting one. It is a singleton pinned to `id = 1` by a
check constraint, and it looks like the hardest thing here to move — until you
ask what is actually in it. Half of it is not a preference at all.

| Belongs to the instrument (stays singleton)  | Belongs to the player (moves per-user) |
| -------------------------------------------- | -------------------------------------- |
| `color_map_json` — matches physical stickers | `sessionLengthMinutes`                 |
| `wheel_config_json` — matches a real wheel   | `revealDelayMs`                        |
| `midi_device`                                | `ladderKey`, `ladderRung`              |
| `midiLatencyOffsetMs`                        | `chordClusterWindowMs`                 |

The twelve colours exist to match coloured stickers on real keys; the wheel
calibration exists to match a physical wheel somebody built by hand. Two players
at the same piano would want both identical. So the singleton keeps what belongs
to the room, player prefs become a `user_prefs` row keyed by `user_id`, and the
check constraint never has to be dropped.

**None of this is built in M9.** It is analysis, recorded where the seam is
designed, because splitting a table for one player buys nothing and would be
the same mistake as putting `user_id` on all twelve tables today. The split
happens when accounts do.

The two on the bottom row are judgement calls, flagged rather than settled:
latency is a property of the cable and the machine, while how wide a rolled
chord may be before it stops being one chord is a property of the hands.

### The log

Two new tables. One row per run of the transport, and one row per judged chord.

```
play_runs
  id             uuid pk          -- client-generated, so a run can be written offline
  user_id        uuid not null -> users
  chart_slug     text not null    -- slug not FK: the built-in charts live in code
  chart_id       uuid -> charts   -- set only for a chart of your own
  key_center     text not null
  bpm            int not null
  feel           text not null
  started_at     timestamptz not null
  ended_at       timestamptz
  playing_ms     int not null     -- transport actually running; see "the clock"
  voiced         int not null     -- the Tally, flattened
  landed         int not null
  partial        int not null
  missed         int not null
  notes_chord    int not null
  notes_colour   int not null
  notes_outside  int not null
  best_streak    int not null
```

```
chord_attempts
  id             uuid pk
  run_id         uuid not null -> play_runs on delete cascade
  bar            int not null     -- bar of the form, not of the loop
  chord          text not null    -- as it sounded, in the key it was played in
  numeral        text not null    -- as the chart stores it
  local_key      text not null    -- the key it was heard in, from studyProgression
  landing        text not null    -- 'landed' | 'partial' | 'missed'
  found          smallint not null
  needed         smallint not null
  notes_chord    smallint not null
  notes_colour   smallint not null
  notes_outside  smallint not null
  at_ms          int not null     -- offset into the run
```

The `Tally` is flattened into columns rather than kept as `jsonb` because the
profile sums it on every load and it is a closed vocabulary — seven numbers,
unchanged since the day scoring shipped. `analysis_facts` is narrow and long for
the opposite reason: its dimensions keep being added to.

`chord_attempts` carries no `user_id`. It cannot exist without its run, and the
run has one. The cost is a join on every profile query; the alternative is the
same fact stored twice and able to disagree.

Volume is a few thousand rows for an hour of playing. Keep them; this is the
grain the blind-spot report needs, and it cannot be reconstructed after the
fact.

### Badges

```
badges
  id             uuid pk
  user_id        uuid not null -> users
  chart_slug     text not null
  tier           text not null    -- the stable tier id, never the name
  won_at         timestamptz not null
  count          int not null     -- the streak that clinched it
  pc             smallint not null -- pitch class of the clinching chord: its colour
  key_center     text not null    -- new: the key it was won in
  run_id         uuid -> play_runs on delete set null
  unique (user_id, chart_slug, tier)
```

A badge is a milestone; a run is telemetry. Different lifetimes, so a separate
table rather than a `GROUP BY` over the log — if the log is ever pruned, the
shelf must survive it.

The unique constraint is the first-earned-wins rule, moved out of TypeScript and
into the schema: `insert … on conflict do nothing` is now the whole of it.

`best` and `bestByChart` stop being stored at all. **A streak cannot outlive the
transport** — it is counted from the moment the transport starts — so the best
run ever is `MAX(best_streak)` over `play_runs`, and the best on a tune is the
same grouped by `chart_slug`. That deletes the reconciliation in `parseRecord`
that exists only because a stored `best` and an earned badge can disagree.

### Per-song badges

`StreakRecord.badges` changes key from `tier` to `(chart, tier)`. The shelf on
the play-along page shows **this tune's** six sockets; the profile shows what
has actually been won across all of them.

The migration out of localStorage is lossless, because `Badge.chart` has been
recorded since badges shipped: every stored badge already knows which tune won
it and moves to that tune's shelf with its date and colour intact. An entry with
no chart on it is dropped, which is the rule `parseRecord` already applies to
anything that does not parse.

Consequences worth stating, because they are the point rather than side effects:

- Six rungs per tune, and "fifty in a row" now means fifty in a row **on this
  tune** — a materially harder and more meaningful claim than the global one it
  replaces.
- A new tune starts with an empty shelf. Under the old rule, earning `nice` once
  meant never earning it again on anything.
- "All six on show, earned or not" still holds **on the tune**, where it is a
  ladder and the empty sockets are the point. It does not hold on the profile,
  where thirty tunes' worth of empty sockets would be a wall of things you have
  not done. There it shows what was won.

### Storage, offline, and sync

localStorage stays, as a write-through cache rather than as the record. The
schema's own conventions assume the practice session runs offline and flushes
later, and a run played on a train should not cost a badge.

- Run id is generated client-side, so the flush is idempotent on replay:
  `on conflict do nothing`.
- Written at the end of a run, not per chord. A `POST /api/runs` carrying the
  run, its attempts and any badges earned, in one transaction.
- Pending runs flush on next load. The cache key gains the user id when accounts
  land.

### Done when

- A run played, the browser closed, and the badge is still there on another
  machine.
- `MAX(best_streak)` and the badge shelf agree without any reconciliation code.
- Every new query filters on `currentUserId()`.
- `npm run verify` passes, and the existing localStorage record migrates with
  its dates intact.

---

## M10 — The profile

**One page that says what has actually happened.** Reads M9's tables; adds no
new capture of its own.

Route `/profile`. It goes in the settings menu at the top right, **not** in the
main nav — a fourth destination was already enough to make the header slide
sideways on a narrow screen, and that is recorded.

### What it shows

- **Headline.** Hours played, chords judged, tunes practised, badges earned,
  best streak ever and what won it.
- **Per tune.** Times played, last played, best streak, the badges won on it,
  and how the accuracy has moved. Sorted by time spent, because that is the
  honest answer to "what have I been practising".
- **Where the time went.** Hours by key and by chord quality, straight out of
  `chord_attempts`. This is the seed of the blind-spot report and costs one
  `GROUP BY`.
- **Recent runs.** The last twenty, each linking back to the tune.
- **Practice sessions.** Blocks completed and reviews graded, from the tables
  that already record them. The profile reads both halves of the app or it is
  not a profile.

### The clock

"Hours played" has to mean something defensible, or it is a vanity number:

- **Counted:** transport running and not paused, including the count-in, plus
  practice blocks that actually finished.
- **Not counted:** the page being open, the transport paused, a session
  abandoned mid-block, or time spent on Explore.

Two sources, one number, and the profile can show the split. The rule matches
the one the score already follows — silence is dropped, and "you have not played
yet" is not the same statement as "you scored zero".

"Tunes practised" counts a chart with at least one **voiced** chord, not a chart
opened.

### No daily streak

No calendar of dots, no days-in-a-row counter, nothing that turns a day off into
a loss. This was specified, and it also follows from what is already here: the
chord streak measures playing, a daily streak measures attendance, and this app
has never once told anyone off.

### Done when

Every number on the page can be traced to rows in `play_runs`, `chord_attempts`,
`badges`, `sessions` or `reviews`, and none of them is an estimate.

---

## What this changes about the parked milestones

### M6 — partly unparked

The reason recorded for parking M6 was that the vault and the blind-spot report
"could work sooner, but not without the capture habit that the transfer piece
was supposed to justify". That is now out of date. Play along judges every chord
occurrence against the sounding chord, and M9 writes those judgements down —
which is the capture habit, arriving from a different direction and without a
single recorded take.

So it splits:

- **The blind-spot report** is unblocked. It becomes a `GROUP BY` over
  `chord_attempts` and belongs after M10, whose "where the time went" panel is
  its first draft.
- **The vault** (record takes, browse, name, promote to repertoire) stays
  parked. Nothing above produces recorded MIDI, and `midi/smf.ts` still waits.
- **Transfer detection** stays parked, unchanged: its consumer, the mastery
  gate, is still deleted, so it would feed a report and nothing else.

### M8 — smaller than it was, and most of it now exists

Asked directly whether the chart editor was what songwriting mode was about: no.
M11 was for entering a chart that already exists on paper; M8 is for inventing
one that does not. They share a grid and nothing else, which is why M11 built
that grid as a component rather than a page.

That component — `ChartEditor.svelte` over `curriculum/editor.ts` — is now most
of M8. What is left is a blank one, a way to keep what you are writing without
naming it a tune yet, and export. And export gains a second meaning it did not
have: once M9 exists there is a record worth taking with you, not just charts.

---

## Order

**M9 → M10**, with M11 already done.

- M9 is the foundation; M10 cannot start without it.
- M10 goes last on purpose. A profile shipped the same week as the log that
  feeds it is an empty page with headings on it.
- M11 went first because it was independent of both and the only one of the
  three that fixed something which hurt every time a tune was typed in.

---

## Decisions still open

Flagged here rather than settled by whoever happens to be typing:

1. **`chordClusterWindowMs` and `midiLatencyOffsetMs`** — the instrument's, or
   the player's. (M9 records the question; only accounts force an answer.)
2. **Sharing when accounts land** — are charts you typed in visible to another
   player, and is the seeded skill graph shared or copied. (Deliberately not
   decided in M9.)
1. **Retention of `chord_attempts`** — the recommendation is to keep everything
   forever, at a few thousand rows an hour, because it cannot be reconstructed.

**Settled:** slash chords carry their bass note. Arabic after the slash is a
degree of the key, Roman stays an applied dominant, and the walking bass plays
what the chart names. Reasoning in `DECISIONS.md`.
