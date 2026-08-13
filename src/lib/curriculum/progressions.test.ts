import { describe, expect, it } from 'vitest';
import {
	PROGRESSIONS,
	chordFromNumeral,
	progressionById,
	progressionsAtLevel,
	realiseProgression
} from './progressions';
import { formatChord } from '$lib/music/chord';
import { key as makeKey, parseKey } from '$lib/music/key';
import { STAGES } from './ladder';

const symbolOf = (numeral: string, keyName: string) =>
	formatChord(chordFromNumeral(numeral, parseKey(keyName)));

describe('Roman numerals into chords', () => {
	it('reads the plain diatonic triads of C', () => {
		expect(['I', 'ii', 'iii', 'IV', 'V', 'vi'].map((n) => symbolOf(n, 'C'))).toEqual([
			'C',
			'Dm',
			'Em',
			'F',
			'G',
			'Am'
		]);
	});

	it('reads sevenths', () => {
		expect(symbolOf('ii7', 'C')).toBe('Dm7');
		expect(symbolOf('V7', 'C')).toBe('G7');
		expect(symbolOf('Imaj7', 'C')).toBe('Cmaj7');
	});

	it('reads half-diminished and diminished', () => {
		expect(symbolOf('iiø7', 'Am')).toBe('Bm7b5');
		expect(symbolOf('vii°', 'C')).toBe('Bdim');
	});

	it('reads the augmented triad and the augmented seventh', () => {
		// Charts write it +, the analysis writes it aug, and both have to come back
		// with the raised fifth still on them.
		expect(symbolOf('Iaug', 'C')).toBe('Caug');
		expect(symbolOf('IIIaug7', 'Ab')).toBe('Caug7');
		expect(symbolOf('III+7', 'Ab')).toBe('Caug7');
	});

	it('reads the upper extensions without losing the seventh underneath', () => {
		// A suffix it did not recognise used to fall through to a bare triad, so a
		// V13 came back as a major chord — the ninth gone and the seventh with it.
		expect(symbolOf('ii9', 'C')).toBe('Dm9');
		expect(symbolOf('V13', 'C')).toBe('G13');
		expect(symbolOf('Imaj9', 'C')).toBe('Cmaj9');
		expect(symbolOf('ii11', 'C')).toBe('Dm11');
	});

	it('keeps a half-diminished chord half-diminished', () => {
		// Written m7b5 by the analysis and ø7 by hand. Read as a plain seventh, the
		// ii of every minor ii–V quietly turned major-key.
		expect(symbolOf('viim7b5', 'C')).toBe('Bm7b5');
		expect(symbolOf('viiø7', 'C')).toBe('Bm7b5');
	});

	it('reads suspensions and alterations', () => {
		expect(symbolOf('Isus4', 'C')).toBe('Csus4');
		expect(symbolOf('I7sus4', 'C')).toBe('C7sus4');
		expect(symbolOf('V7b9', 'C')).toBe('G7b9');
		expect(symbolOf('V7#11', 'C')).toBe('G7#11');
	});

	it('takes a bare lowercase numeral to mean whatever the key makes it', () => {
		// vii in a major key is diminished; ii is not.
		expect(symbolOf('vii', 'C')).toBe('Bdim');
		expect(symbolOf('ii', 'C')).toBe('Dm');
	});

	it('reads chromatic roots', () => {
		expect(symbolOf('bVII7', 'C')).toBe('Bb7');
		expect(symbolOf('bII7', 'C')).toBe('Db7');
		expect(symbolOf('bVI', 'C')).toBe('Ab');
	});

	it('reads applied dominants as a fifth above their target', () => {
		expect(symbolOf('V7/vi', 'C')).toBe('E7');
		expect(symbolOf('V7/ii', 'C')).toBe('A7');
		expect(symbolOf('V7/V', 'C')).toBe('D7');
	});

	it('transposes: the same numeral is a different chord in each key', () => {
		expect(symbolOf('ii7', 'Eb')).toBe('Fm7');
		expect(symbolOf('V7', 'Eb')).toBe('Bb7');
		expect(symbolOf('bII7', 'Eb')).toBe('E7');
		expect(symbolOf('ii7', 'B')).toBe('C#m7');
	});

	it('raises with a sharp and lowers with a flat, keeping the letter', () => {
		// The numeral says which way the note moved; re-spelling through the key
		// threw that away and returned whichever accidental the key preferred.
		expect(symbolOf('#I', 'F')).toBe('F#');
		expect(symbolOf('bV7', 'C')).toBe('Gb7');
		expect(symbolOf('bVI7', 'C')).toBe('Ab7');
		expect(symbolOf('#iv°7', 'C')).toBe('F#dim7');
	});

	it('writes E rather than F♭, and F rather than E♯', () => {
		// Both are correct by letter arithmetic and neither is ever written.
		expect(symbolOf('bII7', 'Eb')).toBe('E7');
		expect(symbolOf('bV7', 'B')).toBe('F7');
		expect(symbolOf('#iv°7', 'B')).toBe('Fdim7');
	});

	it('reads minor numerals from the major scale, as charts are written', () => {
		// ♭VI in C minor is A♭, counted from C major. Counting it from aeolian —
		// which already has a flat sixth — flattened it a second time.
		expect(symbolOf('bVI7', 'C')).toBe('Ab7');
		expect(symbolOf('i7', 'C')).toBe('Cm7');
		expect(symbolOf('iv7', 'C')).toBe('Fm7');
	});

	it('refuses nonsense', () => {
		expect(() => chordFromNumeral('Q', makeKey('C'))).toThrow();
		expect(() => chordFromNumeral('', makeKey('C'))).toThrow();
	});
});

