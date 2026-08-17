---
name: songbook
description: Transcribe a chord sheet into this app's play-along songbook — a photo of a lead sheet or Real Book page, a scan, or chord symbols typed out. Use this whenever someone shares chord changes and wants to play along with them, add a tune, get a song into the chart list or the backing track, or asks where a new chart should live. Covers reading the sheet, choosing between charts.ts and the local database, checking the chords survive being stored, and putting them in.
---

# Adding a tune to the play-along songbook

A chart in this app is not a list of chord symbols. It is stored as Roman
numerals and resolved into a key when it is played, which is the only reason a
tune typed in once plays in all twelve keys. Two things follow, and they shape
every step below:

- **The written key has to be right**, because every numeral is measured from it.
  Get it wrong and the chart still works, still transposes, and is wrong in all
  twelve keys identically.
- **A chord the numerals cannot carry does not fail loudly.** It comes back as a
  nearby, simpler chord. That is worse than an error: it is a wrong chord in a
  tune someone is about to practise for an hour. Hence step 3, which is not
  optional.

## 1. Decide where it goes

This repo is public, and `src/lib/curriculum/charts.ts` sets its own rule at the
top of the file: the built-in standards are public domain only, US publication
in 1930 or earlier, with the year recorded on each one so the claim can be
checked. Respect it — it is the file's own licence to contain what it contains.

| The tune                            | Where it goes                                                     |
| ----------------------------------- | ----------------------------------------------------------------- |
| Published 1930 or earlier in the US | `CHARTS` in `src/lib/curriculum/charts.ts`, with `published:` set |
| Later, or you are not sure          | the local database, where it appears under **Yours**              |

Look the year up rather than guessing; if it stays uncertain, the database is
the safe side. Say out loud which you chose and why, because it is the one
decision here the user cannot see from the result.

Forms and named devices — a blues, a turnaround, a cycle — are nobody's
composition and belong in `charts.ts` under `form` or `cycle` regardless of when
they were written down.

## 2. Read the sheet into a text file

Write the grid to a scratch file. One line per row of the sheet, `|` between
bars, spaces between chords sharing a bar:

```
| Fm7 | Bbm7 | Eb7 | Abmaj7 |
| Dbmaj7 | G7 | Cmaj7 | Cmaj7 |
```

Two chords in a bar split it evenly; four is the most a bar can hold. Rows are
only how a chart is read — four bars to a line is conventional and worth
keeping.

What to watch for while reading:

- **Write repeat marks out in full.** A `%` is stripped and the bar it leaves
  empty is dropped, so the form silently comes out short. The check in step 3
  refuses a chart containing one.
- **Flatten the road map.** Repeats, first and second endings, D.S., codas — the
  play-along loops one grid, so it needs one linear pass. Where endings differ,
  take the one that leads back round.
- **Count the bars against the form.** 12, 16, 32, 36. The count is the single
  best check that you read the page correctly, and the check script prints it.
- **Slashes and rhythm marks carry no harmony.** Ignore them; only chord changes
  matter here.

Keep the sheet's own key. For a minor tune pass the tonic (`C` or `Cm`, both
work) and add `--minor` — numerals count from the major scale either way, which
is how charts have always been written.

## 3. Check the chart survives being stored

From the project root:

```bash
npx vite-node .claude/skills/songbook/scripts/check-chart.ts <file> <key>
```

It needs no database and writes nothing. It prints the bar count, the numerals
the chart will be stored as, and every bar that comes back as a different chord
than the one you wrote.

If a bar drifts, you have two honest options: teach `chordFromNumeral` in
`src/lib/curriculum/progressions.ts` to carry that chord, or write the chord a
way the numerals can hold. Never store a drifting chart — the app will play the
chord on the right-hand side of the arrow, not the one on the sheet.

The check itself lives in `src/lib/curriculum/editor.ts`. The script, the editor
on `/backing` and the server all run that one implementation, so what this
prints is exactly what the app would show you and exactly what gets written.

**Slash chords keep their bass note.** `C/E` stores as `I/3` and comes back as
`C/E`, and the walking bass starts the bar on the E. After a slash, Arabic is a
bass degree of the key and Roman is still an applied dominant (`V7/vi`).

## 4. Put it in

**Into the database** (the usual case):

```bash
npx vite-node .claude/skills/songbook/scripts/add-chart.ts <file> <key> "<name>" --bpm 140
```

Needs `npm run db:up` and `DATABASE_URL`. It runs the same check first and
writes nothing if the chart drifts.

This is what the chart editor on `/backing` does, from the command line. The
editor is a grid: a bar is a cell, chords are parsed as you type, and the
numeral each bar will be stored as sits under it — so prefer it when the user is
sitting at the app. Reach for the script when transcribing on their behalf, or
when the tune is long enough that typing it in bar by bar would be tedious.
Pasting the pipe syntax into the editor's first cell fills the whole grid, which
is often the fastest route: transcribe to a file, check it here, paste it in.

Both write `notes` as a real column now. The script leaves it as `Yours.`; the
editor has a field for it, and it is worth filling in — every entry in
`charts.ts` says what the tune is _for_ practising rather than what it is.

**Into `charts.ts`** (public domain only): add a `ChartSeed` to `CHARTS`. Paste
the grid straight from the check script's output — those rows are the numerals
verbatim. Set `category`, `style` (`custom` unless it really is a blues or
rhythm changes), `published`, and write real `notes`: every entry in that file
says what the tune is _for_ practising, not what it is. Match that. Nothing
needs reseeding — the page reads `CHARTS` from code.

## 5. See it in the app

```bash
npm run dev
```

Open `/backing?chart=<slug>`, check the bar count and key in the header, and
read the chords through against the sheet. A quick way to get all of them at
once from the browser console:

```js
Array.from(document.querySelectorAll('button[aria-label^="Study"]'))
	.map((b) => b.getAttribute('aria-label').replace(/^Study /, ''))
	.join('\n');
```

If you changed any code, finish with `npm run verify`.

## What the chord parser understands

Roots `A`–`G` with `b`/`#`. Then: `m` `min` `-` for minor, `maj` `M` `∆`,
`m7b5` `ø`, `dim` `°` `o`, `dim7` `°7` `o7`, `aug` `+`, `sus2` `sus4`, sixths
`6` `m6`, extensions `7` `9` `11` `13`, alterations `b5` `#5` `b9` `#9` `#11`
`b13`, and a slash bass, which now stores and plays back.

`alt` is **not** understood — `G7alt` reads as a plain `G7`. The loss happens on
the way in, where a round-trip check cannot see it, so it is caught by name
instead: both the script and the editor say so outright. Write the alteration
you actually want: `G7b9`, `G7#5`, `G7b13`.

## Removing one

The chart page has a delete button for anything under Yours. Otherwise:
`delete from charts where slug = '<slug>'`.
