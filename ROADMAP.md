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

Five requirements, stated by the owner:

1. Aim for a multi-user setup — prepare for it now, build it later.
2. Chord badges become **per song**, so every tune keeps its own best streak.
3. Track everything, and put it on a profile: badges, tunes practised, hours
   played.
4. A real chord editor for adding tunes. The current one is a text box that
   wants pipe characters and tells you what was wrong only after you save.
5. Offer the hosted instance to other people, for a small monthly fee.

Everything below is derived from those five. Where a requirement forced a choice
that was not in it, the choice is argued in `DECISIONS.md` rather than smuggled
in here.

The fifth arrived after the other four and rewrites the first. "Prepare for it
now, build it later" was written when the second player was hypothetical and
unhurried; a paid hosted instance is that player arriving with a bank card, and
_later_ now has a date on it. M9 does not change — the seam is still the right
first move, and building it is still cheaper than not. What changes is that
three questions M9 deliberately left open are now answered by the requirement
rather than by whoever gets there first, and that two milestones exist after
M10 which did not exist before.

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

One correction to that, forced by M12 and cheap to make now rather than later:
**the column is nullable, and the seeded charts keep it null.** `db:seed` writes
the built-in forms, cycles and standards into this table from `charts.ts`, so a
`NOT NULL` backfill would hand the shared repertoire to whoever happened to be
the first row in `users`. Null means built-in and readable by everyone, a value
means yours; the list on the play-along page is the union of the two, which is
what it already shows. Every other new table in M9 and M12 stays `NOT NULL`,
because nothing else here has a shared copy.

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

## M12 — Accounts

**Real per-player credentials, and every owned row actually owned.** This is the
milestone `SECURITY.md` already says is mandatory: multi-user cannot ship on a
shared password.

### This, not billing, is the hosting problem

Two subscribers today would not be two users. They would be two people typing
the same `APP_PASSWORD`, reading the same ladder position, grading each other's
flashcards, and editing each other's twelve pitch colours through
`/api/settings` — which patches a singleton row. That is four data-isolation
bugs on the day the second person signs in, and no amount of billing code in
front of it changes what is behind it.

There is a fifth, quieter one. The play-along record still lives in
`localStorage`, so a paid account would today store nothing at all on the
server: sign in from the laptop and your badges are on the desktop. **That is
why M9 is a prerequisite for charging money and not merely a nice thing to have
first.** An account whose contents live in one browser is not an account.

M9 fixes none of the four on purpose, and is right not to. It builds the seam
and writes the play-along record through it; the tables the rest of the app
writes — `cards`, `srs_state`, `reviews`, `sessions`, `session_blocks` — were
deferred because each posed a question that could not be answered honestly
without a second player. There is now a second player, and the questions get
answered here.

### The tables that were waiting

| Table                                                      | Gets `user_id` | Why                                                             |
| ---------------------------------------------------------- | -------------- | --------------------------------------------------------------- |
| `cards`                                                    | yes, not null  | Generated as a ladder is climbed. Two players climb differently |
| `sessions`                                                 | yes, not null  | A practice session belongs to whoever sat down                  |
| `srs_state`                                                | no             | Its primary key _is_ `card_id`; the card already knows          |
| `reviews`, `session_blocks`                                | no             | Cannot exist without their parent, and the parent knows         |
| `skills`                                                   | no             | Seeded curriculum. A definition, not data                       |
| `charts`                                                   | nullable       | Null is built-in and shared; a value is yours                   |
| `takes`, `repertoire`, `analysis_facts`, `transfer_events` | no             | Still parked, still nothing writes to them                      |

The rule is M9's, applied further: a row that cannot exist without its parent
does not repeat the parent's owner, because the same fact stored twice can
disagree. The cost is a join on the profile queries, and it is worth it.

That settles the first half of open decision 2. **The skill graph is shared
because it is a definition; the cards generated from it are personal because
they are data.** One seeded copy of the curriculum, twelve cards per player per
rung, and re-seeding still matches on `code` without orphaning anybody's review
history.

The second half settles itself the moment strangers are involved: **charts you
typed in are private.** A hosted service where somebody else's tune appears in
your list is a bug, not a feature, and sharing is something nobody has asked
for.

