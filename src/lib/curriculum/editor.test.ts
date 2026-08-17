import { describe, expect, it } from 'vitest';
import { key as makeKey } from '$lib/music/key';
import { realiseChart } from './charts';
import {
	draftSeed,
	draftVoicings,
	emptyGrid,
	gridToRows,
	looksLikeChart,
	parseIntoGrid,
	readChord,
	readGrid,
	type Grid
} from './editor';

const C = makeKey('C');

/** A grid from rows of bar text, the way the editor holds one. */
const grid = (rows: string[][]): Grid => rows.map((row) => row.map((text) => ({ text })));

describe('reading one chord', () => {
	it('says what the parser understood', () => {
		const reading = readChord('Dm7', C);
		expect(reading.read).toBe('Dm7');
		expect(reading.numeral).toBe('ii7');
		expect(reading.playback).toBe('Dm7');
		expect(reading.drift).toBe(false);
		expect(reading.problem).toBeNull();
	});

	it('echoes a notation variant back in the app’s own spelling', () => {
		// Not a loss — the same chord, written the way this app writes it. Showing
		// it is how you learn that ∆ was understood at all.
		expect(readChord('C∆7', C).read).toBe('Cmaj7');
		expect(readChord('Bø', C).read).toBe('Bm7b5');
		expect(readChord('C-7', C).read).toBe('Cm7');
	});

	it('catches the chord that used to fail silently', () => {
		// `alt` parses as a plain dominant and always did. The old importer had
		// nowhere to say so, and the songbook notes had to warn about it in prose.
		const reading = readChord('G7alt', C);
		expect(reading.read).toBe('G7');
		expect(reading.problem).toContain('alt');
	});

	it('refuses something that is not a chord', () => {
		const reading = readChord('Hm9', C);
		expect(reading.chord).toBeNull();
		expect(reading.problem).toContain('not a chord symbol');
	});

	it('carries a slash bass through storage and back', () => {
		const reading = readChord('C/E', C);
		expect(reading.numeral).toBe('I/3');
		expect(reading.playback).toBe('C/E');
		expect(reading.drift).toBe(false);
	});
});

describe('reading a grid', () => {
	it('numbers bars the way a player counts them', () => {
		const reading = readGrid(grid([['Dm7', 'G7'], ['Cmaj7']]), 'C');
		expect(reading.rows[0].map((b) => b.number)).toEqual([1, 2]);
		expect(reading.rows[1][0].number).toBe(3);
		expect(reading.bars).toBe(3);
	});

	it('stores what it showed', () => {
		const reading = readGrid(grid([['Dm7', 'G7', 'Cmaj7', 'Cmaj7']]), 'C');
		expect(gridToRows(reading)).toEqual([['ii7', 'V7', 'Imaj7', 'Imaj7']]);
		expect(reading.ok).toBe(true);
	});

	it('keeps two chords sharing a bar', () => {
		const reading = readGrid(grid([['Am7 D7', 'Dm7 G7']]), 'C');
		expect(gridToRows(reading)).toEqual([['vi7 II7', 'ii7 V7']]);
	});

	it('drops trailing empty bars without complaining', () => {
		const reading = readGrid(grid([['C', 'F', '', '']]), 'C');
		expect(gridToRows(reading)).toEqual([['I', 'IV']]);
		expect(reading.problems).toEqual([]);
		expect(reading.ok).toBe(true);
	});

	it('reports a gap in the middle, which used to shorten a form silently', () => {
		const reading = readGrid(grid([['C', '', 'G', 'C']]), 'C');
		expect(reading.problems[0]).toContain('Row 1, bar 2 is empty');
		expect(reading.ok).toBe(false);
	});

	it('refuses more chords than a bar can hold', () => {
		const reading = readGrid(grid([['C F G Am Dm']]), 'C');
		expect(reading.problems[0]).toContain('5 chords in one bar');
		expect(reading.ok).toBe(false);
	});

	it('will not call a chart safe when a bar is unreadable', () => {
		const reading = readGrid(grid([['C', 'Hm9']]), 'C');
		expect(reading.ok).toBe(false);
		expect(reading.problems.join(' ')).toContain('Bar 2');
	});

	it('is empty rather than ok when nothing has been typed', () => {
		expect(readGrid(emptyGrid(), 'C').ok).toBe(false);
		expect(readGrid(emptyGrid(), 'C').bars).toBe(0);
	});

	it('reads the same tune in another key to the same numerals', () => {
		// The whole point of storing numerals: one typing buys twelve keys.
		const inC = readGrid(grid([['Dm7', 'G7', 'Cmaj7']]), 'C');
		const inEb = readGrid(grid([['Fm7', 'Bb7', 'Ebmaj7']]), 'Eb');
		expect(gridToRows(inEb)).toEqual(gridToRows(inC));
	});
});

describe('what the editor hands on', () => {
	it('makes a seed that plays back as the chords that were typed', () => {
		const reading = readGrid(grid([['C/E', 'F', 'G/B', 'C']]), 'C');
		const symbols = realiseChart(draftSeed('Slashes', reading, 'major'), 'C')
			.rows.flat()
			.flatMap((bar) => bar.chords.map((c) => c.symbol));
		expect(symbols).toEqual(['C/E', 'F', 'G/B', 'C']);
	});

	it('gives one voicing per chord, in the order they are played', () => {
		const reading = readGrid(grid([['Dm7', 'G7 Cmaj7']]), 'C');
		expect(draftVoicings(reading)).toHaveLength(3);
	});
});

describe('pasting a chart in', () => {
	it('fills the grid from the pipe syntax', () => {
		const g = parseIntoGrid('| Dm7 | G7 | Cmaj7 |\n| Am7 D7 | Dm7 G7 |');
		expect(g[0].map((b) => b.text)).toEqual(['Dm7', 'G7', 'Cmaj7']);
		expect(g[1].map((b) => b.text)).toEqual(['Am7 D7', 'Dm7 G7']);
	});

	it('does not mind the outer bar lines being absent', () => {
		expect(parseIntoGrid('C | F | G')[0].map((b) => b.text)).toEqual(['C', 'F', 'G']);
	});

	it('drops repeat marks, as the importer always has', () => {
		expect(parseIntoGrid('| C : | F |')[0].map((b) => b.text)).toEqual(['C', 'F']);
	});

	it('falls back to a blank grid rather than nothing', () => {
		expect(parseIntoGrid('   ').length).toBeGreaterThan(0);
	});

	it('knows a paste from a chord', () => {
		expect(looksLikeChart('| C | F |')).toBe(true);
		expect(looksLikeChart('C\nF')).toBe(true);
		expect(looksLikeChart('Cmaj7')).toBe(false);
	});
});
