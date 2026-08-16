import { describe, expect, it } from 'vitest';
import { analyse } from './analyse';
import { parseChord } from './chord';
import { parseKey } from './key';
import { formatNote } from './note';
import { scaleNotes } from './scales';
import { formatStudyKey, studyProgression, type ScaleSuggestion } from './study';

const notesOf = (suggestion: ScaleSuggestion) =>
	scaleNotes(suggestion.root, suggestion.scale).map((note) => formatNote(note));

describe('harmonic study context', () => {
	it('treats the major dominant in a minor key as functional harmony', () => {
		const [study] = studyProgression([parseChord('A7')], parseKey('Dm'));

		expect(study.roman).toBe('V7');
		expect(study.category).toBe('minor-dominant');
		expect(study.annotation).toBe('Harmonic minor');
		expect(study.scales.map((scale) => scale.name)).toEqual([
			'D harmonic minor',
			'A Phrygian dominant'
		]);
	});

	it('ranks direct keys and also includes useful secondary functions', () => {
		const [study] = studyProgression([parseChord('A7')], parseKey('C'));
		const contexts = study.compatibleKeys.map((context) => [
			formatStudyKey(context.key),
			context.roman,
			context.category
		]);

		expect(contexts).toContainEqual(['D major', 'V7', 'diatonic']);
		expect(contexts).toContainEqual(['D minor', 'V7', 'minor-dominant']);
		expect(contexts).toContainEqual(['C major', 'V7/ii', 'secondary-dominant']);
	});

	it('offers the parent key and chord-root mode for a diatonic chord', () => {
		const [study] = studyProgression([parseChord('Dm7')], parseKey('C'));

		expect(study.scales.map((scale) => scale.name)).toEqual(['C major', 'D Dorian']);
		expect(study.annotation).toBe('In key');
	});

	/*
	 * Every suggestion has to be drawable, not only sayable. The names alone
	 * were all this returned until the study panel started putting the scales
	 * on a keyboard, and a name is not something a diagram can be built from.
	 */
	describe('each suggestion carries the scale itself', () => {
		it('hands back the notes the name describes', () => {
			const [study] = studyProgression([parseChord('Dm7')], parseKey('C'));

			expect(notesOf(study.scales[0])).toEqual(['C', 'D', 'E', 'F', 'G', 'A', 'B']);
			expect(notesOf(study.scales[1])).toEqual(['D', 'E', 'F', 'G', 'A', 'B', 'C']);
		});

		it('names the parent key as a key and still spells it as a scale', () => {
			// "B♭ major", not "B♭ Ionian" — but the same seven notes either way.
			const [study] = studyProgression([parseChord('Cm7')], parseKey('Bb'));

			expect(study.scales[0].name).toBe('B♭ major');
			expect(notesOf(study.scales[0])).toEqual(['Bb', 'C', 'D', 'Eb', 'F', 'G', 'A']);
		});

		it('roots an altered scale on the chord and its parent a semitone up', () => {
			const [study] = studyProgression([parseChord('G7b9')], parseKey('C'));
			const altered = study.scales.find((scale) => scale.name.endsWith('altered'));
			const parent = study.scales.find((scale) => scale.name.endsWith('melodic minor'));

			expect(altered && notesOf(altered)).toEqual(['G', 'Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F']);
			expect(parent && notesOf(parent)).toEqual(['Ab', 'Bb', 'Cb', 'Db', 'Eb', 'F', 'G']);
		});

		it('gives every suggestion a scale that starts where it says it does', () => {
			const studies = studyProgression(
				['Cmaj7', 'A7b9', 'Dm7', 'G7', 'Bm7b5', 'Bb7', 'Caug', 'C#dim7', 'F7'].map(parseChord),
				parseKey('C')
			);

			for (const study of studies) {
				expect(study.scales.length).toBeGreaterThan(0);
				for (const suggestion of study.scales) {
					const notes = notesOf(suggestion);
					expect(notes.length).toBeGreaterThanOrEqual(5);
					// The name always opens with the root the scale is built on.
					expect(suggestion.name.startsWith(formatNote(suggestion.root, { unicode: true }))).toBe(
						true
					);
				}
			}
		});
	});

	it('marks the exact chord where a new key centre becomes established', () => {
		const studies = studyProgression(['Dm7', 'G7', 'Cmaj7'].map(parseChord), parseKey('F'));

		expect(studies[0].modulation).toBeDefined();
		expect(studies[0].annotation).toBe(String.fromCharCode(0x2192) + ' C major');
		expect(formatStudyKey(studies[2].key)).toBe('C major');
	});

	it('keeps diatonic minor chords in their functional families', () => {
		const result = analyse(['Cm7', 'Fm7', 'G7'].map(parseChord), parseKey('Cm'));

		expect(result.map((entry) => entry.role)).toEqual(['tonic', 'subdominant', 'dominant']);
	});

	it('distinguishes the blues IV from a tritone substitute', () => {
		const studies = studyProgression(['C7', 'F7', 'C7'].map(parseChord), parseKey('C'));

		expect(studies[1].category).toBe('blues-dominant');
		expect(studies[1].roman).toBe('IV7');
		expect(studies[1].scales.map((scale) => scale.name)).toContain('C blues');
	});

	it('keeps a blues ii-V into IV7 as tonicization, not modulation', () => {
		const studies = studyProgression(['Gm7', 'C7', 'F7'].map(parseChord), parseKey('C'));

		expect(studies.map((study) => formatStudyKey(study.key))).toEqual([
			'C major',
			'C major',
			'C major'
		]);
		expect(studies.map((study) => study.roman)).toEqual(['v7', 'V7/IV', 'IV7']);
	});
});