### The room stops existing

This reverses M9, and the reversal is the interesting part. M9 argued that the
twelve colours and the wheel calibration are not preferences but _measurements
of the room_ — they match coloured stickers on real keys and a wheel somebody
built by hand, so two players at the same piano would want them identical.

Hosting removes the piano. A subscriber in another country shares no stickers,
no hand-built wheel, no MIDI cable and no laptop with anyone. **Every value in
the singleton is now the player's**, including both of the ones M9 flagged as
genuinely unresolved: latency belongs to a cable that belongs to exactly one
subscriber, and how wide a rolled chord may be belongs to one pair of hands.
Open decision 1 does not get decided so much as dissolved.

So `user_prefs` holds all of it — colour map, wheel config, MIDI device,
latency offset, cluster window, session length, reveal delay, ladder key and
rung — and the singleton is not deleted but re-employed: it becomes **the
defaults a new account is born with**. The check constraint pinning it to
`id = 1` still never has to be dropped, which was the cheapest possible outcome
and stays available for a reason nobody predicted.

`/api/settings` stops patching the singleton and starts patching the caller's
row. Nothing in the settings screens changes shape.

### Credentials

Email and a password, hashed with `scrypt` from `node:crypto` — memory-hard,
already in the platform, no native module to break a deploy. The parameters go
in a constant with a comment saying when they were last raised.

Magic links are the real alternative and would delete a subsystem: no hash, no
reset flow, no credential stuffing. They are listed under _Decisions still open_
rather than chosen here, because they make e-mail delivery the only way into an
app somebody has paid for, and a password degrades better on the morning the
mail provider is having a bad day. The recommendation is passwords; the point
worth knowing before deciding is that **e-mail becomes a hard dependency
either way**, since a paid account with no password reset is hostile.

Either way this is the first external service this project has ever needed.
That is a genuine loss of a property the README currently advertises, and it is
recorded rather than glossed.

### The cookie learns to be revoked

M9's payload is `userId.issuedAt.signature`. M12 puts an epoch in front of the
timestamp — an integer on `users`, bumped by "sign out everywhere" and by a
password change — so a ninety-day cookie stops being permanent.

Verification stops being self-sufficient: the epoch has to be read. That is one
user lookup per request, and it is the same lookup M13's entitlement check needs
anyway, so the cost is one query rather than two. `event.locals` ends up
carrying the user, not a boolean.

### The rest of what SECURITY.md says does not exist

- **Rate limiting** on sign-in and on reset requests. A small table, because
  serverless instances share no memory and Postgres is already there.
- **Password reset**: single-use token, short expiry, its own table.
- **Deleting an account has to actually work.** Every owned row cascades from
  `users`, designed in from the first migration rather than discovered later,
  and a test counts rows before and after. Exporting everything you own is the
  same requirement wearing a different hat, and the profile is where it goes.

### Done when

- Two accounts practise the same rung on the same evening and neither can see
  the other's cards, charts, runs, badges or colours.
- Signing out everywhere kills the cookie on the other machine.
- Deleting an account leaves no row behind, proven by a test.
- `npm run verify` passes.

---

## M13 — The subscription

**Money in, entitlement out.** One table, one accessor, and as little billing
code in this repo as can be managed.

### Revolut first, on a seam that does not care

The owner already has a Revolut **Business** account with merchant acquiring
enabled. That removes the only argument against it that was about effort rather
than capability, and what is left is closer than it looks from the outside.

Revolut has the two hosted pages this needs. A Hosted Payment Page takes the
first payment and saves the method; a customer portal lets a subscriber update
or remove their card and change or cancel the cycle, without a line of billing
UI in this repository. That was the strongest reason to prefer Stripe and it is
mostly spent.

It is also cheaper, and the gap is wider than the headline rates suggest because
**Stripe charges 0.7% extra on recurring volume and Revolut does not**. At a few
euros a month the difference is small in absolute terms and is not what decides
this, but it points the same way as everything else. Settlement lands next day in
the account the money is wanted in, with no second provider in the path.

