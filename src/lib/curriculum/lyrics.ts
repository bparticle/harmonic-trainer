import { parseChord } from '$lib/music/chord';

/**
 * Chords written above the words, which is how a song arrives.
 *
 * Nobody hands you a chord chart and a separate list of lyrics. They hand you
 * this — two lines at a time, the chord symbols spaced out over the syllable
 * they land on — and it is the format a songbook, a forum post and an email
 * from the person you are playing with all use.
 *
 * So it is the format this reads. A chord's column in the line above is a claim
 * about which word it falls on, and turning that claim into "these words belong
 * to this bar" is the whole of the work here.
 *
 * What this deliberately does not do is guess at timing inside a bar. A chord
 * gets its words and the whole fragment lights up when the bar does. Spreading
 * the words evenly across four beats would look more precise and be less true —
 * nobody sings evenly, and a practice tool that pretends to know where the
 * third syllable falls is lying about the one thing the singer is listening for.
 */

/** One row of the sheet: the bars, and the words under each of them. */
export type SheetRow = {
	/** Chord symbols as written, one per bar. */
	bars: string[];
	/** The words under each bar. Same length as `bars`; '' where there are none. */
	lyrics: string[];
};

export type ChordSheet = {
	rows: SheetRow[];
	/** Whether any row carried words at all. A sheet with none is just a grid. */
	hasLyrics: boolean;
};

/** `[Verse]`, `[Chorus 2]` — a label for a person, carrying no harmony. */
const SECTION = /^\s*\[[^\]]*\]\s*$/;

function isChord(token: string): boolean {
	try {
		parseChord(token);
		return true;
	} catch {
		return false;
	}
}

/**
 * A line of nothing but chord symbols.
 *
 * Every token has to parse, because one that does not is the tell that this is
 * a lyric line that happens to start with a word like "A" or "Am". Requiring
 * all of them is what keeps "A man walks in" from being read as a bar of A.
 */
function chordLine(line: string): { text: string; column: number }[] | null {
	const found: { text: string; column: number }[] = [];
	const pattern = /\S+/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(line)) !== null) {
		if (!isChord(match[0])) return null;
		found.push({ text: match[0], column: match.index });
	}

	return found.length ? found : null;
}

/**
 * Where a split can go without cutting a word in half.
 *
 * Chord columns in a hand-typed sheet are approximate — they are eyeballed
 * against a proportional or monospaced font that may not be the one you are
 * reading in — so a chord very often sits one or two characters inside the word
 * it belongs to. Snapping to the nearest word boundary is what turns
 * "did a-tel|l me" into a split a person would have made.
 */
function wordStarts(lyric: string): number[] {
	const starts: number[] = [];
	for (let i = 0; i < lyric.length; i++) {
		if (lyric[i] !== ' ' && (i === 0 || lyric[i - 1] === ' ')) starts.push(i);
	}
	starts.push(lyric.length);
	return starts;
}

function snap(starts: number[], at: number, notBefore: number): number {
	let best = starts[starts.length - 1];
	for (const start of starts) {
		if (start < notBefore) continue;
		if (Math.abs(start - at) < Math.abs(best - at)) best = start;
	}
	return Math.max(best, notBefore);
}

/**
 * Hand each chord the words underneath it.
 *
 * The first chord takes everything from the start of the line regardless of its
 * own column — a sheet that indents the first chord past the first word is not
 * saying the first word belongs to nobody.
 */
export function splitLyric(lyric: string, columns: number[]): string[] {
	if (columns.length === 0) return [];
	if (columns.length === 1) return [lyric.trim()];

	const starts = wordStarts(lyric);
	const cuts: number[] = [0];
	for (const column of columns.slice(1)) {
		cuts.push(snap(starts, column, cuts[cuts.length - 1]));
	}
	cuts.push(lyric.length);

	return cuts.slice(0, -1).map((from, i) => lyric.slice(from, cuts[i + 1]).trim());
}

/**
 * Read a whole sheet.
 *
 * A chord line claims its words from the line directly under it, and a chord
 * line with nothing readable under it is simply a row of bars — which is what
 * makes this a superset of the plain grid format rather than a second one.
 * Section labels are dropped; they are for the reader, and the loop does not
 * have sections.
 */
export function parseChordSheet(text: string): ChordSheet {
	const lines = text.split(/\r?\n/);
	const rows: SheetRow[] = [];
	let hasLyrics = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line.trim() || SECTION.test(line)) continue;

		const chords = chordLine(line);
		if (!chords) continue;

		const below = lines[i + 1];
		const singable =
			below !== undefined && below.trim() !== '' && !SECTION.test(below) && !chordLine(below);

		const lyrics = singable
			? splitLyric(
					below,
					chords.map((c) => c.column)
				)
			: chords.map(() => '');
		if (singable) {
			hasLyrics = true;
			// Consumed: the words belong to the chords above them and to nothing else.
			i++;
		}

		rows.push({ bars: chords.map((c) => c.text), lyrics });
	}

	return { rows, hasLyrics };
}

/**
 * Is this text a chord sheet rather than a pipe-separated grid?
 *
 * Asked by the editor's paste handler, which already understands the grid
 * format and must not read `| C | F |` as a chord line with no words. The
 * presence of a `|` settles it: chord sheets do not use them, grids are nothing
 * but them.
 */
export function looksLikeChordSheet(text: string): boolean {
	if (!text.includes('\n') || text.includes('|')) return false;
	const sheet = parseChordSheet(text);
	return sheet.hasLyrics;
}

/** The bars, as `parseIntoGrid` would have produced them. */
export const sheetToRows = (sheet: ChordSheet): string[][] => sheet.rows.map((row) => row.bars);

/** The words, in the same shape. */
export const sheetToLyrics = (sheet: ChordSheet): string[][] => sheet.rows.map((row) => row.lyrics);
