import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/golden.json';
import { analyse, guideToneMotion, guideTones, romanNumeral } from './analyse';
import { diatonicSeventh, formatChord, parseChord } from './chord';
import { formatKey, parseKey } from './key';
import { formatNote, pitchClass } from './note';

describe('ii-V-I in all twelve major keys', () => {
	const cases = Object.entries(golden.iiVIMajor);

	it.each(cases)('%s', (keyName, expected) => {
		const k = parseKey(keyName);
		const built = [2, 5, 1].map((d) => formatChord(diatonicSeventh(k, d)));
		expect(built).toEqual(expected);
	});

	it.each(cases)('%s analyses as ii-V-I', (keyName, expected) => {
		const k = parseKey(keyName);
		const result = analyse(expected.map(parseChord), k);
		expect(result.map((a) => a.roman)).toEqual(['ii7', 'V7', 'Imaj7']);
	});
});

describe('ii-V-i in all twelve minor keys', () => {
	const cases = Object.entries(golden.iiVIMinor);

	it.each(cases)('%s', (keyName, expected) => {
		const k = parseKey(keyName);
		// The iiø and the i come from natural minor; the V borrows its major third
		// from harmonic minor, which is what makes the cadence pull.
		const iiHalfDim = formatChord(diatonicSeventh(k, 2));
		const tonic = formatChord(diatonicSeventh(k, 1));
		expect([iiHalfDim, tonic]).toEqual([expected[0], expected[2]]);

		const dominant = parseChord(expected[1]);
		expect(dominant.quality).toBe('dom');
		expect(pitchClass(dominant.root)).toBe(pitchClass(diatonicSeventh(k, 5).root));
	});
});

describe('guide tones', () => {
	const cases = golden.guideTones;

	it.each(cases)('$chord has third $third and seventh $seventh', ({ chord, third, seventh }) => {
		const tones = guideTones(parseChord(chord));
		expect(tones).not.toBeNull();
		expect(formatNote(tones!.third)).toBe(third);
		expect(formatNote(tones!.seventh)).toBe(seventh);
	});

	it('swaps the third and seventh between the ii and the V, in all twelve keys', () => {
		for (const [keyName, chords] of Object.entries(golden.iiVIMajor)) {
			const [ii, v, i] = chords.map(parseChord);

			const iiToV = guideToneMotion(ii, v);
			const seventhVoice = iiToV.find((m) => m.fromRole === 'seventh');
			const thirdVoice = iiToV.find((m) => m.fromRole === 'third');

			// The seventh of the ii falls a semitone and becomes the third of the V.
			expect(seventhVoice?.toRole, `${keyName}: ii seventh`).toBe('third');
			expect(seventhVoice?.semitones, `${keyName}: ii seventh moves`).toBe(-1);

			// The third of the ii does not move at all; it becomes the seventh of the V.
			expect(thirdVoice?.toRole, `${keyName}: ii third`).toBe('seventh');
			expect(thirdVoice?.semitones, `${keyName}: ii third moves`).toBe(0);

			// And the same swap happens again from the V to the I.
			const vToI = guideToneMotion(v, i);
			expect(vToI.find((m) => m.fromRole === 'seventh')?.semitones, `${keyName}: V seventh`).toBe(
				-1
			);
			expect(vToI.find((m) => m.fromRole === 'third')?.semitones, `${keyName}: V third`).toBe(0);
		}
	});

	it('has no guide tones for a chord without a third or seventh', () => {
		expect(guideTones(parseChord('Csus4'))).toBeNull();
		expect(guideTones(parseChord('C'))).toBeNull();
	});
});

describe('roman numerals', () => {
	const cases = golden.romanNumerals as Array<{
		why: string;
		key: string;
		chords: string[];
		expect: string[];
		categories?: string[];
	}>;

	it.each(cases)('$why', (f) => {
		const result = analyse(f.chords.map(parseChord), parseKey(f.key));
		expect(result.map((a) => a.roman)).toEqual(f.expect);
		if (f.categories) {
			expect(result.map((a) => a.category)).toEqual(f.categories);
		}
	});

	it('gives every analysis a human explanation', () => {
		const result = analyse(['Dm7', 'G7', 'Cmaj7'].map(parseChord), parseKey('C'));
		for (const a of result) {
			expect(a.explanation.length).toBeGreaterThan(10);
		}
	});

	it('transposes: the same numerals in every one of the twelve keys', () => {
		for (const keyName of Object.keys(golden.iiVIMajor)) {
			const k = parseKey(keyName);
			const chords = [2, 5, 1].map((d) => diatonicSeventh(k, d));
			expect(
				chords.map((c) => romanNumeral(c, k)),
				keyName
			).toEqual(['ii7', 'V7', 'Imaj7']);
		}
	});
});

describe('modulation and pivot chords', () => {
	const cases = golden.modulations as Array<{
		why: string;
		key: string;
		chords: string[];
		pivotIndex?: number;
		pivotFrom?: string;
		pivotTo?: string;
		pivotExpected?: boolean;
		toKey: string;
	}>;

	it.each(cases)('$why', (f) => {
		const result = analyse(f.chords.map(parseChord), parseKey(f.key));
		const last = result[result.length - 1];

		expect(formatKey(last.key), `ended in ${formatKey(last.key)}`).toBe(f.toKey);

		if (f.pivotIndex !== undefined) {
			const pivot = result[f.pivotIndex];
			expect(pivot.pivot, `chord ${f.pivotIndex} should be the pivot`).toBeDefined();
			if (f.pivotFrom) expect(pivot.pivot!.romanInFrom).toBe(f.pivotFrom);
			if (f.pivotTo) expect(pivot.pivot!.romanInTo).toBe(f.pivotTo);
		}

		if (f.pivotExpected === false) {
			// Keys this far apart share no diatonic chord, so claiming a pivot
			// would be inventing one.
			expect(result.some((a) => a.pivot)).toBe(false);
		}
	});

	it('does not mistake a secondary dominant for a modulation', () => {
		// E7 - Am7 inside C is V7/vi, not a move to A minor.
		const result = analyse(['Cmaj7', 'E7', 'Am7', 'Dm7', 'G7', 'Cmaj7'].map(parseChord), parseKey('C'));
		expect(result.every((a) => formatKey(a.key) === 'C')).toBe(true);
		expect(result[1].roman).toBe('V7/vi');
	});

	it('resolves the final chord to the tonic of the key it ends in', () => {
		const result = analyse(['Cmaj7', 'Am7', 'D7', 'Gmaj7'].map(parseChord), parseKey('C'));
		expect(result[3].roman).toBe('Imaj7');
		expect(formatKey(result[3].key)).toBe('G');
	});
});
