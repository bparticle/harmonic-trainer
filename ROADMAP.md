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
this file. What is left here is the fifth requirement and what it costs — plus
one section that came from none of the five, because it came from playing the
thing and finding a gap.

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

### Status: the family beta is in place

The part that can be tested without pretending the service is open to strangers
landed in August 2026:

- [x] Invite-only email/password accounts, provisioned by the operator.
- [x] Versioned scrypt hashes; no shared `APP_PASSWORD` remains in the app.
- [x] `cards`, `sessions`, custom charts, play records and every settings value
      resolve through the signed-in account.
- [x] The singleton settings row is the template for a new `user_prefs` row.
- [x] Cookies carry a revocation epoch; password changes and “sign out
      everywhere” bump it.
- [x] Existing history belongs to the original owner after migration, and an
      older valid cookie continues only until that owner is provisioned or
      revokes sessions.

This is deliberately **not M12 complete**. The operator can now add a few known
people and compare genuinely separate progress states. Opening registration to
strangers still requires the reset, abuse, deletion and export work below —
all of which has since landed; see the status update after it.

### Status: the safety work has landed too

Rate limiting, password reset, account deletion and data export all shipped
in the same slice, in that dependency order — reset needs rate limiting on
the requests it accepts, and deletion needed two real schema gaps fixed
first (`takes` and `repertoire` had no reliable owner to cascade from). The
reasoning for each is in `DECISIONS.md`.

- [x] Cross-account isolation, proven by an integration test that calls the
      real query functions the routes call — `loadHeadline`, `practiceTotals`,
      `loadSettings` and the rest — rather than asserting the schema merely
      could be scoped correctly.
- [x] Deleting an account leaves no row behind, in any owned table, proven by
      an integration test that seeds every table and counts rows before and
      after.
- [x] Exporting everything you own — raw rows, not the profile's aggregates —
      downloadable from `/profile`.
- [x] Sign-in and password-reset-request rate limiting, database-backed.
- [x] Self-service password reset over Maileroo: single-use token, one-hour
      expiry, every other outstanding token for the account burned when one
      is spent.
- [x] First-run "tour seen" moved from `localStorage` to `user_prefs` — a
      fact about the account, not the browser, as this file already said it
      should become.

One item is left, and it is the only one that cannot be closed from a
keyboard: an acceptance pass with two real family accounts, practising the
same evening, the operator confirming by eye that neither can see the
other's anything. The integration test proves the same claim in code; this
is that claim holding in the room the app is actually used in.

### This, not billing, is the hosting problem

Before the family slice, two subscribers would not have been two users. They
would have been two people typing
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

M9 had fixed none of the other four on purpose, and was right not to. It built the
seam and writes the play-along record through it; the tables the rest of the app
writes — `cards`, `srs_state`, `reviews`, `sessions`, `session_blocks` — were
deferred because each posed a question that could not be answered honestly
without a second player. There is now a second player, and the questions get
answered here.

### The tables that were waiting

| Table                                                      | Gets `user_id` | Why                                                             |
| ---------------------------------------------------------- | -------------- | --------------------------------------------------------------- |
| `cards`                                                    | done, not null | Generated as a ladder is climbed. Two players climb differently |
| `sessions`                                                 | done, not null | A practice session belongs to whoever sat down                  |
| `srs_state`                                                | no             | Its primary key _is_ `card_id`; the card already knows          |
| `reviews`, `session_blocks`                                | no             | Cannot exist without their parent, and the parent knows         |
| `skills`                                                   | no             | Seeded curriculum. A definition, not data                       |
| `charts`                                                   | done           | Null is built-in and shared; a value is yours                   |
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
The room-ownership question did not get decided so much as dissolved.

`user_prefs` now holds all of it — colour map, wheel config, MIDI device,
latency offset, cluster window, session length, reveal delay, ladder key and
rung — and the singleton is not deleted but re-employed: it becomes **the
defaults a new account is born with**. The check constraint pinning it to
`id = 1` still never has to be dropped, which was the cheapest possible outcome
and stays available for a reason nobody predicted.

`/api/settings` patches the caller's row rather than the singleton.
Nothing in the settings screens changes shape.

### Credentials

Email and a password are now hashed with `scrypt` from `node:crypto` — memory-hard,
already in the platform, no native module to break a deploy. The parameters go
in a constant with a comment saying when they were last raised.

Magic links were the real alternative and would have deleted a subsystem: no
hash, no reset flow, no credential stuffing. Passwords won because they degrade
better on the morning the mail provider is having a bad day. **E-mail still
becomes a hard dependency before public registration**, since a paid account
with no password reset is hostile.

The invite-only beta needs no email provider: the operator creates an account
and passes along its generated temporary password. Email delivery becomes the
first external service only when self-service reset opens to outside users.

### The cookie learns to be revoked

The payload M9 built was `userId.issuedAt.signature`. The family beta puts an epoch in front
of the timestamp — an integer on `users`, bumped by "sign out everywhere" and by
a password change — so a ninety-day cookie stops being permanent.

Verification is no longer self-sufficient: the epoch is read. That is one
user lookup per request, and it is the same lookup M13's entitlement check needs
anyway, so the cost is one query rather than two. `event.locals` ends up
carrying the user, not a boolean.

### What remains before accounts can open to strangers

Everything that could be built without a second real account now exists.
What is left is not a feature:

- **The acceptance pass itself** — two provisioned family accounts, practising
  the same evening, somebody actually looking to confirm neither can see the
  other's anything. Nobody has done this yet, because until this milestone
  there was only ever one real account to test it with.