describe('the progression library', () => {
	it('has unique ids', () => {
		const ids = PROGRESSIONS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('starts easy', () => {
		const first = progressionsAtLevel(1);
		expect(first.length).toBeGreaterThanOrEqual(3);
		// Level one is triads only: no sevenths, no chromatic roots.
		for (const p of first) {
			for (const numeral of p.numerals) {
				expect(numeral, `${p.id}: ${numeral}`).not.toMatch(/7|b|#|\//);
			}
		}
	});

	it('gets harder in steps', () => {
		expect(progressionsAtLevel(3).some((p) => p.id === 'ii-V-I')).toBe(true);
		expect(progressionsAtLevel(5).some((p) => p.id === 'tritone-sub')).toBe(true);
	});

	it('describes each one and says what to listen for', () => {
		for (const p of PROGRESSIONS) {
			expect(p.describes.length, p.id).toBeGreaterThan(30);
			expect(p.listenFor.length, p.id).toBeGreaterThan(20);
		}
	});

	it('resolves in every key of the ladder without throwing', () => {
		for (const p of PROGRESSIONS) {
			for (const stage of STAGES) {
				const keyName = p.mode === 'minor' ? stage.relativeMinor : stage.key;
				expect(() => realiseProgression(p, keyName), `${p.id} in ${keyName}`).not.toThrow();
			}
		}
	});
});

describe('realising a progression', () => {
	it('steps through one chord at a time', () => {
		const realised = realiseProgression(progressionById('ii-V-I')!, 'C');
		expect(realised.steps.map((s) => s.symbol)).toEqual(['Dm7', 'G7', 'Cmaj7']);
		expect(realised.steps).toHaveLength(3);
	});

	it('gives each step its own notes and voicing', () => {
		const realised = realiseProgression(progressionById('I-IV-V-I')!, 'G');
		expect(realised.steps.map((s) => s.symbol)).toEqual(['G', 'C', 'D', 'G']);
		for (const step of realised.steps) {
			expect(step.pitchClasses).toHaveLength(3);
			expect(step.voicing).toHaveLength(3);
		}
	});

	it('gives a shell only where there is a seventh to shell', () => {
		const sevenths = realiseProgression(progressionById('ii-V-I')!, 'C');
		expect(sevenths.steps.every((s) => s.shell !== null)).toBe(true);

		const triads = realiseProgression(progressionById('I-IV-V-I')!, 'C');
		expect(triads.steps.every((s) => s.shell === null)).toBe(true);
	});

	it('handles the minor progressions in a minor key', () => {
		const realised = realiseProgression(progressionById('i-iv-v-i')!, 'Am');
		expect(realised.steps.map((s) => s.symbol)).toEqual(['Am', 'Dm', 'Em', 'Am']);
	});

	it('borrows a major third for the minor ii–V', () => {
		// Without it the cadence does not pull, which is the whole point.
		const realised = realiseProgression(progressionById('ii-V-i-minor')!, 'Am');
		expect(realised.steps.map((s) => s.symbol)).toEqual(['Bm7b5', 'E7', 'Am7']);
	});

	it('lays out twelve bars of blues', () => {
		const realised = realiseProgression(progressionById('blues-basic')!, 'F');
		expect(realised.steps).toHaveLength(12);
		expect(realised.steps[0].symbol).toBe('F7');
		expect(realised.steps[4].symbol).toBe('Bb7');
		expect(realised.steps[8].symbol).toBe('C7');
	});

	it('keeps every note on a real keyboard', () => {
		for (const p of PROGRESSIONS) {
			for (const stage of STAGES) {
				const keyName = p.mode === 'minor' ? stage.relativeMinor : stage.key;
				for (const step of realiseProgression(p, keyName).steps) {
					for (const note of [...step.voicing, ...(step.shell ?? [])]) {
						expect(note, `${p.id} ${keyName} ${step.symbol}`).toBeGreaterThanOrEqual(21);
						expect(note).toBeLessThanOrEqual(108);
					}
				}
			}
		}
	});
});