The VAT argument for Stripe survives on paper and does not bite yet. Stripe Tax
computes the customer's country rate and files it; Revolut gives you a VAT field
on a plan. But **under €10,000 a year of cross-border EU sales the correct rate
is Belgian VAT on everything**, which is one number that never varies, and a
machine for computing one constant is not worth choosing a provider over. It
becomes real above the threshold, which at this price point is a subscriber count
nobody has yet — a good problem to have, and a migration to do then.

So: **Revolut, and build behind the seam.** `provider` is a column and
`entitled()` is one function, which is deliberate — this is a reversible bet, and
the two things that would reverse it are named under _Decisions still open_.

What Stripe still has, honestly, is the better workshop: an official Node SDK, a
CLI that forwards webhooks to `localhost`, and test clocks that fast-forward a
subscription a year to prove the renewal and the dunning work. Revolut has a
sandbox and webhooks and no equivalent of that last one, so **renewal behaviour
has to be verified against the sandbox on real elapsed time or not at all.**
Budget for that being tedious.

### Schema

```
subscriptions
  id                    uuid pk
  user_id               uuid not null -> users on delete cascade
  provider              text not null      -- 'revolut'
  customer_ref          text not null      -- their customer id
  subscription_ref      text not null unique
  status                text not null      -- their vocabulary, untranslated
  current_period_end    timestamptz not null
  cancel_at_period_end  boolean not null default false
  checked_at            timestamptz not null  -- when this last agreed with them
  created_at            timestamptz not null
  updated_at            timestamptz not null
```

`status` keeps the provider's own word rather than a local enum. Translating
somebody else's state machine into your own means owning the translation forever
and being wrong about it during exactly the hours when the two disagree. It is
also what makes `provider` more than decoration: a second vocabulary can arrive
without the first one being rewritten.

```
billing_events
  id           text pk           -- their event id: the idempotency key
  type         text not null
  received_at  timestamptz not null
  payload      jsonb not null
```

Webhooks arrive more than once by design. Making their event id the primary key
turns a replay into `on conflict do nothing`, which is the same trick the run
flush already uses for the same reason.

### Webhooks are not allowed to be the only source of truth

This is the one place the provider choice reaches into the design. Revolut
retries a failed webhook three times at ten-minute intervals and then stops —
about half an hour of tolerance for the endpoint being down. Stripe retries for
days. Half an hour is less than one bad deploy.

So `checked_at` exists and the rule is: **a subscription row older than a day is
not trusted, it is re-read from the provider.** Webhooks become an optimisation
that keeps the row fresh, rather than the only mechanism that can ever make it
true, and a missed event costs a lazy re-read instead of a subscriber silently
losing access. This would be worth doing on any provider. On this one it is not
optional.

### The entitlement

One function — `entitled(userId)` — read once in `hooks.server.ts`, beside the
user lookup the cookie already needs. Everything else asks it and nothing else
computes it. That is `currentUserId()`'s discipline applied to the second thing
worth having exactly one answer to, and it is where the staleness check above
lives, so nothing else has to remember it.

Active, trialing and past-due all pass. Past-due passes deliberately: a card
that expired on renewal day should not lock somebody out of their own practice
history while the provider retries it.

### What lapsing does, and does not do

**Read-only. Never locked out, never deleted.** Signing in keeps working. The
profile, the record, and every chart you typed in stay readable and
exportable. Starting a session and saving a run stop.

An app that has never once told anyone off does not open its commercial career
by holding a year of practice history hostage over a failed card.

### The free tier is the source code

It is AGPL, self-hostable and documented, so the hosted instance can be paid-only
without taking anything from anyone: the free version is the one you run
yourself, and the fee buys somebody else running it. That is an honest offer and
it is the only one that does not require inventing a crippled tier.

A trial exists so the inside can be seen before paying. Fourteen days, card
required — a card-less trial needs an abuse story, and nobody wants to write one
for a product priced this low.

### The licence asks for one link

Section 13 of the AGPL is the reason the licence was changed and it points both
ways: a hosted service running a **modified** version must prominently offer its
users that version's source. The hosted instance intends to run the same code as
the repository, which satisfies it — but "intends to" is not a mechanism, and
the obligation is on whoever is running it on the day.

