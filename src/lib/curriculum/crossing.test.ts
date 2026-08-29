import { describe, expect, it } from 'vitest';
import { formatKey, key as makeKey } from '$lib/music/key';
import { STAGES } from './ladder';
import {
	NEAR_RELATIONS,
	RELATION_ORDER,
	compareCrossings,
	crossingBetween,
	crossingsFrom,
	crossingsWithRelation,
	CADENCE_NAME,
	cadenceIn,
	curriculumKeys,
	describeCrossing,
	describePivots,
	diatonicSeventhNumerals,
	nearestCrossings,
	pivotChords,
	relationBetween,
	type Relation
} from './crossing';

const major = (tonic: string) => makeKey(tonic);
const minor = (tonic: string) => makeKey(tonic, 'aeolian');

const C = major('C');

describe('naming the relation between two keys', () => {
	it('names the four a musician has a word for', () => {
		expect(relationBetween(C, minor('A'))).toBe('relative');
		expect(relationBetween(C, major('G'))).toBe('dominant');
		expect(relationBetween(C, major('F'))).toBe('subdominant');
		expect(relationBetween(C, minor('C'))).toBe('parallel');
	});

	it('calls staying put home rather than a crossing', () => {
		expect(relationBetween(C, major('C'))).toBe('home');
	});

	/*
	 * The two traps, and both are one-line mistakes that would record a wrong
	 * answer against a right question.
	 */
	it('does not call the relative of the dominant the dominant', () => {
		// E minor carries one sharp, exactly as G major does. The mode has to be
		// part of the test or a different journey gets the same name.
		expect(relationBetween(C, minor('E'))).toBe('other');
	});

	it('does not call the flat mediant the parallel', () => {
		// E flat major is three flats from C major and so is C minor. The tonic is
		// what separates them.
		expect(relationBetween(C, major('Eb'))).toBe('other');
	});

	it('works from a minor key too', () => {
		expect(relationBetween(minor('A'), major('C'))).toBe('relative');
		expect(relationBetween(minor('A'), minor('E'))).toBe('dominant');
		expect(relationBetween(minor('A'), minor('D'))).toBe('subdominant');
		expect(relationBetween(minor('A'), major('A'))).toBe('parallel');
	});

	it('reciprocates: relative and parallel both ways, dominant against subdominant', () => {
		for (const stage of STAGES) {
			const M = major(stage.key);
			const m = minor(stage.relativeMinor.replace(/m$/, ''));
			expect(relationBetween(m, M)).toBe('relative');
			expect(relationBetween(M, m)).toBe('relative');
			expect(relationBetween(makeKey(stage.key, 'aeolian'), M)).toBe('parallel');
		}
		expect(relationBetween(major('G'), C)).toBe('subdominant');
		expect(relationBetween(major('F'), C)).toBe('dominant');
	});

	it('gives up rather than throwing on a mode it does not modulate between', () => {
		// These arrive from the scale explorer, never from the curriculum.
		expect(relationBetween(C, makeKey('D', 'dorian'))).toBe('other');
		expect(relationBetween(makeKey('C', 'harmonicMinor'), major('G'))).toBe('other');
	});
});

describe('the two distances, which are not the same number', () => {
	it('separates a signature that does not move from a tonic that does', () => {
		const relative = crossingBetween(C, minor('A'));
		expect(relative.shift).toBe(0);
		expect(relative.tonicDistance).toBe(3);
		expect(relative.shared).toHaveLength(7);
	});

	it('separates a tonic that does not move from a signature that does', () => {
		const parallel = crossingBetween(C, minor('C'));
		expect(parallel.shift).toBe(-3);
		expect(parallel.tonicDistance).toBe(0);
	});

	it('signs the shift: sharpwards positive, flatwards negative', () => {
		expect(crossingBetween(C, major('G')).shift).toBe(1);
		expect(crossingBetween(C, major('F')).shift).toBe(-1);
	});

	it('wraps the far side of the wheel rather than counting past six', () => {
		for (const to of curriculumKeys()) {
			const { shift } = crossingBetween(C, to);
			expect(Math.abs(shift), `C to ${formatKey(to)}`).toBeLessThanOrEqual(6);
		}
		expect(Math.abs(crossingBetween(C, major('Gb')).shift)).toBe(6);
	});

	it('never throws on any pair of keys the curriculum knows', () => {
		const keys = curriculumKeys();
		for (const from of keys) {
			for (const to of keys) {
				expect(() => crossingBetween(from, to)).not.toThrow();
			}
		}
	});
});

