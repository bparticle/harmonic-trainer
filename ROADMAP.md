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

Four of the five have been built: the editor as M11, the record and the seam as
M9, the profile as M10, and the demo as M14. Their reasoning is in
`DECISIONS.md` and their status is in the README, per the rules at the top of
this file. What is left here is the fifth requirement and what it costs.

That fifth one arrived after the others and rewrote the first. "Prepare for it
now, build it later" was written when the second player was hypothetical and
unhurried; a paid hosted instance is that player arriving ready to pay, and
_later_ now has a date on it. The seam M9 built does not change — it was the
right first move either way — but three questions it deliberately left open are
now answered by the requirement rather than by whoever gets there first, and two
milestones exist which did not exist before.

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

There was a fifth, quieter one, and M9 has since fixed it: the play-along record
lived in `localStorage`, so a paid account would have stored nothing at all on
the server — sign in from the laptop and your badges were on the desktop. An
account whose contents live in one browser is not an account, which is why the
record had to come first and did.

M9 fixed none of the other four on purpose, and was right not to. It built the
seam and writes the play-along record through it; the tables the rest of the app
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
| `charts`                                                   | done in M9     | Null is built-in and shared; a value is yours                   |
| `takes`, `repertoire`, `analysis_facts`, `transfer_events` | no             | Still parked, still nothing writes to them                      |

The rule is the one M9 set, applied further: a row that cannot exist without its
parent does not repeat the parent's owner, because the same fact stored twice
can disagree. The cost is a join on the profile queries, and it is worth it.

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
built by hand, so two players at the same piano would want them identical. That
is why it left the singleton alone, and the argument was right for the room it
was made in.

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

The payload M9 built is `userId.issuedAt.signature`. M12 puts an epoch in front
of the timestamp — an integer on `users`, bumped by "sign out everywhere" and by
a password change — so a ninety-day cookie stops being permanent.

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

### A seam that does not care which provider sits behind it

`provider` is a column and `entitled(userId)` is a single function. That is
deliberate: which company processes payment is a commercial decision, not an
architectural one, and the two should not have to move together. The
reasoning behind whichever provider is chosen — cost, settlement, the tax
mechanics of selling across borders — is tracked outside this repository,
because it changes on a timeline this file should not.

What the seam actually has to satisfy is narrower than "pick the cheapest
option": the provider needs to host its own subscribe, change and cancel
pages, so none of that UI has to be built and maintained here, and it needs
webhook retry behaviour this design does not quietly depend on being
generous — see _Webhooks are not allowed to be the only source of truth_,
below.

### Schema