So the app shell gains a source link, in the settings menu beside the profile.
One anchor, permanently correct, and the thing that keeps the promise honest if
a hotfix ever ships from a branch. It does not exist today because there is no
hosted service and no second user; it ships with this milestone.

### Two plans, and the prices are not in this file

There is a monthly plan and a yearly one. The yearly is the one to default to,
and the reason is structural rather than promotional: acquiring charges a flat
fee per transaction as well as a percentage, and at a few euros a month that
flat fee is a large share of the take. Billing once a year pays it once instead
of twelve times, needs no dunning, and cannot churn mid-year.

That is everything the code needs to know. **The actual figures, the market they
were chosen against and the arithmetic behind them are commercial and live
outside this repository**, because a public roadmap is a strange place to
negotiate with yourself about what to charge. What belongs here is that there
are exactly two plans, that they differ only in billing period, and that neither
unlocks a feature the other does not.

### The part that is not code, and blocks launch anyway

None of this is a milestone, all of it is required, and it is written down here
because it is the half most likely to be discovered late:

- **A registered business.** Already true — the merchant account exists, which
  means the entity behind it does, and this line is here so the next reader does
  not assume otherwise.
- **VAT.** Cross-border B2C digital services are taxed where the customer is.
  Under €10,000 a year of them across the EU you may charge Belgian VAT on
  everything; above it, register for OSS and file quarterly. Confirm the shape
  of this with an accountant — it is stated here to size the job, not to be
  relied on. Below the threshold this is a constant in a config file. The date
  it stops being one is the date it becomes work.
- **Or hand the whole tax question to a merchant of record.** Paddle, Polar and
  friends become the seller of record and charge roughly 4–6% against acquiring's
  ~1.3%, and in exchange no VAT registration, no returns and no filings exist for
  you at all. Note what that costs here specifically: the merchant account is
  already open and the money already lands in the right place, so a merchant of
  record means giving up the cheapest and most direct route in exchange for
  never thinking about a threshold. Worth revisiting at the threshold, hard to
  justify below it.
- **Terms and a privacy policy**, because you become the controller of other
  people's data the moment the second account exists. Export and deletion are
  built in M12 precisely so this is a page of text rather than a panic.
- **Backups with a restore that has actually been run once.** Somebody else's
  practice history is now in there.

### Done when

- A subscriber signs up, pays, practises, changes card, cancels and comes back,
  with no billing interface in this repository.
- A webhook replayed by hand changes nothing the second time.
- A lapsed account can still read and export everything it ever recorded.

---

## M14 — The way in

**A public demo that needs no account, no password and no database.** The
cheapest milestone here and the only one that produces evidence rather than
capability.

### The problem it fixes

The landing page is public, detailed and good. It describes a rhythm section
that listens to you, shows a chart following the music, and then offers a
password box. **The only way to actually see the product is to install
Postgres.** Everything else on this list is an argument about how to charge for
something nobody has been able to try.

### What it is

Route `/demo`, public in `isPublicRequest()` the way `/` already is. It runs the
real play-along page — not a mock-up, not a video — over the built-in charts,
and writes nothing anywhere.

- **Charts come from code.** `charts.ts` already holds the forms, cycles and
  standards, and `curriculum/editor.ts` already resolves them. The demo reads
  them directly rather than through the database, so it works on an instance
  with no Postgres at all and cannot be broken by a migration.
- **Colours come from `DEFAULT_COLOR_MAP`.** The palette is normally injected
  from `settings` during SSR; the demo uses the defaults in `$lib/settings` and
  skips the read.
- **Nothing persists.** No runs, no badges, no streak record, no localStorage
  worth migrating later. A visitor who closes the tab has left no trace, which
  is also the honest version of the privacy claim on the page they arrived from.
- **MIDI works if they have it**, over HTTPS, exactly as it does signed in. The
  on-screen keyboard is the fallback and feeds the same pipeline, so a visitor
  with no hardware still sees chords judged.

### What it must show, and what it must not

It must show the **scoring**, because that is the entire differentiator. A demo
of the transport and the chart without the judging is a worse iReal Pro, and
anybody who knows the category will read it that way in four seconds.