describe('pivot chords', () => {
	it('finds every chord where the two keys share all seven notes', () => {
		expect(pivotChords(C, minor('A'))).toHaveLength(7);
	});

	it('finds the three a fifth away, and names them in both keys', () => {
		const pivots = pivotChords(C, major('G'));
		expect(pivots).toHaveLength(3);
		const tonic = pivots.find((p) => p.symbol === 'Cmaj7');
		expect(tonic).toMatchObject({ romanInFrom: 'Imaj7', romanInTo: 'IVmaj7' });
	});

	it('finds none between a key and its parallel, which is the useful answer', () => {
		// C major and C minor build no diatonic seventh in common. A page that drew
		// an empty list here would be hiding the reason the move is hard.
		expect(pivotChords(C, minor('C'))).toEqual([]);
	});

	it('refuses a chord whose notes fit but which the target never builds', () => {
		// Every pivot has to be spelled the same chord on both sides, so a symbol
		// appearing in one list and not the other is the bug this guards.
		for (const to of curriculumKeys()) {
			for (const pivot of pivotChords(C, to)) {
				expect(pivot.romanInFrom, `${formatKey(to)}: ${pivot.symbol}`).not.toBe('');
				expect(pivot.romanInTo, `${formatKey(to)}: ${pivot.symbol}`).not.toBe('');
			}
		}
	});

	it('carries the notes and the root, so a drill can voice one', () => {
		const [first] = pivotChords(C, major('G'));
		expect(first.pitchClasses.length).toBeGreaterThanOrEqual(3);
		expect(first.pitchClasses).toContain(first.root);
	});

	it('writes the seven numerals down once, for the wheel and for here', () => {
		expect(diatonicSeventhNumerals('ionian')[4]).toBe('V7');
		expect(diatonicSeventhNumerals('aeolian')[0]).toBe('i7');
		// Anything that is not aeolian reads as major, which is what the wheel did.
		expect(diatonicSeventhNumerals('mixolydian')).toEqual(diatonicSeventhNumerals('ionian'));
	});
});

describe('ordering crossings near-first', () => {
	const out = crossingsFrom(C);

	it('leaves out home, because a crossing to where you are is not one', () => {
		expect(out).toHaveLength(curriculumKeys().length - 1);
		expect(out.some((crossing) => crossing.relation === 'home')).toBe(false);
	});

	it('puts the four named relations first, in the curriculum order', () => {
		expect(out.slice(0, 4).map((crossing) => formatKey(crossing.to))).toEqual([
			'Am',
			'G',
			'F',
			'Cm'
		]);
		expect(out.slice(0, 4).map((crossing) => crossing.relation)).toEqual(NEAR_RELATIONS);
	});

	/*
	 * The ordering bug this test exists for. Ranking the remainder by tonic
	 * distance puts F minor — three shared notes — ahead of D minor, which shares
	 * six and is the ii of the key you are standing in.
	 */
	it('ranks the unnamed ones by accidentals changed, not by tonic distance', () => {
		const at = (name: string) => out.findIndex((crossing) => formatKey(crossing.to) === name);
		expect(at('Dm')).toBeLessThan(at('Fm'));
		expect(at('Dm')).toBeLessThan(at('Gm'));
	});

	it('never gains shared notes as it goes further away', () => {
		const shared = out.map((crossing) => crossing.shared.length);
		for (let i = 1; i < shared.length; i++) {
			expect(shared[i], `position ${i} of ${formatKey(out[i].to)}`).toBeLessThanOrEqual(shared[0]);
		}
		// The tail of the list really is the far side of the wheel.
		expect(shared[shared.length - 1]).toBeLessThan(shared[0]);
	});

	it('is a total order, so two runs agree', () => {
		expect(crossingsFrom(C).map((c) => formatKey(c.to))).toEqual(out.map((c) => formatKey(c.to)));
		expect(compareCrossings(out[0], out[0])).toBe(0);
	});

	it('hands back only as many as were asked for', () => {
		expect(nearestCrossings(C, 2).map((c) => formatKey(c.to))).toEqual(['Am', 'G']);
	});

	it('filters to the relations a drill wants to ask about', () => {
		const near = crossingsWithRelation(C, NEAR_RELATIONS);
		expect(near).toHaveLength(4);
		expect(crossingsWithRelation(C, ['dominant'])).toHaveLength(1);
	});

	it('orders every key the same way, not just C', () => {
		for (const from of curriculumKeys()) {
			const first = crossingsFrom(from)[0];
			expect(first.relation, formatKey(from)).toBe('relative');
		}
	});
});