```
subscriptions
  id                    uuid pk
  user_id               uuid not null -> users on delete cascade
  provider              text not null      -- e.g. a provider's identifier
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

This is the one place the provider choice reaches into the design, and it is
why the seam above cannot be indifferent to every property of a provider:
retry windows on a failed webhook vary a great deal, and some allow as little
as half an hour of tolerance for the endpoint being unreachable — less than
one bad deploy.

So `checked_at` exists and the rule is: **a subscription row older than a day
is not trusted, it is re-read from the provider.** Webhooks become an
optimisation that keeps the row fresh, rather than the only mechanism that
can ever make it true, and a missed event costs a lazy re-read instead of a
subscriber silently losing access. This would be worth doing on any provider.
On one with a narrow retry window it is not optional.

### The entitlement

One function — `entitled(userId)` — read once in `hooks.server.ts`, beside the
user lookup the cookie already needs. Everything else asks it and nothing else
computes it. That is `currentUserId()`'s discipline applied to the second thing
worth having exactly one answer to, and it is where the staleness check above
lives, so nothing else has to remember it.

Active, trialing and past-due all pass. Past-due passes deliberately: a
failed renewal should not lock somebody out of their own practice history
while it gets sorted out.

### What lapsing does, and does not do

**Read-only. Never locked out, never deleted.** Signing in keeps working. The
profile, the record, and every chart you typed in stay readable and
exportable. Starting a session and saving a run stop.

An app that has never once told anyone off does not open its commercial career
by holding a year of practice history hostage over a single missed renewal.

### The free tier is the source code

It is AGPL, self-hostable and documented, so the hosted instance can be paid-only
without taking anything from anyone: the free version is the one you run
yourself, and the fee buys somebody else running it. That is an honest offer and
it is the only one that does not require inventing a crippled tier.

A trial exists so the inside can be seen before paying. Fourteen days, no
free-of-commitment option — a trial with no commitment needs an abuse story,
and nobody wants to write one for a product priced this low.

### The licence asks for one link

Section 13 of the AGPL points both
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
and the reason is structural rather than promotional: a fixed cost applies
per billing cycle regardless of amount, and at a few euros a month that fixed
cost is a large share of the take. Billing once a year pays it once instead
of twelve times and cannot churn mid-year.

That is everything the code needs to know. **The actual figures, the market they
were chosen against and the arithmetic behind them are commercial and live
outside this repository**, because a public roadmap is a strange place to
negotiate with yourself about what to charge. What belongs here is that there
are exactly two plans, that they differ only in billing period, and that neither
unlocks a feature the other does not.

### The part that is not code, and blocks launch anyway

None of this is a milestone, all of it is required, and it is written down here
because it is the half most likely to be discovered late:

- **The non-code prerequisites of accepting payment at all** — the kind of
  entity that can do it, and what tax follows from doing it across borders.
  Commercial and legal detail, tracked outside this repository the same way
  the pricing figures are; this line exists so the next reader knows it was
  considered rather than missed.
- **Terms and a privacy policy**, because you become the controller of other
  people's data the moment the second account exists. Export and deletion are
  built in M12 precisely so this is a page of text rather than a panic.
- **Backups with a restore that has actually been run once.** Somebody else's
  practice history is now in there.

### Done when

- A subscriber signs up, pays, practises, changes plan, cancels and comes back,
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

## M15 — The practice room, rebuilt

**The exercise section, rethought from the ground up around the page that
actually gets used.** Reported after real use, like the progression rebuild
before it, and recorded with the same honesty: the daily session orbits one
subject, it ends too easily, tomorrow looks like today, and half its blocks are
worse versions of pages that already exist — so the player uses the play-along
page all the time and ignores the exercise section altogether. All four
complaints are true, and every one of them traces to a cause in the code.

### Where each complaint comes from

**One subject.** `startOrResume` narrows every drill to a single skill code on
every path, including the default — `focusSkills` is always exactly one entry
(`session-store.ts:255,263,268`). A rung holds between one and seven items, so
twenty minutes orbit a handful of facts asked four ways. The narrowing was
built as a courtesy ("a chosen focus narrows the drills") and became a cage
when it also applied to the day nobody chose anything.

**Ends too easily.** Blocks are sized by a timer but filled from the FSRS due
pile (`plan.ts`, `SECONDS_PER_CARD`), and FSRS exists to make that pile small.
A well-run deck has almost nothing due, so "Nothing due for this block today"
is a normal sight and a session can be clicked through in three minutes. The
timer measures nothing — no block ends because of it — and completion is not
measured at all. The scheduler is doing its job; the session was built as if
the scheduler's leftovers were a syllabus.

**The same thing the next day.** Composition is static: the same six blocks in
the same order with the same copy, every day, forever. The only input that
varies is the due pile, and FSRS varies it towards _less_. The "one new thing"
block shows the same rung text every day until the ladder is advanced by hand
on the home page, so the one block named for novelty is the most repetitive
thing in the app.

**Already practised elsewhere.** The warm-up asks `see_play` — and a chart on
the play-along page _is_ `see_play`, with a rhythm section behind it and
chord-by-chord judging in front. "Name what you play" is `/play` with a timer
on it. "Apply it" embeds `BackingControls` — `/backing` with fewer knobs, no
scoring, no streaks, no badges and no record. A player who drifts to the
better page and skips the section is not lazy; they are correct, and a
practice feature that is rational to skip is a bug in the feature.

The root mistake is historical. The session engine was designed at M5 as the
centre of the app, before the rhythm section existed. M7 and everything after
it — scoring, streaks, badges, the record, grooves — made the play-along page
the centre, and the session was never re-founded on it. This milestone
re-founds it.

### The principle

**If the band can ask it, the band asks it. The drill room keeps only the
questions the band cannot pose.** Those are:

- **The ear** — `hear_play`, `hear_name`. The transport never plays you a
  chord and waits.
- **The name** — `play_name`. The chart names everything for you; it never
  asks you to.
- **The function** — "play the IV chord of E♭." The chart shows symbols, not
  degrees-as-questions, and connecting symbol to function is the app's stated
  reason to exist.
- **Coverage** — the keys, tempos and tunes the record shows you avoiding.
  The play-along page grants total freedom, and total freedom is how twelve
  keys become four.

Everything else stops being a block beside the band and becomes a **mission on
the transport**: the real play-along page, under a constraint, with a
measurable goal. This also ends the two-currency problem — practice finally
deposits into the same record, streaks and badges the player already cares
about, instead of minting review rows nothing celebrates.

### The workout

A session becomes a **workout**: three to five tasks, each with a goal that
can be met rather than a clock that runs out. Composed fresh each day from
four inputs — the due pile, the neighbourhood of the current ladder position,
the record's cold spots (a `GROUP BY` over `chord_attempts` by key and
quality: the blind-spot report from M6, finally built, arriving as an _input_
rather than a finding), and one novelty slot. Composition is deterministic per
date, seeded the way `chooseKey` already seeds its rotation, so a reload
resumes the same workout and tomorrow's genuinely differs.

Four task kinds:

1. **Ear** — a fixed count of questions (ten), drawn `hear_play` and
   `hear_name`. The queue never runs dry: due cards first, near-due next,
   fresh material from anything already reached last. The task ends at the
   count, never at pile-empty. Reviews are still recorded and FSRS still
   schedules; it just stops being the only source of questions.
2. **Function** — degree prompts: "the IV chord — E♭" → play it, then name
   it. A new card direction `degree_play`, because seeing "A♭" and producing
   A♭ is spelling, while seeing "IV of E♭" and producing A♭ is harmony. The
   ladder already stores each item's degree, so the material exists; only the
   question is new.
3. **Mission** — the real `/backing` page opened under a constraint with a
   goal judged by the machinery that already judges everything there:
   _Blues in D♭ at 100, land 70% of guide tones over two choruses_ · _the
   ii–V–I cycle chart, all the way round_ · _a tune from your list in a key
   you have never played it in_ · _hands off the roots: chord tones only,
   thirds and sevenths doing the work_. Cold keys and cold qualities from the
   record steer which mission is offered. Streaks, badges and the fun switch
   all apply, because it is not a copy of the page — it is the page.
4. **One new thing** — a single unseen item: the next rung, the next
   progression, or a groove never yet played over. Shown once, tried once,
   and if it was yesterday's it is not today's. When the current rung looks
   solid, this slot is where "ready to move on" gets said out loud, instead
   of being a small button at the bottom of the home page.

The home picker survives untouched in spirit: choosing a rung or a progression
pins the workout's material, and composition still varies around the choice.
Agency stays; the scheduler still never ambushes.

### What gets deleted

- **Block types `wheel_warmup`, `name_what_you_play`, `apply` and `log`**, and
  the proportional `SHAPE` timer model with them. `block_type` is text
  narrowed by a union, so historical rows keep their names and the profile
  keeps counting the hours they hold. The log block's self-rating was written
  and never read; the grade already comes from performance.
- **`see_play` retires from review.** It remains the introduction — a card in
  `new` or `learning` state may still be shown its symbol — and stops being
  re-asked once the card graduates, because from then on the chart asks that
  question with a band behind it. A selection filter, not a schema change.
- **The 10/20/35 length picker** becomes workout sizes — short, standard,
  long: three, four, five tasks — and the block preview on the home page
  becomes a task preview. Minutes were always an estimate; tasks are countable.

### Schema

Two additive migrations, nothing destructive:

```
play_runs
  session_block_id  uuid null -> session_blocks on delete set null
