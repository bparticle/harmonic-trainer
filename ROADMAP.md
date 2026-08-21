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
