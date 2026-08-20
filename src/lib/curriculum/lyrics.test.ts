import { describe, expect, it } from 'vitest';
import {
	looksLikeChordSheet,
	parseChordSheet,
	sheetToLyrics,
	sheetToRows,
	splitLyric
} from './lyrics';

const mangoWalk = [
	'C7                 F',
	'My mother did a-tell me that you go mango walk',
	'C7                 F',
	'You go mango walk, you go mango walk'
].join('\n');

const linstead = [
	'[Verse]',
	'C                   F',
	'Mi carry mi ackee go a Linstead Market',
	'G                   C',
	'Not a quattie worth sell',
	'',
	'[Chorus]',
	'C         F',
	'Oh lord what a night, not a bite',
	'G               C',
	'What a Saturday night'
].join('\n');

describe('splitting a line under its chords', () => {
	it('gives the first chord everything up to the second', () => {
		expect(splitLyric('one two three four', [0, 8])).toEqual(['one two', 'three four']);
	});

	it('never cuts a word in half', () => {
		// The column lands inside "three"; the split goes to the word boundary.
		expect(splitLyric('one two three four', [0, 10])).toEqual(['one two', 'three four']);
		expect(splitLyric('one two three four', [0, 9])).toEqual(['one two', 'three four']);
	});

	it('gives the first chord the opening words even when it is indented', () => {
		// A sheet that indents the first chord is not saying the first word
		// belongs to nobody.
		expect(splitLyric('sing it now', [4, 9])).toEqual(['sing it', 'now']);
	});

	it('keeps the cuts in order, so a bar never steals from the one before it', () => {
		const parts = splitLyric('a b c d e f', [0, 6, 2, 8]);
		const rejoined = parts.join(' ').replace(/\s+/g, ' ').trim();
		expect(rejoined).toBe('a b c d e f');
	});

	it('hands back empty fragments rather than dropping bars', () => {
		expect(splitLyric('short', [0, 40, 60])).toHaveLength(3);
	});

	it('is lossless: every word survives somewhere', () => {
		const line = 'My mother did a-tell me that you go mango walk';
		const parts = splitLyric(line, [0, 19]);
		expect(parts.join(' ')).toBe(line);
	});

	it('copes with one chord over the whole line', () => {
		expect(splitLyric('all of it', [0])).toEqual(['all of it']);
	});
});

describe('reading a chord sheet', () => {
	it('turns each chord into a bar and each line into a row', () => {
		expect(sheetToRows(parseChordSheet(mangoWalk))).toEqual([
			['C7', 'F'],
			['C7', 'F']
		]);
	});

	it('puts the words under the bar they were written over', () => {
		const lyrics = sheetToLyrics(parseChordSheet(mangoWalk));
		expect(lyrics[0][0]).toContain('My mother');
		expect(lyrics[1]).toEqual(['You go mango walk,', 'you go mango walk']);
	});

	it('drops section labels, which the loop has no use for', () => {
		const sheet = parseChordSheet(linstead);
		expect(sheetToRows(sheet)).toEqual([
			['C', 'F'],
			['G', 'C'],
			['C', 'F'],
			['G', 'C']
		]);
		// The C sits at column 20, which is exactly where 'sell' starts, so that
		// is where the bar line goes. The split is the sheet's claim, not ours.
		expect(sheetToLyrics(sheet)[1]).toEqual(['Not a quattie worth', 'sell']);
	});

	it('reads a chord line with nothing under it as a plain row of bars', () => {
		const sheet = parseChordSheet('C  F\n\nG  C');
		expect(sheetToRows(sheet)).toEqual([
			['C', 'F'],
			['G', 'C']
		]);
		expect(sheet.hasLyrics).toBe(false);
	});

	it('does not read a lyric line as chords because it starts with one', () => {
		// "A" and "Am" are chords. "A man walks in" is not a bar of A.
		const sheet = parseChordSheet('C     G\nA man walks in the door');
		expect(sheetToRows(sheet)).toEqual([['C', 'G']]);
		expect(sheetToLyrics(sheet)[0][0]).toContain('A man');
	});

	it('never claims a lyric line twice', () => {
		const sheet = parseChordSheet(mangoWalk);
		const all = sheetToLyrics(sheet).flat().join(' ');
		expect(all.match(/My mother/g)).toHaveLength(1);
	});

	it('gives every row as many fragments as it has bars', () => {
		for (const text of [mangoWalk, linstead]) {
			for (const row of parseChordSheet(text).rows) {
				expect(row.lyrics).toHaveLength(row.bars.length);
			}
		}
	});

	it('finds nothing in text that is not a sheet', () => {
		expect(parseChordSheet('just some prose about a song').rows).toEqual([]);
	});
});

describe('telling a sheet from a grid', () => {
	it('knows the pipe grid is not a chord sheet', () => {
		expect(looksLikeChordSheet('| C | F |\n| G | C |')).toBe(false);
	});

	it('knows a sheet with words is', () => {
		expect(looksLikeChordSheet(mangoWalk)).toBe(true);
	});

	it('leaves a bare chord line to the grid parser, which already handles it', () => {
		expect(looksLikeChordSheet('C  F\nG  C')).toBe(false);
	});

	it('is not fooled by a single line', () => {
		expect(looksLikeChordSheet('Cmaj7')).toBe(false);
	});
});