It must not offer to save anything, must not show an empty profile, and must not
put a sign-up call anywhere until M13 exists to receive one. Until then the only
honest exit is the source and "run it yourself" — which is a real offer, and the
one this project has always made.

One chart is enough, and it should be playing-ready on arrival: a blues in C,
transport armed, the first bar already taken apart underneath. The visitor's
first action should be pressing play, not choosing.

### Done when

Somebody with no account, no database and no MIDI keyboard can hear a blues, tap
a bar to loop it, change the key, and see what the chord is doing — within ten
seconds of clicking one link on the landing page.

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

**M14 → M9 → M10 → M12 → M13**, with M11 already done.

- M14 goes first, which is a change. It depends on nothing — no persistence, no
  account, no database — so it is not waiting for M9, and it is the only item
  here that answers a question rather than adding a capability. Everything after
  it is built better if somebody has used the thing first, and the order that
  puts a payment page in front of software nobody has been able to try is the
  order that spends three months learning nothing.
- M9 is the foundation and nothing else here starts without it. It is also, and
  this was not its original justification, the thing that makes a paid account
  hold anything: without it the record lives in one browser.
- M10 stays where it is. A profile shipped the same week as the log that feeds
  it is an empty page with headings on it — and if the point is to persuade
  somebody the account is worth five euros, the page that says what they have
  actually done is a large part of the argument. It is nonetheless the one thing
  in this list that could move later if the fee is in a hurry, because written
  to M9's rule it needs no rewriting when M12 lands.
- M12 before M13, and not negotiably. Billing in front of a shared password sells
  access to a room everybody is already standing in.
- M11 went first because it was independent of everything and fixed something
  that hurt every time a tune was typed in.

The non-code work in M13 — a registered business, VAT, terms, backups — runs
alongside from the start of M12, because it is the half with other people's
timelines in it.

### The release where the app stops being what it says it is

M9 already lists the four places that will stop being true and must change in
the same release as accounts: `SECURITY.md`'s threat model and its
"no multi-tenancy", `.env.example`, the README's opening claim, and the landing
copy in `LandingPage.svelte`. All four still stand, and the fifth requirement
sharpens what they have to become, since the landing page currently sells the
opposite of a hosted account — _one musician per instance_, _no user accounts_,
_your practice data belongs on your machine_.

The honest replacement keeps both halves true and does not apologise for either:
**run it yourself, or let somebody else run it for you.** The software stays free
and self-hostable; the fee buys hosting, backups and not having to keep a
Postgres alive. `APP_PASSWORD` remains exactly what it is — the right answer for
a personal instance — and stops being the only answer.

Not one word of it is edited before M12 ships, per the rule at the top of this
file.

---

## Decisions still open

Three, all flagged where they arise, none of which should be settled by whoever
happens to be typing:

1. **How people sign in** — password with a reset flow, or a magic link with no
   password at all. M12 recommends passwords and explains why; the deciding
   consideration is that e-mail becomes load-bearing either way.
2. **What would move this off Revolut.** The choice is made and it is reversible
   on purpose, so the two triggers are written down rather than left to be felt:
   crossing €10,000 of cross-border EU sales, which turns VAT from a constant
   into machinery worth buying; and finding that renewals cannot be tested
   without a test clock, which is a developer-experience problem that only shows
   up once the integration is real. Either one is a reason to re-read this
   section, not to rewrite the app. See M13.
3. **Retention of `chord_attempts`** — the recommendation is to keep everything
   forever, at a few thousand rows an hour, because it cannot be reconstructed.

**Settled since the last revision, by the hosting requirement rather than by
argument:**

- `chordClusterWindowMs` and `midiLatencyOffsetMs` are the player's. So is
  everything else in the singleton, because hosting deletes the shared room.
- The seeded skill graph is shared, being a definition; the cards generated from
  it are per-player, being data.
- Charts you typed in are private to you.

**Settled earlier:** slash chords carry their bass note. Arabic after the slash
is a degree of the key, Roman stays an applied dominant, and the walking bass
plays what the chart names. Reasoning in `DECISIONS.md`.