```

so a mission's result traces to the run and the chord attempts that earned it
— the house rule that every number traces to a row, applied to goals. Null
stays the common case: a free run on `/backing` belongs to no session, exactly
as now. The FK follows M9's ownership rule (the child does not repeat what the
parent knows), and M12 stamps `sessions` with its owner later without this
table changing again.

And `ALTER TYPE card_direction ADD VALUE 'degree_play'`, plus its entry in
`DIRECTION_WEIGHT` (suggest 1.3 — function knowledge is the problem statement,
just behind `play_name`).

`plan_json` gains a `version: 2` workout shape. An unfinished v1 session found
on upgrade is left where it lies — `endedAt` null, never resumed, its finished
blocks still counted — and the home page simply offers a fresh workout. Honest
and cheap.

### Order of work

Five phases; each lands with `npm run verify` green and each is independently
shippable.

**Phase 1 — the composer, pure.** `src/lib/session/workout.ts`: `Task`,
`Goal`, `Workout` types and `composeWorkout(input)` — same discipline as
`planSession`, testable without a database, a clock or a keyboard. Inputs: due
cards, reached positions, cold spots from the record, yesterday's novelty,
the picker's choice, the date. Tests assert: consecutive days differ for
identical state; the ear queue is never empty even with nothing due; a picker
choice is honoured; the novelty slot never repeats yesterday. `plan.ts` stays
alive until Phase 4 flips the page, then dies.

**Phase 2 — the queue and the function cards.** The never-dry queue builder
(due → near-due → fresh, one pool per workout so nothing is asked twice); the
`degree_play` enum migration; degree items posed in `drill.ts` (`pose` gains
one case; `markPlayed` and `markNamed` already know how to mark both halves);
`see_play`'s graduation filter in selection.

**Phase 3 — missions.** `src/lib/practice/goal.ts`: a pure evaluator from a
run's attempts to a goal verdict — given the rows, was 70% of guide tones over
two choruses met? `/backing` learns mission parameters in the URL beside the
`?chart=` it already reads (key, bpm floor, groove, choruses, goal), shows the
goal while the transport runs, evaluates when it stops, and posts the block
result with the run id. `/api/runs` accepts `session_block_id`. A mission
played with the network away follows the run outbox's fate: the run arrives on
the next load, the block simply is not finished yet, and nothing is lost.

**Phase 4 — the pages.** `/session` rebuilt around the task list: tasks in
order, goal progress visible, done when done. The end screen reports what
actually changed — accuracy against last time, a cold key touched, a badge
earned — from rows, never estimates. The home page previews today's actual
tasks instead of six block durations. Finishing a workout offers another one:
`todaysSession` becomes latest-unfinished, because "you have practised enough
today" is a sentence this app has no business saying.

**Phase 5 — the deletion and the record.** Dead block code removed, README's
practice sections rewritten to describe what exists, and the DECISIONS.md
entry written in prose — the change is not done until it is recorded.

### Done when

- Composing workouts for the same state on two consecutive days yields
  visibly different task lists, proven by a test.
- No task can render "nothing due": an empty pile still yields a full ear
  task from fresh material, proven by a test.
- Every remaining drill question is one the play-along page cannot ask; every
  overlap either died or became a mission constraint.
- A mission's verdict traces to a run and its chord attempts through
  `session_block_id`.
- A brand-new account's first workout is playable start to finish with C
  major material only.
- `npm run verify` passes.

### Decided here, so execution does not reopen them

- **Completion replaces the clock.** Timers may remain as an upper bound on a
  task; nothing ends because of one.
- **Still no daily streak.** A workout skipped is a workout skipped; the app
  has never told anyone off and does not start now.
- **Missions do not require MIDI.** The on-screen keyboard feeds the same
  pipeline on `/backing` already.
- **The fun layer stays on its switch** and missions inherit it for free,
  because they run the real page.

### Open within this milestone

- ~~Whether the ear task should ever play sequences (scales) or only chords.~~
  **Settled in Phase 2, against the recommendation.** Chords only would leave
  a brand-new account — one rung, the C major scale — with no ear material at
  all, and "a first workout playable with C major material only" is the
  stronger constraint. Scales stay in. `directionsForRung` already refuses to
  ask a scale to be _named_, so only "listen, play it back" can be posed.

### What the record already says about the thresholds

The plan said to tune the goals against the record once missions produce
rows. It turns out the record could answer sooner: 813 chord attempts across
19 runs were already there, and they say the first guess was wrong.

**92% of all attempts landed every guide tone.** Across the seven runs long
enough to mean anything (twelve attempts or more) the median run landed 93%,
the lower quartile 81%, and only one run in the whole record fell below 70%.
A 70% bar is therefore not a goal — it is a thing that happens anyway, and a
goal that cannot be missed teaches nothing and celebrates nothing.

Two cautions before simply raising the number, both visible in the same rows:

- **Those rates are from two keys.** C holds 588 attempts and A holds 225.
  The other ten have _none at all_. The high percentages are what a
  well-known tune in a comfortable key sounds like, and a mission's whole
  premise is that it is neither. Expect the rate to fall in a cold key, and
  do not read 93% as a baseline that will survive being moved.
- **Tempo and tune move it more than key does so far.** The blues at 140
  lands 69–81% while rhythm changes at 100 lands 92–94%, in the same key. So
  a single global percentage is the wrong shape for this goal whatever
  number is chosen.

The recommendation, to be argued with rather than obeyed: **85% as the
starting bar in a key the record has nothing on**, which is meaningfully
above the lower quartile and well below what a comfortable run produces, and
a goal that carries its context — key, tune, tempo — so that a later pass can
calibrate per-context instead of moving one constant for everybody. The
constant lives in one place either way, and the first month of mission rows
is what settles it.

That the record could answer this at all is worth noticing on its own: it is
the blind-spot report doing its job a phase before it was scheduled to exist.
And the coverage figure is the milestone's own premise, quantified — two keys
out of twelve, 19 runs against 8 reviews. The exercises are not being
skipped because practice is unwelcome. They are being skipped because the
band is better company.

---

## M16 — Tempo is the other axis

**A badge earned at half speed is not the badge earned at tempo, and the app
cannot currently tell them apart.** Asked for directly, after noticing that
fifty in a row at 60 says something quite different from fifty in a row at 140. It is right, and it is larger than badges: the app has twelve keys of
breadth and no depth at all. Tempo is the depth.

### What is wrong today

`badges` stores one row per tier per tune, `play_runs` stores a `bpm`, and the
two never meet. The shelf under a chart says you once landed fifty in a row on
it; it does not say whether that was a crawl or a burn, and there is no way to
ask. So the top of the ladder is reachable by slowing down until it is easy,
which is the one thing a practice tool must not reward.

It is invisible in the other direction too. Somebody grinding a tune up from
80 to 130 over a fortnight has done the most valuable work the app can
witness, and the shelf shows six badges that stopped changing on day one.

### Bands are a share of the tune's own tempo, not an absolute

The obvious design — slow, medium and fast as fixed BPM bands — is musically
wrong, and the record already shows why. Three Little Birds is logged at 99
and rhythm changes at 100, and those two numbers mean opposite things: one is
the tempo the song goes at, the other is a bebop vehicle taken at walking pace
to get it clean. A ballad at 60 is a ballad. A bebop head at 60 is homework.

Every chart already carries `default_bpm` — the tempo it is meant to go at —
so a band is a **share of the tune's own target**, and the same five words
stay honest on a ballad and a burner:

| Band       | Share of the tune's tempo |
| ---------- | ------------------------- |
| `learning` | under 60%                 |
| `working`  | 60–79%                    |
| `nearly`   | 80–99%                    |
| `attempo`  | 100–119%                  |
| `past`     | 120% and over             |

`past` exists because taking a tune faster than it goes is a real practice
device, and the scale should not stop at "correct".

### The grade is derived, never stored

The temptation is a `best_bpm` column on `badges`. That is the mistake M9 made
once and undid: the stored best was deleted because it could drift from the
runs that justified it, and _one place the answer comes from, and nothing to
reconcile_ is the rule that replaced it. A stored tempo grade is the same bug
wearing a new name.

It does not need one. `play_runs` already holds `best_streak`, `bpm` and
`chart_slug`, so the fastest band a tier has ever been reached at is a query:

```
max(bpm) over play_runs where chart_slug = ? and best_streak >= tier.from
```

The badge keeps meaning what it means today — _when did you first get there_ —
and the grade beside it answers _how fast have you held it_. Two questions,
one row each, neither able to contradict the other. The shelf stays six
sockets and no existing badge changes.

### Tried against the record before being proposed

The nineteen runs already logged were graded by that rule, and it separates
three tunes the current shelf cannot tell apart:

| Tune               | Target | Played at | Share | Band      | Tiers earned            |
| ------------------ | ------ | --------- | ----- | --------- | ----------------------- |
| rhythm changes     | 160    | 100       | 63%   | `working` | five, up to untouchable |
| jazz blues         | 140    | 140       | 100%  | `attempo` | three, up to on fire    |
| three little birds | 76     | 99        | 130%  | `past`    | all six, best run 146   |

As the shelf shows them today those three are nearly identical: rows of
badges, no context. Graded, they are three different pieces of news. Rhythm
changes has thirty-two in a row at 63% of the tempo the tune goes at — real
work, obviously unfinished, with the next band sitting at 128bpm. The blues is
the opposite shape: dead on tempo, streaks stopping at twelve. Three Little
Birds is finished and then some.

The middle two are the case for this milestone. One is fast and fragile, the
other slow and solid, and today they wear the same badges.

**A wrinkle the query alone does not solve:** the target tempo lives in
`charts.default_bpm` for a tune you typed in and in `charts.ts` for a built-in
one, so two of the tunes above have no row to read it from. The grade must
resolve a chart the way the rest of the app already does — code first, then
the database — rather than assuming a row exists.

### The one thing that cannot wait, and has not

Tempo moves under a running transport by design, but `play_runs.bpm` is a
single integer. A run started at 140 and slowed to 60 records one of those,
and if the streak was clinched after the slowdown the grade flatters in
exactly the direction this milestone exists to correct.

The fix is `play_runs.best_streak_bpm`, nullable: the tempo at the moment the
best streak was clinched. A fact about the run rather than a copy of an
aggregate, so it does not reopen the stored-best argument. **It cannot be
backfilled** — the runs already logged do not know, and inventing a number for
them would be the first estimate in a record that has never held one. Every
day it does not exist is a day of history that can never be graded honestly,
which is why it is pulled out of this milestone and captured during M15
rather than waiting for the rest of this to be built.

### Advancing is a ladder, and it suggests

"Start slow, stay consistent, move up" is the key ladder's shape applied to
the other axis, and it behaves identically: **it suggests, it never gates.**
Any tempo stays playable at any time; what the ladder does is notice you have
held a band cleanly and say so.

Per tune, because tempo does not transfer the way a numeral does — holding
rhythm changes at 100 says nothing about a bossa. The threshold reuses M15's
mission goal rather than inventing a second standard, since both are asking
_did you hold it_, and one definition of that is enough.

### Where it shows

- **The shelf.** Each of the six sockets gains its band. Re-earning a tier
  faster upgrades the band without touching the date it was first won.
- **The profile.** The keys already appear as twelve swatches filling with
  what has been played in them; tempo is the second dimension of the same
  picture. It would be the first figure in the app that measures
  _improvement_ rather than volume.
- **M15's missions.** Where the two milestones meet, and why this one follows
  rather than precedes: a mission already carries key, tune and tempo, so
  "hold the bar at the next band up on this tune" is something the composer
  can already express. The key ladder gives the workout breadth; this gives
  it depth.

### The global concept, and its limit

Asked whether this generalises beyond play-along: mostly yes, with one place
it must not. Missions, badges, the shelf and the profile are all tempo-graded
by the above. The **cards are not** — a flashcard has no tempo, only a
latency, and `gradeFromPerformance` already grades on that. Stretching a band
scale over the drills would be an analogy rather than a measurement, and this
app does not ship numbers it cannot trace to a row.

Tempo grades what is played _in time_; latency grades what is asked _as a
question_; the two are not made to look like each other.

### Done when

- The shelf shows the band each badge has been held at, derived from runs,
  with no stored best anywhere.
- Re-earning a tier faster changes the band and not the date.
- A run whose tempo moved is graded on where the streak was clinched.
- The profile answers "is my tempo moving" from rows.
- A tune's ladder suggests the next band and gates nothing.
- `npm run verify` passes.

### Open

- Whether `past` should award anything beyond being shown. It is showing off,
  and showing off is allowed, but a badge for it invites gaming the tempo
  slider rather than playing.
- Whether crossing a band deserves the fun layer's noise. Consistent with the
  existing switch: available, and off by default.

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

- **The blind-spot report** is unblocked, and the rows it needs are being
  written. It is a `GROUP BY` over `chord_attempts`, and the profile's "where
  the time went" panel is its first draft: same two groupings, reported as
  counts and accuracy rather than as a finding. What is left is the part that
  says something — noticing that a quality is landing well everywhere except in
  three keys, and saying so without turning it into a telling-off.
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
naming it a tune yet, and export. And export has gained a second meaning it did
not have: there is now a record worth taking with you, not just charts.

---

## Order

**M15 → M16 → M12 → M13.** M14, M9 and M10 have landed, in that order, with
M11 before them.

- M16 follows M15 and not the other way round, because its best vehicle is a
  mission and missions do not exist until M15 Phase 3 has landed. One piece of
  it does not wait: `best_streak_bpm` is captured during M15, because tempo at
  the moment a streak was clinched can only ever be recorded forwards.
- M15 goes first because it is the only item here that changes what daily use
  feels like now, and because it touches the tables M12 will stamp with owners
  — `sessions`, `session_blocks`, `cards` — so M12 should migrate the new
  shape once rather than the old shape and then the new one. It depends on
  nothing planned: the record it reads has been filling since M9.

- M14 went first, which was a change. It depended on nothing — no persistence,
  no account, no database — so it was not waiting for M9, and it was the only
  item here that answered a question rather than adding a capability. The order
  that puts a payment page in front of software nobody has been able to try is
  the order that spends three months learning nothing.
- M9 was the foundation and nothing else here could start without it. It is
  also, and this was not its original justification, the thing that makes a paid
  account hold anything: without it the record lives in one browser.
- M10 followed it rather than shipping alongside, because a profile released the
  same week as the log that feeds it is an empty page with headings on it.
  Written to M9's rule, it needs no rewriting when M12 lands.
- M12 before M13, and not negotiably. Billing in front of a shared password sells
  access to a room everybody is already standing in.
- M11 went first of all because it was independent of everything and fixed
  something that hurt every time a tune was typed in.

The non-code work in M13 runs
alongside from the start of M12, because it is the half with other people's
timelines in it.

### The release where the app stops being what it says it is

Four places stop being true and must change in the same release as accounts, and
M9 deliberately edited none of them, because the app must not hint at what it
cannot do: `SECURITY.md`'s threat model and its "no multi-tenancy",
`.env.example`, the README's opening claim, and the landing copy in
`LandingPage.svelte`. All four still stand, and the fifth requirement sharpens
what they have to become, since the landing page currently sells the opposite of
a hosted account — _one musician per instance_, _no user accounts_, _your
practice data belongs on your machine_.

The honest replacement keeps both halves true and does not apologise for either:
**run it yourself, or let somebody else run it for you.** The software stays free
and self-hostable; the fee buys hosting, backups and not having to keep a
Postgres alive. `APP_PASSWORD` remains exactly what it is — the right answer for
a personal instance — and stops being the only answer.

Not one word of it is edited before M12 ships, per the rule at the top of this
file.

---

## Decisions still open

Flagged here rather than settled by whoever happens to be typing:

1. **How people sign in** — password with a reset flow, or a magic link with no
   password at all. M12 recommends passwords and explains why; the deciding
   consideration is that e-mail becomes load-bearing either way.
2. **Retention of `chord_attempts`** — the recommendation is to keep everything
   forever, at a few thousand rows an hour, because it cannot be reconstructed.
   The table exists now and is filling, so this is a live question rather than a
   hypothetical one; nothing prunes it and nothing should until somebody decides
   it should.

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
