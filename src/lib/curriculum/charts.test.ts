import { describe, expect, it } from 'vitest';
import { totalBeats } from '$lib/audio/bass';
import { CHARTS, chartBySlug, realiseChart } from './charts';

const blues = chartBySlug('blues-12')!;
const jazzBlues = chartBySlug('blues-12-jazz')!;
const minorBlues = chartBySlug('minor-blues-12')!;

const symbols = (slug: string, key: string) =>
	realiseChart(chartBySlug(slug)!, key)
		.rows.flat()
		.flatMap((bar) => bar.chords.map((c) => c.symbol));

describe('resolving a chart into a key', () => {
	it('gives the blues its three dominant sevenths', () => {
		expect(symbols('blues-12', 'C')).toEqual([
			'C7',
			'F7',
			'C7',
			'C7',
			'F7',
			'F7',
			'C7',
			'C7',
			'G7',
			'F7',
			'C7',
			'G7'
		]);
	});

	it('transposes without respelling anything oddly', () => {
		expect(symbols('blues-12', 'F')).toEqual([
			'F7',
			'Bb7',
			'F7',
			'F7',
			'Bb7',
			'Bb7',
			'F7',
			'F7',
			'C7',
			'Bb7',
			'F7',
			'C7'
		]);
		expect(symbols('blues-12', 'E')).toContain('A7');
	});

	it('numbers the bars from one, continuing across rows', () => {
		const bars = realiseChart(blues, 'C').rows.flat();
		expect(bars.map((b) => b.number)).toEqual([...Array(12).keys()].map((i) => i + 1));
	});

	it('splits a bar holding two chords into half each', () => {
		const bar = realiseChart(jazzBlues, 'C').rows[0][3];
		expect(bar.chords.map((c) => c.symbol)).toEqual(['Gm7', 'C7']);
		expect(bar.chords.map((c) => c.beats)).toEqual([2, 2]);
	});

	it('reads the minor forms in minor', () => {
		const first = realiseChart(minorBlues, 'C').rows[0][0].chords[0];
		expect(first.symbol).toBe('Cm7');
		expect(realiseChart(minorBlues, 'C').rows[1][0].chords[0].symbol).toBe('Fm7');
	});

	it('builds the passing diminished as a real diminished seventh', () => {
		// A half-diminished here would be a different chord with a different job.
		const bar = realiseChart(jazzBlues, 'C').rows[1][1];
		expect(bar.chords[0].symbol).toBe('F#dim7');
	});

	it('resolves an applied dominant to the dominant of its target', () => {
		const bars = realiseChart(chartBySlug('rhythm-changes')!, 'B♭').rows.flat();
		const applied = bars.flatMap((b) => b.chords).find((c) => c.numeral === 'V7/vi')!;
		expect(applied.symbol).toBe('D7');
	});

	it('keeps the numerals alongside the symbols', () => {
		const bar = realiseChart(blues, 'C').rows[0][0];
		expect(bar.chords[0].numeral).toBe('I7');
	});
});

describe('what the players are handed', () => {
	it('flattens to bars totalling four beats each', () => {
		for (const seed of CHARTS) {
			const chart = realiseChart(seed, 'C');
			const printed = chart.rows.flat().length;
			expect(totalBeats(chart.bars), seed.slug).toBe(printed * 4);
		}
	});

	it('resolves every chart in every key without throwing', () => {
		const keys = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];
		for (const seed of CHARTS) {
			for (const k of keys) {
				expect(() => realiseChart(seed, k), `${seed.slug} in ${k}`).not.toThrow();
			}
		}
	});

	it('holds a real chord in every bar', () => {
		for (const seed of CHARTS) {
			for (const bar of realiseChart(seed, 'C').rows.flat()) {
				expect(bar.chords.length, `${seed.slug} bar ${bar.number}`).toBeGreaterThan(0);
				for (const chord of bar.chords) expect(chord.symbol.length).toBeGreaterThan(0);
			}
		}
	});
});
