import { describe, expect, it } from 'vitest';
import { formatChord } from '$lib/music/chord';
import { formatPitch, parseNote, pitchClass } from '$lib/music/note';
import {
	RECIPE_IDS,
	cook,
	gaps,
	isPlain,
	rootTier,
	rootsFor,
	tonesOf,
	type RecipeId
} from './recipes';

const spell = (id: RecipeId, root: string) =>
	tonesOf(cook(id, root)).map((tone) => formatPitch(tone.note));

describe('recipes', () => {
	it('measures every recipe in keys, the same on every root', () => {
		const expected: Record<RecipeId, number[]> = {
			major: [4, 3],
			minor: [3, 4],
			diminished: [3, 3],
			augmented: [4, 4],
			sus2: [2, 5],
			sus4: [5, 2],
			major7: [4, 3, 4],
			dominant7: [4, 3, 3],
			minor7: [3, 4, 3],
			halfDiminished: [3, 3, 4],
			diminished7: [3, 3, 3]
		};
		for (const id of RECIPE_IDS) {
			for (const root of rootsFor(id)) {
				expect(gaps(tonesOf(cook(id, root))), `${id} on ${formatPitch(root)}`).toEqual(
					expected[id]
				);
			}
		}
	});

	it('spells each chord as a chart would', () => {
		expect(spell('major', 'E')).toEqual(['E', 'G#', 'B']);
		expect(spell('minor', 'C')).toEqual(['C', 'Eb', 'G']);
		expect(spell('dominant7', 'Bb')).toEqual(['Bb', 'D', 'F', 'Ab']);
		expect(spell('halfDiminished', 'B')).toEqual(['B', 'D', 'F', 'A']);
		expect(spell('diminished7', 'C#')).toEqual(['C#', 'E', 'G', 'Bb']);
	});

	it('names the degrees from the root', () => {
		const degrees = (id: RecipeId) => tonesOf(cook(id, 'C')).map((tone) => tone.degree);
		expect(degrees('major')).toEqual(['1', '3', '5']);
		expect(degrees('minor')).toEqual(['1', '♭3', '5']);
		expect(degrees('dominant7')).toEqual(['1', '3', '5', '♭7']);
		expect(degrees('diminished7')).toEqual(['1', '♭3', '♭5', '♭♭7']);
	});

	it('keeps the root in the octave it was given', () => {
		const tones = tonesOf(cook('major7', parseNote('B', 3)));
		expect(tones.map((tone) => tone.note.octave)).toEqual([3, 4, 4, 4]);
		expect(tones.map((tone) => tone.offset)).toEqual([0, 4, 7, 11]);
	});

	it('serves every recipe only on roots whose spelling stays plain', () => {
		for (const id of RECIPE_IDS) {
			const roots = rootsFor(id);
			expect(new Set(roots.map(pitchClass)).size).toBe(roots.length);
			for (const root of roots) {
				expect(tonesOf(cook(id, root)).every((tone) => isPlain(tone.note))).toBe(true);
			}
		}
	});

	it('prefers the spelling the chord is usually written in', () => {
		const names = (id: RecipeId) => rootsFor(id).map((root) => formatPitch(root));
		expect(names('major')).toEqual([
			'C',
			'Db',
			'D',
			'Eb',
			'E',
			'F',
			'F#',
			'G',
			'Ab',
			'A',
			'Bb',
			'B'
		]);
		expect(names('minor')).toEqual([
			'C',
			'C#',
			'D',
			'Eb',
			'E',
			'F',
			'F#',
			'G',
			'G#',
			'A',
			'Bb',
			'B'
		]);
		// D°7 needs a C♭ however D is written, so it is never served.
		expect(names('diminished7')).not.toContain('D');
		// E♭ minor is usual; E♭ diminished needs B𝄫, so it becomes D♯.
		expect(names('diminished')).toContain('D#');
	});

	it('names each recipe with the symbol charts use', () => {
		expect(formatChord(cook('diminished', 'B'), true)).toBe('B°');
		expect(formatChord(cook('augmented', 'C'), true)).toBe('C+');
		expect(formatChord(cook('halfDiminished', 'B'), true)).toBe('Bø7');
		expect(formatChord(cook('major7', 'F'), true)).toBe('F∆');
	});

	it('ranks roots from all white keys to a black-key root', () => {
		expect(rootTier('major', parseNote('C', 3))).toBe(0);
		expect(rootTier('major', parseNote('D', 3))).toBe(1);
		expect(rootTier('major', parseNote('Eb', 3))).toBe(2);
		expect(rootTier('minor', parseNote('A', 3))).toBe(0);
	});
});