- **Public self-registration**, which this milestone never attempted. Every
  account still exists because the operator ran `npm run account:create`.
  Opening that up is M13's problem as much as this one's — a sign-up form in
  front of nothing to pay for is a spam magnet, not a business.
- **The non-code half of M13** — a registered business, VAT, terms, a backup
  restore that has actually been run once. None of it is touched here.

### Done when

- [ ] Two provisioned family accounts practise the same rung on the same evening
      and an acceptance pass confirms neither can see the other's cards, charts,
      runs, badges or colours.
- [x] Signing out everywhere kills the cookie on the other machine by epoch.
- [x] Deleting an account leaves no row behind, proven by an integration test.
- [x] Sign-in/reset rate limits, reset email, export and deletion UI exist.
- [x] `npm run verify` passes for the family-beta slice.

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

## What the readiness gate left open

A mission is set only on a tune whose chord shapes have been met and whose ways
out of the key have been travelled — `curriculum/vocabulary.ts`, with the
reasoning in `DECISIONS.md`. Five things were recorded here when it shipped.
Three have since been dealt with and are written up there; two are still open,
and one of them cannot be closed from a keyboard.

### The curriculum above the early rungs is unproven by playing

The tests prove the gate is _consistent_ and `walk.test.ts` proves the climb has
no cliff in it. Neither proves each step **feels** like one step, and only
playing through the ladder can.

The failure to watch for is a tune arriving that is one shape too big. When it
happens the diagnosis is one of two things and the songbook's own _wants_ line
says which: a fold in `shapeOf` being too generous — a sixth chord counted as its
triad, a fully-diminished seventh counted as the vii° — or a rung being credited
with more than it teaches. Both are one-line changes with a test beside them;
what is not cheap is noticing, so the thing to keep is a note of which tune and
which chord.

### Two shapes are still taught by nothing

`sus-resolution` and `line-cliche` were added to the library and between them
closed the suspended chord and the minor-major seventh. What remains unteachable
is the **augmented triad**, and the `unknown` shape a numeral this app cannot
parse takes. A chart of your own using either is never _set_ as a mission,
though it stays in the songbook and stays playable.

Two honest answers, pulling opposite ways, and no evidence yet to choose between
them:

- **Teach it.** One more progression carrying the augmented triad — `I – I+ – IV`
  is the obvious one and is real material. Cost: the library grows for a case
  almost nobody hits.
- **Let a chart of your own opt out.** You typed it in, so you know what is in
  it. Cost: the gate stops meaning one thing, and _yours_ becomes a hole in a
  rule whose whole value is having no holes.

The deciding evidence is whether anybody writes one down, which the record will
show.

### A note on stored verdicts

`session_blocks.result_json` holds verdicts computed under the old chorus rule,
where a loop could add up to a chorus. They are frozen JSON and are not
recomputed, so an old verdict and a fresh evaluation of the same rows can
disagree. Nothing reads them expecting to agree; this is written down so that
whoever first notices does not go looking for a bug.

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

  One thing changed under it since this was written. A cold spot steers which
  tune a mission is set on, but it now steers **within what the readiness gate
  has already allowed** rather than across the whole chart list — so a cold
  dominant cannot pull somebody towards a blues before the blues has been
  taught. Anything built on top of the report inherits that ordering: the gate
  decides what is eligible, and the blind spots decide which of the eligible.

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

**M12 → M13.** M15 and M16 have landed, and M14, M9 and M10 before them, with
M11 before those.

- M16 followed M15 and not the other way round, because its best vehicle is a
  mission and missions did not exist until M15. Its reasoning is in
  `DECISIONS.md` and its status in the README, per the rules at the top of this
  file.
- M15 went first because it was the only item here that changed what daily use
  feels like now, and because it touches the tables M12 will stamp with owners
  — `sessions`, `session_blocks`, `cards` — so M12 migrates the new shape once
  rather than the old shape and then the new one. Its reasoning is in
  `DECISIONS.md` and its status in the README, per the rules at the top of this
  file.

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

Four places stopped being true with family accounts, and changed in the same
slice: `SECURITY.md`'s threat model, `.env.example`, the README's opening claim,
and the landing copy in `LandingPage.svelte`. M9 had deliberately left them
alone because the app must not hint at what it cannot do.

The family beta has now made the first edit honestly: the software is
self-hostable, carries separate invite-only accounts, and makes no claim that
public hosting exists. The later replacement can still say **run it yourself,
or let somebody else run it for you** when M13 makes the second half true.

---

## Decisions still open

One question, flagged here rather than settled by whoever happens to be
typing:

1. **Retention of `chord_attempts`** — the recommendation is to keep everything
   forever, at a few thousand rows an hour, because it cannot be reconstructed.
   The table exists now and is filling, so this is a live question rather than a
   hypothetical one; nothing prunes it and nothing should until somebody decides
   it should.

**Settled since the last revision, by the hosting requirement rather than by
argument:**

- Passwords, not magic links. The invite-only beta exercises the credential and
  revocation model without making email delivery the only way into the app.
- `chordClusterWindowMs` and `midiLatencyOffsetMs` are the player's. So is
  everything else in the singleton, because hosting deletes the shared room.
- The seeded skill graph is shared, being a definition; the cards generated from
  it are per-player, being data.
- Charts you typed in are private to you.

**Settled earlier:** slash chords carry their bass note. Arabic after the slash
is a degree of the key, Roman stays an applied dominant, and the walking bass
plays what the chart names. Reasoning in `DECISIONS.md`.
