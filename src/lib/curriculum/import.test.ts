import { describe, expect, it } from 'vitest';
import { realiseChart } from './charts';
import { importedToSeed, parseChartText, slugify } from './import';

const flat = (rows: string[][]) => rows.flat();

describe('reading a chart off the page', () => {
	it('turns chord symbols into numerals in the key you say it is in', () => {
		const { rows } = parseChartText('| Dm7 | G7 | Cmaj7 | Cmaj7 |', 'C');
		expect(flat(rows)).toEqual(['ii7', 'V7', 'Imaj7', 'Imaj7']);
	});

	it('reads the same tune written in another key to the same numerals', () => {
		// The whole point: typing it in once should buy all twelve keys.
		const inC = parseChartText('| Dm7 | G7 | Cmaj7 |', 'C');
		const inEb = parseChartText('| Fm7 | Bb7 | Ebmaj7 |', 'Eb');
		expect(flat(inEb.rows)).toEqual(flat(inC.rows));
	});

	it('keeps two chords in a bar as two chords in a bar', () => {
		const { rows } = parseChartText('| Am7 D7 | Dm7 G7 |', 'C');
		expect(flat(rows)).toEqual(['vi7 II7', 'ii7 V7']);
	});

	it('makes one row per line', () => {
		const { rows } = parseChartText('| C | F |\n| G | C |', 'C');
		expect(rows).toEqual([
			['I', 'IV'],
			['V', 'I']
		]);
	});

	it('counts the bars', () => {
		expect(parseChartText('| C | F | G | C |', 'C').bars).toBe(4);
	});

	it('does not mind the leading and trailing bar lines being absent', () => {
		expect(flat(parseChartText('C | F | G', 'C').rows)).toEqual(['I', 'IV', 'V']);
	});

	it('ignores repeat marks and blank lines', () => {
		// Both are all over a real chart and neither carries any harmony.
		const { rows, problems } = parseChartText(':| C | F |:\n\n| G | C |', 'C');
		expect(problems).toEqual([]);
		expect(rows).toHaveLength(2);
	});

	it('accepts the ways people actually write accidentals', () => {
		const { rows, problems } = parseChartText('| Bb7 | F#m7b5 | Ebmaj7 |', 'Eb');
		expect(problems).toEqual([]);
		expect(rows[0]).toHaveLength(3);
	});

	it('says which chord it could not read, and where', () => {
		const { problems } = parseChartText('| C | Hm9 | G7 |', 'C');
		expect(problems).toHaveLength(1);
		expect(problems[0]).toContain('Hm9');
		expect(problems[0]).toContain('Line 1');
	});

	it('keeps the chords it did understand when one is wrong', () => {
		// Rejecting the whole chart over one typo means re-typing the whole chart.
		const { rows } = parseChartText('| C | Hm9 | G7 |', 'C');
		expect(flat(rows)).toEqual(['I', 'V7']);
	});

	it('refuses a bar with more chords than anyone can read', () => {
		const { problems } = parseChartText('| C F G Am Dm |', 'C');
		expect(problems[0]).toContain('5 chords in one bar');
	});

	it('says something useful about an empty chart', () => {
		expect(parseChartText('   ', 'C').problems[0]).toContain('Nothing to import');
	});
});

describe('an imported chart behaves like a built-in one', () => {
	const source = '| Dm7 | G7 | Cmaj7 | A7 |\n| Dm7 | G7 | Cmaj7 | Cmaj7 |';

	it('round-trips back to the chords that were typed in', () => {
		const { rows } = parseChartText(source, 'C');
		const seed = importedToSeed('Test tune', rows);
		const symbols = realiseChart(seed, 'C')
			.rows.flat()
			.flatMap((bar) => bar.chords.map((c) => c.symbol));
		expect(symbols).toEqual(['Dm7', 'G7', 'Cmaj7', 'A7', 'Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
	});

	it('transposes, which is the entire reason for storing numerals', () => {
		const { rows } = parseChartText(source, 'C');
		const symbols = realiseChart(importedToSeed('Test tune', rows), 'F')
			.rows.flat()
			.flatMap((bar) => bar.chords.map((c) => c.symbol));
		expect(symbols.slice(0, 4)).toEqual(['Gm7', 'C7', 'Fmaj7', 'D7']);
	});

	it('lands in the "yours" category, never among the standards', () => {
		const seed = importedToSeed('Test tune', [['I']]);
		expect(seed.category).toBe('mine');
		expect(seed.published).toBeUndefined();
	});
});

describe('slugs', () => {
	it('makes a url-safe name', () => {
		expect(slugify('All The Things You Are')).toBe('all-the-things-you-are');
	});

	it('drops punctuation rather than encoding it', () => {
		expect(slugify("Bill Bailey, Won't You?")).toBe('bill-bailey-won-t-you');
	});

	it('always returns something', () => {
		expect(slugify('!!!')).toBe('chart');
	});
});
