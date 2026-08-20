import { closeVoicing, formatChord, parseChord, type AbstractChord } from '$lib/music/chord';
import { romanNumeral } from '$lib/music/analyse';
import { key as makeKey, type Key } from '$lib/music/key';
import { midi } from '$lib/music/note';
import { chordFromNumeral } from './progressions';
import { importedToSeed } from './import';
import type { ChartSeed } from './charts';
import { parseChordSheet } from './lyrics';

/**
 * Writing a chart down, one bar at a time.
 *
 * The importer this replaces was a text box, a Save button and a round trip to
 * the server, and every complaint about it was the same complaint: you could
 * not see what it was going to do until it had done it. Bars were pipe
 * characters. The written key silently governed every numeral stored. `G7alt`
 * became a plain `G7` without a word. And the problems arrived afterwards, as
 * line numbers, against a text box you then had to re-read.
 *
 * So the checking moved forward, to the keystroke. Everything here is pure and
 * runs on both sides: the editor calls it to show you what each bar will become
 * as you type, and the server calls the *same* functions before writing, so
 * what was on screen and what lands in the database cannot disagree. That is
 * the whole reason this is a module and not a component.
 *
 * A chart is stored as Roman numerals and resolved into a key when it is
 * played, which is what buys all twelve keys from one typing — and which is
 * also what makes the trip out and back worth showing, because it is not
 * lossless for every chord symbol anyone can write.
 */

/** A bar as it is being typed: chord symbols separated by spaces, and the words
 * sung over them if the chart has any. */
export type Bar = { text: string; lyric?: string };

/** Rows of bars. Four to a row is how a chart is read, not a rule. */
export type Grid = Bar[][];

/** More than this in one bar and it stops being readable. */
export const MAX_PER_BAR = 4;

export const BARS_PER_ROW = 4;

export type ChordReading = {
	/** Exactly what was typed. */
	written: string;
	/** What the parser made of it, formatted back. Null when it is not a chord. */
	read: string | null;
	/** The numeral it will be stored as. */
	numeral: string | null;
	/** What that numeral becomes again when the chart is played. */
	playback: string | null;
	/**
	 * The stored form does not come back as the chord that was written.
	 *
	 * Not a crash — a wrong chord, quietly, in a tune you are about to practise
	 * for an hour. It is the one failure here worth refusing to save.
	 */
	drift: boolean;
	/** Said plainly enough to act on. */
	problem: string | null;
	chord: AbstractChord | null;
};

export type BarReading = {
	/** Position in the form, counting only bars that hold something. */
	number: number | null;
	text: string;
	/** Carried through untouched. It is here so that the words and the numerals
	 * are filtered by one function rather than two — see `lyricsToRows`. */
	lyric: string;
	chords: ChordReading[];
	empty: boolean;
	problem: string | null;
};

export type GridReading = {
	rows: BarReading[][];
	bars: number;
	/** Everything wrong, in bar order. */
	problems: string[];
	/** Bars that come back as a different chord than the one written. */
	drift: Array<{ bar: number; written: string; playback: string }>;
	/**
	 * Safe to store.
	 *
	 * Drift is included rather than merely warned about. A chart that comes back
	 * as different chords is not a chart of the tune, and saving it anyway would
	 * put the app right back to playing something other than what is on screen.
	 */
	ok: boolean;
};

const tryParse = (symbol: string): AbstractChord | null => {
	try {
		return parseChord(symbol);
	} catch {
		return null;
	}
};

/**
 * One chord symbol, all the way out to storage and back.
 *
 * `read` is the fix for the quietest bug in the old importer. `G7alt` parses as
 * a plain `G7` and always did; what was missing was anywhere for you to notice.
 * Showing what the parser understood, next to what you typed, costs nothing and
 * makes the loss impossible to miss — so `alt` is called out by name, because
 * it is the one the songbook notes had to warn about in prose.
 */
export function readChord(written: string, k: Key): ChordReading {
	const blank: ChordReading = {
		written,
		read: null,
		numeral: null,
		playback: null,
		drift: false,
		problem: null,
		chord: null
	};

	const chord = tryParse(written);
	if (!chord) {
		return { ...blank, problem: `“${written}” is not a chord symbol I know.` };
	}

	const read = formatChord(chord);
	const numeral = romanNumeral(chord, k);

	let playback: string | null = null;
	try {
		playback = formatChord(chordFromNumeral(numeral, k));
	} catch {
		playback = null;
	}

	const drift = playback === null || playback !== read;

	// The parser accepts `alt` by ignoring it, which is worse than refusing it:
	// the chord is a real chord, just not the one that was asked for.
	const problem = /alt/i.test(written)
		? '“alt” is not understood. Write the alteration you want: 7b9, 7#5 or 7b13.'
		: drift
			? `Stored as ${numeral}, which comes back as ${playback ?? 'nothing'}.`
			: null;

	return { written, read, numeral, playback, drift, problem, chord };
}

/** One bar: the chords sharing it, split on whitespace. */
export function readBar(text: string, k: Key, number: number | null, lyric = ''): BarReading {
	const symbols = text.trim().split(/\s+/).filter(Boolean);

	if (symbols.length === 0) {
		return { number: null, text, lyric, chords: [], empty: true, problem: null };
	}

	const chords = symbols.map((symbol) => readChord(symbol, k));
	const problem =
		symbols.length > MAX_PER_BAR
			? `${symbols.length} chords in one bar. Four is the most a bar can hold.`
			: null;

	return { number, text, lyric, chords, empty: false, problem };
}

