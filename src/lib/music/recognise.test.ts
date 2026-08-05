import { describe, expect, it } from 'vitest';
import golden from './__fixtures__/golden.json';
import { closeVoicing, diatonicSeventh, formatChord, invert, parseChord } from './chord';
import { parseKey } from './key';
import { midi } from './note';
import { recognise, type RecogniseContext } from './recognise';

type Fixture = {
	why: string;
	pitches: number[];
	key?: string;
	bass?: number;
	previousChord?: string;
	top?: string;
	above?: string[];
	contains?: string[];
	expectInterpretation?: string;
	expectEmpty?: boolean;
};

function contextFor(f: Fixture): RecogniseContext {
	return {
		key: f.key ? parseKey(f.key) : undefined,
		previousChord: f.previousChord ? parseChord(f.previousChord) : undefined,
		bass: f.bass
	};
}

describe('chord recognition', () => {
	const cases = golden.recognition as Fixture[];

	it.each(cases)('$why', (f) => {
		const results = recognise(f.pitches, contextFor(f));
		const symbols = results.map((c) => c.symbol);

		if (f.expectEmpty) {
			expect(results).toEqual([]);
			return;
		}

		expect(results.length, 'should produce candidates').toBeGreaterThan(0);

		if (f.top) {
			expect(symbols[0], `ranked: ${symbols.join(' > ')}`).toBe(f.top);
		}

		if (f.above) {
			for (const lower of f.above) {
				const topIndex = symbols.indexOf(f.top!);
				const lowerIndex = symbols.indexOf(lower);
				expect(lowerIndex, `${lower} should appear in: ${symbols.join(' > ')}`).toBeGreaterThan(-1);
				expect(topIndex, `${f.top} should outrank ${lower}: ${symbols.join(' > ')}`).toBeLessThan(
					lowerIndex
				);
			}
		}

		if (f.contains) {
			for (const symbol of f.contains) {
				expect(symbols, `ranked: ${symbols.join(' > ')}`).toContain(symbol);
			}
		}

		if (f.expectInterpretation) {
			expect(
				results.map((c) => c.interpretation),
				`ranked: ${symbols.join(' > ')}`
			).toContain(f.expectInterpretation);
		}
	});
});

describe('recognition invariants', () => {
	it('never returns a single answer without confidence and reasoning', () => {
		for (const c of recognise([48, 52, 55, 59])) {
			expect(c.confidence).toBeGreaterThan(0);
			expect(c.confidence).toBeLessThanOrEqual(1);
			expect(Array.isArray(c.reasoning)).toBe(true);
		}
	});

	it('returns candidates in descending confidence', () => {
		const confidences = recognise([52, 55, 58, 62]).map((c) => c.confidence);
		expect([...confidences].sort((a, b) => b - a)).toEqual(confidences);
	});

	it('explains every note it was given', () => {
		// A candidate must never claim a chord that omits a pitch actually played.
		const pitches = [50, 53, 57, 60];
		const played = new Set(pitches.map((p) => p % 12));
		for (const c of recognise(pitches)) {
			if (c.interpretation !== 'quartal' && c.interpretation !== 'upper-structure') {
				const chordPcs = new Set(
					closeVoicing(c.chord, 3).map((n) => ((midi(n) % 12) + 12) % 12)
				);
				for (const pc of played) {
					expect(chordPcs, `${c.symbol} should explain pitch class ${pc}`).toContain(pc);
				}
			}
		}
	});

	it('identifies every inversion of every diatonic seventh in C', () => {
		for (const symbol of ['Cmaj7', 'Dm7', 'Em7', 'Fmaj7', 'G7', 'Am7', 'Bm7b5']) {
			const c = parseChord(symbol);
			for (let inversion = 0; inversion <= 3; inversion++) {
				const voicing = invert(closeVoicing(c, 3), inversion);
				const results = recognise(voicing.map(midi), { key: parseKey('C') });
				expect(
					results.map((r) => r.symbol),
					`${symbol} inversion ${inversion}`
				).toContain(symbol);
			}
		}
	});

	it('ranks the played chord first for root-position diatonic sevenths in every key', () => {
		const keys = ['C', 'F', 'Bb', 'Eb', 'G', 'D', 'A', 'E'];
		for (const keyName of keys) {
			const k = parseKey(keyName);
			for (const degree of [1, 2, 4, 5, 6]) {
				const c = diatonicSeventh(k, degree);
				const results = recognise(closeVoicing(c, 3).map(midi), { key: k });
				expect(results[0]?.symbol, `${keyName} degree ${degree}`).toBe(formatChord(c));
			}
		}
	});
});
