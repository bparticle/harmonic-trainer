import { describe, expect, it } from 'vitest';
import { analyse } from './analyse';
import { parseChord } from './chord';
import { parseKey } from './key';
import { formatStudyKey, studyProgression } from './study';

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
