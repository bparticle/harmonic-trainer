import { describe, expect, it } from 'vitest';
import {
	FIRST_POSITION,
	RUNGS,
	STAGES,
	directionsForItem,
	directionsForRung,
	itemsForRung,
	ladderIdentity,
	nextPosition,
	positionOf,
	reachedSoFar,
	stageByKey,
	type Position
} from './ladder';
import { parseKey, scale } from '$lib/music/key';
import { pitchClass } from '$lib/music/note';

describe('the order of keys', () => {
	it('starts at C with nothing to remember', () => {
		expect(STAGES[0].key).toBe('C');
		expect(STAGES[0].accidentals).toBe(0);
		expect(STAGES[0].relativeMinor).toBe('Am');
	});

	it('adds exactly one accidental at a time', () => {
		for (let i = 1; i < STAGES.length; i++) {
			const previous = Math.abs(STAGES[i - 1].accidentals);
			const current = Math.abs(STAGES[i].accidentals);
			expect(current - previous, `${STAGES[i - 1].key} → ${STAGES[i].key}`).toBeLessThanOrEqual(1);
		}
	});

	it('alternates sharp and flat sides', () => {
		// C, G, F, D, Bb, A, Eb… — the way keys have always been taught.
		expect(STAGES.slice(0, 7).map((s) => s.key)).toEqual(['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb']);
	});

	it('covers twelve keys, each once', () => {
		expect(STAGES).toHaveLength(12);
		expect(new Set(STAGES.map((s) => s.key)).size).toBe(12);
	});

	it('names the right relative minor for each', () => {
		for (const stage of STAGES) {
			const major = parseKey(stage.key);
			const minor = parseKey(stage.relativeMinor);
			const majorPcs = new Set(scale(major).map(pitchClass));
			const minorPcs = scale(minor).map(pitchClass);
			// Relative keys share all seven notes.
			for (const pc of minorPcs) {
				expect(majorPcs.has(pc), `${stage.key} / ${stage.relativeMinor}`).toBe(true);
			}
		}
	});

	it('states the accidentals in words for each key', () => {
		for (const stage of STAGES) expect(stage.note.length, stage.key).toBeGreaterThan(8);
	});
});

describe('the rungs', () => {
	it('starts with the scale and nothing else', () => {
		expect(RUNGS[0].id).toBe('scale');
		expect(itemsForRung('scale', STAGES[0])).toHaveLength(1);
	});

	it('builds up rather than jumping', () => {
		expect(RUNGS.map((r) => r.id)).toEqual([
			'scale',
			'tonic-triad',
			'primary-triads',
			'all-triads',
			'tonic-seventh',
			'all-sevenths',
			'relative-minor'
		]);
	});

	it('holds no chord progressions — those moved to their own section', () => {
		expect(RUNGS.some((r) => /progress|two|five|ii/i.test(r.id))).toBe(false);
	});

	it('explains itself without assuming anything', () => {
		for (const rung of RUNGS) {
			expect(rung.teaches.length, rung.id).toBeGreaterThan(30);
			expect(rung.instruction.length, rung.id).toBeGreaterThan(20);
		}
	});

	it('grows one idea at a time', () => {
		const counts = RUNGS.map((r) => itemsForRung(r.id, STAGES[0]).length);
		expect(counts[0]).toBe(1); // scale
		expect(counts[1]).toBe(1); // tonic triad
		expect(counts[2]).toBe(3); // I IV V
		expect(counts[3]).toBe(7); // all triads
	});
});