/**
 * The whole grid, in the key it is written in.
 *
 * Empty bars are dropped rather than rejected, which is how the importer has
 * always behaved — but a *gap* is reported. A bar left blank in the middle of a
 * form shortens it silently, and that is the same failure as the repeat mark
 * the songbook notes tell you to write out in full. In a grid you can at least
 * be told which bar it was.
 */
export function readGrid(grid: Grid, keyName: string): GridReading {
	const k = makeKey(keyName.replace(/m$/, ''));

	const problems: string[] = [];
	const drift: GridReading['drift'] = [];
	let number = 0;

	const rows = grid.map((row, r) =>
		row.map((bar, c) => {
			const filled = bar.text.trim().length > 0;
			const reading = readBar(bar.text, k, filled ? ++number : null, bar.lyric ?? '');
			// An empty bar has no place in the form, so it cannot be named after
			// one. Everything else is numbered the way a player counts.
			const where = filled ? `Bar ${reading.number}` : `Row ${r + 1}, bar ${c + 1}`;

			if (reading.problem) problems.push(`${where}: ${reading.problem}`);
			for (const chord of reading.chords) {
				if (chord.problem) problems.push(`${where}: ${chord.problem}`);
				if (chord.drift && chord.read) {
					drift.push({
						bar: reading.number ?? 0,
						written: chord.read,
						playback: chord.playback ?? '—'
					});
				}
			}

			return reading;
		})
	);

	// A blank bar with anything after it is a hole in the form, not the end of it.
	const flat = rows.flat();
	const lastFilled = flat.reduce((last, bar, i) => (bar.empty ? last : i), -1);
	let position = 0;
	for (const [r, row] of rows.entries()) {
		for (const [c, bar] of row.entries()) {
			if (bar.empty && position < lastFilled) {
				problems.push(
					`Row ${r + 1}, bar ${c + 1} is empty. It will be dropped and the form will come out short.`
				);
			}
			position++;
		}
	}

	const unreadable = flat.some((bar) => bar.chords.some((c) => !c.chord)) || problems.length > 0;

	return { rows, bars: number, problems, drift, ok: number > 0 && !unreadable };
}

/** The numerals to store, dropping the bars that hold nothing. */
export function gridToRows(reading: GridReading): string[][] {
	return keptRows(reading).map((row) =>
		row.map((bar) => bar.chords.map((chord) => chord.numeral).join(' '))
	);
}

/**
 * The words to store, in the shape `gridToRows` just produced.
 *
 * The two have to agree bar for bar or every lyric after the first empty bar is
 * sung over the wrong chord — so they are filtered by one function and not by
 * two that happen to be written the same way today. Returns null when there is
 * nothing to sing, which is what keeps an instrumental's column null rather
 * than a grid of empty strings.
 */
export function lyricsToRows(reading: GridReading): string[][] | null {
	const rows = keptRows(reading).map((row) => row.map((bar) => bar.lyric.trim()));
	return rows.some((row) => row.some(Boolean)) ? rows : null;
}

/** Bars that made it into the form, grouped as they will be printed. */
function keptRows(reading: GridReading): BarReading[][] {
	return reading.rows.map((row) => row.filter((bar) => !bar.empty)).filter((row) => row.length > 0);
}

/**
 * A draft, shaped like any other chart so it can be heard before it is saved.
 *
 * Hearing a tune once is the cheapest proof-read there is, and this app already
 * owns everything needed to play it.
 */
export function draftSeed(name: string, reading: GridReading, mode: 'major' | 'minor'): ChartSeed {
	return importedToSeed(name || 'Draft', gridToRows(reading), { mode });
}

/** Close voicings for the draft, in order, for `playProgression`. */
export function draftVoicings(reading: GridReading): number[][] {
	return reading.rows
		.flat()
		.flatMap((bar) => bar.chords)
		.filter((chord) => chord.chord)
		.map((chord) => closeVoicing(chord.chord!, 3).map(midi));
}

export const emptyBar = (): Bar => ({ text: '' });

export function emptyGrid(rows = 3, bars = BARS_PER_ROW): Grid {
	return Array.from({ length: rows }, () => Array.from({ length: bars }, emptyBar));
}

/**
 * Fill a grid from pasted text.
 *
 * The pipe syntax does not disappear — it is how a chart arrives from a napkin,
 * an email or an agent transcribing a Real Book page, and typing one in that
 * form is still the fastest way in for anyone who can touch-type. What changes
 * is that it is now an *input* to the grid rather than the only way through it:
 * paste, then fix what is wrong where you can see it.
 */
export function parseIntoGrid(text: string): Grid {
	const rows: Grid = [];

	for (const raw of text.split(/\r?\n/)) {
		// Repeat marks and bar numbers carry no harmony. They are dropped here the
		// same way the importer has always dropped them.
		const line = raw.replace(/[:‖%]/g, ' ').trim();
		if (!line) continue;

		const cells = line
			.split('|')
			.map((cell) => cell.trim())
			.filter(Boolean);

		if (cells.length) rows.push(cells.map((text) => ({ text })));
	}

	return rows.length ? rows : emptyGrid();
}

/**
 * A chord sheet — chords written above the words — as a grid.
 *
 * The sibling of `parseIntoGrid`, for the other format a song arrives in. Each
 * chord becomes a bar and each line of the sheet becomes a row, which means a
 * row of the chart is a line of the song: exactly the arrangement somebody
 * singing it wants to read.
 */
export function sheetIntoGrid(text: string): Grid {
	const rows = parseChordSheet(text).rows.map((row) =>
		row.bars.map((bar, i) => ({ text: bar, lyric: row.lyrics[i] ?? '' }))
	);
	return rows.length ? rows : emptyGrid();
}

/** Is this text worth treating as a paste rather than as one chord? */
export const looksLikeChart = (text: string): boolean => /[|\n]/.test(text);
