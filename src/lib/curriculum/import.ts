import { parseChord, type AbstractChord } from '$lib/music/chord';
import { romanNumeral } from '$lib/music/analyse';
import { key as makeKey } from '$lib/music/key';
import type { ChartSeed } from './charts';

/**
 * Bringing your own charts in.
 *
 * You write what is on the page in front of you — chord symbols, in the key it
 * is written in — and this stores Roman numerals. That is the whole trick: once
 * a tune is numerals it transposes like everything else in the app, so typing
 * it in once buys you all twelve keys.
 *
 * The syntax is what people already write on a napkin:
 *
 *     | Dm7 | G7 | Cmaj7 | Cmaj7 |
 *     | Am7 D7 | Dm7 G7 | Cmaj7 | Cmaj7 |
 *
 * One line is one row. Bars are separated by `|`, chords within a bar by
 * spaces, and everything else is ignored. Repeat marks, blank lines and stray
 * punctuation cost nothing to skip and would cost you a re-type to forbid.
 */

export type ImportedChart = {
	rows: string[][];
	/** Bars, for the summary. */
	bars: number;
	/** Anything not understood, said plainly enough to fix. */
	problems: string[];
};

/** A bar can hold this many chords before it stops being readable. */
const MAX_PER_BAR = 4;

export function parseChartText(text: string, keyName: string): ImportedChart {
	const k = makeKey(keyName.replace(/m$/, ''));
	const rows: string[][] = [];
	const problems: string[] = [];
	let bars = 0;

	const lines = text.split(/\r?\n/);

	for (const [index, raw] of lines.entries()) {
		// Repeat marks and bar numbers are how charts are actually written down;
		// they carry no harmony, so they are dropped rather than rejected.
		const line = raw.replace(/[:‖%]/g, ' ').trim();
		if (!line) continue;

		const cells = line
			.split('|')
			.map((cell) => cell.trim())
			.filter(Boolean);

		if (cells.length === 0) continue;

		const row: string[] = [];
		for (const cell of cells) {
			const symbols = cell.split(/\s+/).filter(Boolean);
			if (symbols.length > MAX_PER_BAR) {
				problems.push(`Line ${index + 1}: "${cell}" has ${symbols.length} chords in one bar.`);
				continue;
			}

			const numerals: string[] = [];
			for (const symbol of symbols) {
				const chord = tryParse(symbol);
				if (!chord) {
					problems.push(`Line ${index + 1}: "${symbol}" is not a chord symbol I know.`);
					continue;
				}
				numerals.push(romanNumeral(chord, k));
			}

			if (numerals.length) {
				row.push(numerals.join(' '));
				bars++;
			}
		}

		if (row.length) rows.push(row);
	}

	if (rows.length === 0 && problems.length === 0) {
		problems.push('Nothing to import. Write the chords out with a | between bars.');
	}

	return { rows, bars, problems };
}

function tryParse(symbol: string): AbstractChord | null {
	try {
		return parseChord(symbol);
	} catch {
		return null;
	}
}

/**
 * A chart of your own, shaped like the built-in ones so everything downstream —
 * realising, playing, colouring — cannot tell the difference.
 */
export function importedToSeed(
	name: string,
	rows: string[][],
	options: { defaultBpm?: number; mode?: 'major' | 'minor' } = {}
): ChartSeed {
	return {
		slug: slugify(name),
		name,
		style: 'custom',
		category: 'mine',
		mode: options.mode ?? 'major',
		defaultBpm: options.defaultBpm ?? 140,
		grid: rows,
		notes: 'Yours.'
	};
}

export function slugify(name: string): string {
	return (
		name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 60) || 'chart'
	);
}