describe('the twenty-four keys', () => {
	it('is the ladder’s own list, so the spellings cannot drift', () => {
		const keys = curriculumKeys().map((k) => formatKey(k));
		expect(keys).toHaveLength(24);
		expect(keys).toContain('Gb');
		expect(keys).toContain('Ebm');
		for (const stage of STAGES) {
			expect(keys).toContain(stage.key);
			expect(keys).toContain(stage.relativeMinor);
		}
	});
});

describe('saying a crossing out loud', () => {
	it('describes the move and never names the destination', () => {
		for (const crossing of crossingsFrom(C)) {
			const said = describeCrossing(crossing);
			expect(said.length).toBeGreaterThan(0);
			expect(said, said).not.toContain(formatKey(crossing.to));
		}
	});

	it('says which way the accidentals went', () => {
		expect(describeCrossing(crossingBetween(C, major('D')))).toContain('sharpwards');
		expect(describeCrossing(crossingBetween(C, major('Bb')))).toContain('flatwards');
		// Six accidentals is a tie the circle-of-fifths wrap breaks sharpwards, but
		// the destination is spelled G♭ — the sentence has to agree with the label.
		expect(describeCrossing(crossingBetween(C, major('Gb')))).toContain('flatwards');
		expect(describeCrossing(crossingBetween(C, major('Gb')))).not.toContain('sharpwards');
		expect(describeCrossing(crossingBetween(C, minor('Eb')))).toContain('flatwards');
	});

	it('claims a mode only where the destination has one', () => {
		// D dorian shares C major's signature exactly. It is a real crossing with
		// nothing to say about major or minor.
		const modal = describeCrossing(crossingBetween(C, makeKey('D', 'dorian')));
		expect(modal).not.toContain('major');
		expect(modal).not.toContain('minor');
	});

	it('has a label for every relation, so a multiple choice can be built', () => {
		const relations: Relation[] = RELATION_ORDER;
		expect(new Set(relations).size).toBe(relations.length);
	});

	it('explains a pivot, and explains the absence of one', () => {
		expect(describePivots(crossingBetween(C, major('G')))).toContain('Cmaj7');
		expect(describePivots(crossingBetween(C, minor('C')))).toContain('nothing to pivot on');
	});
});

describe('the cadence that plants a key', () => {
	it('is three triads falling home, in every key', () => {
		for (const k of curriculumKeys()) {
			const cadence = cadenceIn(k);
			expect(
				cadence.map((chord) => chord.numeral),
				formatKey(k)
			).toEqual(['IV', 'V', 'I']);
			for (const chord of cadence) {
				expect(chord.pitchClasses, `${formatKey(k)} ${chord.symbol}`).toHaveLength(3);
				expect(chord.voicing).toHaveLength(3);
			}
		}
	});

	it('ends on the tonic, which is the answer the question wants', () => {
		const cadence = cadenceIn(major('C'));
		expect(cadence[2].symbol).toBe('C');
		expect(cadence[2].pitchClasses).toContain(0);
	});

	it('spells the far keys the way the key spells them', () => {
		// G flat major's fourth degree is C flat, not B. A cadence that said B
		// would be a different chord with the same sound and the wrong name.
		expect(cadenceIn(major('Gb'))[0].symbol).toBe('Cb');
		expect(cadenceIn(major('Eb')).map((c) => c.symbol)).toEqual(['Ab', 'Bb', 'Eb']);
	});

	it('works in minor, where the three chords are minor too', () => {
		expect(cadenceIn(minor('A')).map((c) => c.symbol)).toEqual(['Dm', 'Em', 'Am']);
	});

	it('never writes a double accidental, in any key', () => {
		for (const k of curriculumKeys()) {
			for (const chord of cadenceIn(k)) {
				expect(chord.symbol, formatKey(k)).not.toMatch(/bb|##/);
			}
		}
	});

	it('names itself once, for anything that has to print it', () => {
		expect(CADENCE_NAME).toContain('IV');
	});
});
