import { gridToRows, parseIntoGrid, readGrid } from '$lib/curriculum/editor';

/**
 * Does a chart survive being stored?
 *
 * Charts are kept as Roman numerals so that one typing gets you twelve keys,
 * and the trip out to numerals and back is not lossless for every chord symbol.
 * A chord that does not survive it is not a crash — it is a wrong chord, quietly,
 * in a tune you are about to practise. So the trip is made and checked before
 * anything is written anywhere.
 *
 * The checking itself lives in `$lib/curriculum/editor`, which is also what the
 * chart editor on /backing shows you as you type and what the server runs
 * before writing a row. This file is the command-line face of it and nothing
 * more: a second implementation would be a second opinion about what a chord
 * means, and the two would eventually disagree.
 */

export type Check = {
	ok: boolean;
	bars: number;
	/** The grid as it would be stored. */
	rows: string[][];
	/** Anything that stops the chart being stored at all. */
	problems: string[];
	/** Bars that come back as a different chord than the one written. */
	drift: Array<{ bar: number; written: string; stored: string }>;
};

export function checkChart(text: string, keyName: string): Check {
	// The grid drops a bar holding only a repeat mark, so `| % |` silently
	// shortens the form rather than repeating anything. Caught here rather than
	// in the editor, where an empty bar is visible on screen and this is not.
	if (/[%‖𝄎]/.test(text)) {
		return {
			ok: false,
			bars: 0,
			rows: [],
			drift: [],
			problems: [
				'Repeat marks found. Write the repeated chord out in full — a bar holding',
				'only a repeat mark is dropped, and the form comes out short.'
			]
		};
	}

	const reading = readGrid(parseIntoGrid(text), keyName);

	return {
		ok: reading.ok,
		bars: reading.bars,
		rows: reading.ok ? gridToRows(reading) : [],
		problems: reading.problems,
		drift: reading.drift.map((d) => ({ bar: d.bar, written: d.written, stored: d.playback }))
	};
}

/** The report both scripts print. Returns true when the chart is safe to store. */
export function report(check: Check, keyName: string): boolean {
	if (check.problems.length) {
		for (const problem of check.problems) console.error(`! ${problem}`);
		return false;
	}

	console.log(`${check.bars} bars in ${keyName}\n`);
	console.log('as stored:');
	for (const row of check.rows) console.log(`  | ${row.join(' | ')} |`);

	if (check.drift.length) {
		console.error(`\n! ${check.drift.length} bar(s) come back as a different chord:`);
		for (const bar of check.drift) {
			console.error(`  bar ${bar.bar}: ${bar.written} → ${bar.stored}`);
		}
		console.error('\n  Either teach chordFromNumeral to carry it');
		console.error('  (src/lib/curriculum/progressions.ts), or write the chord another way.');
		console.error('  Do not store it as it stands — it will play as the chord on the right.');
		return false;
	}

	console.log(`\nall ${check.bars} bars come back unchanged.`);
	return true;
}