describe('what a rung asks in a key', () => {
	it('gives the right scale for C', () => {
		const [item] = itemsForRung('scale', STAGES[0]);
		expect(item.answerPitchClasses).toEqual([0, 2, 4, 5, 7, 9, 11]);
		expect(item.detail).toBe('C D E F G A B');
	});

	it('gives the right scale for the flat keys too', () => {
		const [item] = itemsForRung('scale', stageByKey('Eb')!);
		expect(item.detail).toBe('E♭ F G A♭ B♭ C D');
	});

	it('names the primary triads by degree', () => {
		const items = itemsForRung('primary-triads', STAGES[0]);
		expect(items.map((i) => i.label)).toEqual(['C', 'F', 'G']);
		expect(items.map((i) => i.degree)).toEqual(['I', 'IV', 'V']);
	});

	it('names all seven triads of C', () => {
		const items = itemsForRung('all-triads', STAGES[0]);
		expect(items.map((i) => i.label)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
	});

	it('names all seven sevenths of C', () => {
		const items = itemsForRung('all-sevenths', STAGES[0]);
		expect(items.map((i) => i.label)).toEqual([
			'Cmaj7',
			'Dm7',
			'Em7',
			'Fmaj7',
			'G7',
			'Am7',
			'Bm7b5'
		]);
	});

	it('gives the relative minor the same notes as its major', () => {
		const [scaleItem] = itemsForRung('relative-minor', STAGES[0]);
		expect([...scaleItem.answerPitchClasses].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
	});

	it('works in every key without throwing', () => {
		for (const stage of STAGES) {
			for (const rung of RUNGS) {
				expect(() => itemsForRung(rung.id, stage), `${rung.id} in ${stage.key}`).not.toThrow();
				expect(itemsForRung(rung.id, stage).length).toBeGreaterThan(0);
			}
		}
	});

	it('keeps every voicing playable', () => {
		for (const stage of STAGES) {
			for (const rung of RUNGS) {
				for (const item of itemsForRung(rung.id, stage)) {
					for (const note of item.answerVoicing ?? []) {
						expect(note, `${stage.key}/${rung.id}`).toBeGreaterThanOrEqual(21);
						expect(note).toBeLessThanOrEqual(108);
					}
				}
			}
		}
	});
});

describe('directions', () => {
	it('never asks you to name a scale', () => {
		// A scale has no chord shape to name, and a wrong answer to an impossible
		// question still counts against you.
		expect(directionsForRung('scale')).not.toContain('hear_name');
		expect(directionsForRung('scale')).not.toContain('play_name');
	});

	it('asks everything of a chord rung', () => {
		expect(directionsForRung('all-sevenths')).toHaveLength(5);
		expect(directionsForRung('all-sevenths')).toContain('degree_play');
	});

	it('never asks a scale which numeral it is', () => {
		// The same refusal as naming one, for the same reason: a scale is seven
		// notes and not a numbered chord.
		expect(directionsForRung('scale')).not.toContain('degree_play');
	});

	it('asks the relative minor for its numerals even though it holds a scale', () => {
		// The rung says yes and the scale inside it says no, which is the whole
		// reason the item gets a say: i, iv and v are degrees like any other.
		const [scale, tonic] = itemsForRung('relative-minor', STAGES[0]);
		expect(directionsForItem('relative-minor', scale)).not.toContain('degree_play');
		expect(directionsForItem('relative-minor', tonic)).toContain('degree_play');
		expect(tonic.degree).toBe('i');
	});

	it('asks a numeral of every item that carries one, and of no other', () => {
		for (const stage of STAGES) {
			for (const rung of RUNGS) {
				for (const item of itemsForRung(rung.id, stage)) {
					const asked = directionsForItem(rung.id, item).includes('degree_play');
					expect(asked, `${stage.key}/${rung.id}/${item.label}`).toBe(Boolean(item.degree));
				}
			}
		}
	});
});

describe('moving along', () => {
	it('starts at C, on the scale', () => {
		expect(FIRST_POSITION.stage.key).toBe('C');
		expect(FIRST_POSITION.rung.id).toBe('scale');
	});

	it('walks the rungs before changing key', () => {
		let position: Position | null = FIRST_POSITION;
		const seen: string[] = [];
		for (let i = 0; i < RUNGS.length && position; i++) {
			seen.push(`${position.stage.key}/${position.rung.id}`);
			position = nextPosition(position);
		}
		expect(seen.every((s) => s.startsWith('C/'))).toBe(true);
	});

	it('moves to the next key after the last rung', () => {
		const last = positionOf('C', 'relative-minor')!;
		const next = nextPosition(last)!;
		expect(next.stage.key).toBe('G');
		expect(next.rung.id).toBe('scale');
	});

	it('ends after the last rung of the last key', () => {
		const end = positionOf('Gb', 'relative-minor')!;
		expect(nextPosition(end)).toBeNull();
	});

	it('reports everything reached so far', () => {
		const reached = reachedSoFar(positionOf('G', 'primary-triads')!);
		// All of C, plus the first three rungs of G.
		expect(reached.filter((r) => r.key === 'C')).toHaveLength(RUNGS.length);
		expect(reached.filter((r) => r.key === 'G')).toHaveLength(3);
		expect(reached.some((r) => r.key === 'F')).toBe(false);
	});

	it('reports only the scale at the very beginning', () => {
		expect(reachedSoFar(FIRST_POSITION)).toEqual([{ key: 'C', rungId: 'scale' }]);
	});
});

describe('identity', () => {
	it('is stable, so regenerating matches existing cards', () => {
		const [item] = itemsForRung('tonic-triad', STAGES[0]);
		expect(ladderIdentity('C', 'tonic-triad', item, 'see_play')).toBe(
			ladderIdentity('C', 'tonic-triad', item, 'see_play')
		);
	});

	it('differs per key, rung and direction', () => {
		const [c] = itemsForRung('tonic-triad', STAGES[0]);
		const [g] = itemsForRung('tonic-triad', STAGES[1]);
		const ids = new Set([
			ladderIdentity('C', 'tonic-triad', c, 'see_play'),
			ladderIdentity('G', 'tonic-triad', g, 'see_play'),
			ladderIdentity('C', 'tonic-triad', c, 'hear_play')
		]);
		expect(ids.size).toBe(3);
	});
});
