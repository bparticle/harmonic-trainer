import { parseChartText, importedToSeed } from '$lib/curriculum/import';
import { realiseChart } from '$lib/curriculum/charts';
import { formatChord, parseChord } from '$lib/music/chord';

/**
 * Does a chart survive being stored?
 *
 * Charts are kept as Roman numerals so that one typing gets you twelve keys,
 * and the trip out to numerals and back is not lossless for every chord symbol.
 * A chord that does not survive it is not a crash — it is a wrong chord, quietly,
 * in a tune you are about to practise. So the trip is made and checked before
 * anything is written anywhere.
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
	const empty = { ok: false, bars: 0, rows: [], drift: [] };

	// The importer strips repeat marks and then drops the bar they leave empty,
	// so `| % |` silently shortens the form rather than repeating anything.
	if (/[%‖𝄎]/.test(text)) {
		return {
			...empty,
			problems: [
				'Repeat marks found. Write the repeated chord out in full — a bar holding',
				'only a repeat mark is dropped, and the form comes out short.'
			]
		};
	}

	const parsed = parseChartText(text, keyName);
	if (parsed.problems.length) return { ...empty, problems: parsed.problems };

	/* The source, tokenised exactly as the importer tokenises it, so the two
	 * lists line up bar for bar. They can only line up because a chart with
	 * problems has already been rejected above — a bar the importer skipped
	 * would shift everything after it. */
	const written: string[] = [];
	for (const raw of text.split(/\r?\n/)) {
		const line = raw.replace(/[:‖%]/g, ' ').trim();
		if (!line) continue;
		for (const cell of line.split('|')) {
			const bar = cell.trim();
			if (!bar) continue;
			written.push(
				bar
					.split(/\s+/)
					.filter(Boolean)
					.map((symbol) => formatChord(parseChord(symbol)))
					.join(' ')
			);
		}
	}

	const seed = importedToSeed('check', parsed.rows);
	const stored = realiseChart(seed, keyName)
		.rows.flat()
		.map((bar) => bar.chords.map((c) => c.symbol).join(' '));

	const drift = written
		.map((symbol, i) => ({ bar: i + 1, written: symbol, stored: stored[i] ?? '—' }))
		.filter((bar) => bar.written !== bar.stored);

	return { ok: drift.length === 0, bars: parsed.bars, rows: parsed.rows, problems: [], drift };
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
