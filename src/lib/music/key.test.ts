import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/golden.json';
import {
	BRIGHTNESS_ORDER,
	fifthsDistance,
	formatKey,
	key,
	keySignature,
	parseKey,
	relativeKey,
	scale
} from './key';
import { formatNote, parseNote, pitchClass } from './note';
import { formatDegree, scaleDegree, spell, spellChromatic } from './spell';

const names = (notes: ReturnType<typeof scale>) => notes.map((n) => formatNote(n));

describe('major scales', () => {
	const cases = Object.entries(golden.majorScales);

	it.each(cases)('%s major', (tonic, expected) => {
		expect(names(scale(key(tonic)))).toEqual(expected);
	});

	it('covers the enharmonic boundary keys', () => {
		expect(names(scale(key('Gb')))).toContain('Cb');
		expect(names(scale(key('F#')))).toContain('E#');
		expect(names(scale(key('C#')))).toContain('B#');
		expect(names(scale(key('Cb')))).toContain('Fb');
	});

	it('never repeats a letter within a scale', () => {
		for (const tonic of Object.keys(golden.majorScales)) {
			const letters = scale(key(tonic)).map((n) => n.letter);
			expect(new Set(letters).size, `${tonic} major`).toBe(7);
		}
	});
});

describe('natural minor scales', () => {
	const cases = Object.entries(golden.minorScales);

	it.each(cases)('%s', (name, expected) => {
		expect(names(scale(parseKey(name)))).toEqual(expected);
	});
});

describe('modes', () => {
	const cases = Object.entries(golden.modes);

	it.each(cases)('%s', (name, expected) => {
		expect(names(scale(parseKey(name)))).toEqual(expected);
	});

	it('orders modes brightest to darkest, each one flat further', () => {
		// Every step down the brightness axis lowers exactly one degree.
		for (let i = 1; i < BRIGHTNESS_ORDER.length; i++) {
			const brighter = scale(key('C', BRIGHTNESS_ORDER[i - 1]));
			const darker = scale(key('C', BRIGHTNESS_ORDER[i]));
			const differences = brighter.filter((n, j) => n.alter !== darker[j].alter);
			expect(differences, `${BRIGHTNESS_ORDER[i - 1]} → ${BRIGHTNESS_ORDER[i]}`).toHaveLength(1);
		}
	});
});

describe('key signatures', () => {
	const cases = Object.entries(golden.keySignatures);

	it.each(cases)('%s has signature %i', (name, expected) => {
		expect(keySignature(parseKey(name))).toBe(expected);
	});

	it('gives relative keys the same signature', () => {
		for (const tonic of ['C', 'G', 'D', 'F', 'Bb', 'Eb']) {
			const major = key(tonic);
			expect(keySignature(relativeKey(major))).toBe(keySignature(major));
		}
	});
});

describe('circle of fifths distance', () => {
	const cases = golden.fifthsDistance;

	it.each(cases)('$from to $to is $expect', ({ from, to, expect: expected }) => {
		expect(fifthsDistance(key(from), key(to))).toBe(expected);
	});

	it('is symmetric', () => {
		for (const a of ['C', 'Eb', 'B', 'F#']) {
			for (const b of ['C', 'A', 'Db', 'G']) {
				expect(fifthsDistance(key(a), key(b))).toBe(fifthsDistance(key(b), key(a)));
			}
		}
	});
});

describe('spelling resolver', () => {
	const cases = golden.spelling;

	it.each(cases)('$why', ({ pitchClass: pc, key: keyName, hint, expect: expected }) => {
		const context = parseKey(keyName);
		const resolved = spell(
			pc,
			context,
			hint ? { kind: 'interval', root: parseNote(hint.root), interval: hint.interval } : undefined
		);
		expect(formatNote(resolved)).toBe(expected);
		// Whatever it is called, it must still be the pitch class that was asked for.
		expect(pitchClass(resolved)).toBe(pc);
	});

	it('always returns the pitch class it was given, in every key', () => {
		for (const tonic of Object.keys(golden.majorScales)) {
			for (let pc = 0; pc < 12; pc++) {
				expect(pitchClass(spell(pc, key(tonic)))).toBe(pc);
			}
		}
	});

	it('prefers naturals over accidentals when spelling chromatically', () => {
		expect(formatNote(spellChromatic(0, 'sharp'))).toBe('C');
		expect(formatNote(spellChromatic(4, 'flat'))).toBe('E');
		expect(formatNote(spellChromatic(1, 'sharp'))).toBe('C#');
		expect(formatNote(spellChromatic(1, 'flat'))).toBe('Db');
	});
});

describe('scale degrees', () => {
	const cases = golden.scaleDegrees;

	it.each(cases)(
		'$note in $key is $expect',
		({ note: noteName, key: keyName, expect: expected }) => {
			expect(formatDegree(scaleDegree(parseNote(noteName), parseKey(keyName)))).toBe(expected);
		}
	);
});

describe('key naming', () => {
	it('round-trips through parse and format', () => {
		for (const name of ['C', 'Eb', 'F#', 'Am', 'Ebm', 'C#m']) {
			expect(formatKey(parseKey(name))).toBe(name);
		}
	});

	it('reads modal key names', () => {
		expect(parseKey('D dorian')).toEqual(key('D', 'dorian'));
		expect(parseKey('Eb lydian')).toEqual(key('Eb', 'lydian'));
	});
});
