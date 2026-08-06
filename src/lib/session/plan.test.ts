import { describe, expect, it } from 'vitest';
import type { BlockType, CardDirection } from '$lib/server/db/schema';
import { initialState, type Schedulable } from '$lib/srs/scheduler';
import {
	blockDurations,
	chooseKey,
	coldestKeys,
	isFinished,
	planSession,
	plannedSeconds,
	resumeIndex,
	type SessionPlan
} from './plan';

const NOW = new Date('2026-02-10T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

const card = (
	id: string,
	direction: CardDirection,
	keyCenter: string,
	dueDaysAgo = 1,
	skillCode = 'L1'
): Schedulable => ({
	cardId: id,
	direction,
	keyCenter,
	skillCode,
	state: {
		...initialState(NOW),
		state: 'review',
		reps: 3,
		dueAt: new Date(NOW.getTime() - dueDaysAgo * DAY)
	}
});

/** A pile of due cards spread across keys and directions. */
function deck(): Schedulable[] {
	const directions: CardDirection[] = ['hear_name', 'hear_play', 'see_play', 'play_name'];
	const out: Schedulable[] = [];
	for (const key of KEYS) {
		for (const direction of directions) {
			for (let i = 0; i < 6; i++) {
				out.push(card(`${key}-${direction}-${i}`, direction, key, 1 + (i % 5)));
			}
		}
	}
	return out;
}

/**
 * Review counts for every key. Anything left out would default to zero and
 * silently become the coldest key, which is how the first version of these
 * tests fooled itself.
 */
const reviews = (entries: Record<string, number>) =>
	new Map(KEYS.map((k) => [k, entries[k] ?? 0]));

describe('block shape', () => {
	it('matches the brief exactly at twenty minutes', () => {
		const seconds = blockDurations(20);
		expect(seconds).toEqual([180, 180, 240, 300, 300, 30]);
	});

	it('keeps the same proportions at other lengths', () => {
		for (const length of [10, 20, 35] as const) {
			const seconds = blockDurations(length);
			expect(seconds).toHaveLength(6);
			expect(seconds.every((s) => s > 0)).toBe(true);
		}
	});

	it('never drops a block to fit a short session', () => {
		// A session that quietly loses its capture block stops producing the data
		// the rest of the app runs on.
		const plan = planSession({
			lengthMinutes: 10,
			cards: deck(),
			reviewsByKey: reviews({}),
			allKeys: KEYS,
			now: NOW
		});
		const types = plan.blocks.map((b) => b.type);
		expect(types).toEqual([
			'wheel_warmup',
			'name_what_you_play',
			'ear_drill',
			'new_atom',
			'apply',
			'log'
		] satisfies BlockType[]);
	});

	it('adds up to roughly the requested length', () => {
		for (const length of [10, 20, 35] as const) {
			const plan = planSession({
				lengthMinutes: length,
				cards: deck(),
				reviewsByKey: reviews({}),
				allKeys: KEYS,
				now: NOW
			});
			const minutes = plannedSeconds(plan) / 60;
			expect(Math.abs(minutes - length), `${length} minutes`).toBeLessThan(1.5);
		}
	});
});

describe('choosing the key', () => {
	it('picks from the least practised', () => {
		const history = reviews({
			C: 500, G: 400, F: 380, D: 300, A: 250, E: 200,
			Bb: 180, Eb: 150, Db: 120, Ab: 3, B: 1, Gb: 2
		});
		expect(['B', 'Gb', 'Ab', 'Db']).toContain(chooseKey(history, KEYS, NOW));
	});

	it('never settles on a comfortable key', () => {
		const history = reviews({ C: 900, G: 800, F: 700, Bb: 600 });
		const chosen = new Set<string>();
		for (let day = 0; day < 14; day++) {
			chosen.add(chooseKey(history, KEYS, new Date(NOW.getTime() + day * DAY)));
		}
		expect(chosen.has('C')).toBe(false);
		expect(chosen.has('G')).toBe(false);
	});

	it('moves between sessions rather than repeating', () => {
		const history = reviews({ C: 100, G: 90 });
		const days = Array.from({ length: 4 }, (_, d) =>
			chooseKey(history, KEYS, new Date(NOW.getTime() + d * DAY))
		);
		expect(new Set(days).size).toBeGreaterThan(1);
	});

	it('is stable within a day, so resuming does not change key', () => {
		const history = reviews({ C: 100 });
		const morning = chooseKey(history, KEYS, new Date('2026-02-10T08:00:00Z'));
		const evening = chooseKey(history, KEYS, new Date('2026-02-10T22:00:00Z'));
		expect(morning).toBe(evening);
	});

	it('copes with no history and no keys', () => {
		expect(chooseKey(new Map(), KEYS, NOW)).toBeTruthy();
		expect(chooseKey(new Map(), [], NOW)).toBe('C');
	});
});

describe('cold keys', () => {
	it('reports the four least practised', () => {
		const cold = coldestKeys(
			reviews({
				C: 90, G: 80, D: 70, F: 65, Bb: 60, Eb: 55,
				Ab: 50, Db: 45, Gb: 40, A: 5, E: 3, B: 1
			}),
			KEYS
		);
		expect(cold).toHaveLength(4);
		expect(cold.slice(0, 3)).toEqual(['B', 'E', 'A']);
		expect(cold).not.toContain('C');
	});
});

describe('filling the blocks', () => {
	const plan = planSession({
		lengthMinutes: 20,
		cards: deck(),
		reviewsByKey: reviews({ C: 400, G: 300, Gb: 1, B: 0 }),
		allKeys: KEYS,
		atomId: 'L4',
		now: NOW
	});

	const block = (type: BlockType) => plan.blocks.find((b) => b.type === type)!;

	it('gives the drill blocks cards and the rest none', () => {
		expect(block('ear_drill').cardIds.length).toBeGreaterThan(0);
		expect(block('wheel_warmup').cardIds.length).toBeGreaterThan(0);
		expect(block('name_what_you_play').cardIds.length).toBeGreaterThan(0);
		expect(block('new_atom').cardIds).toEqual([]);
		expect(block('apply').cardIds).toEqual([]);
		expect(block('log').cardIds).toEqual([]);
	});

	it('never asks the same card twice in one sitting', () => {
		const all = plan.blocks.flatMap((b) => b.cardIds);
		expect(new Set(all).size).toBe(all.length);
	});

	it('sizes each queue to the time available', () => {
		// Four minutes of ear drill at roughly twelve seconds a card.
		expect(block('ear_drill').cardIds.length).toBeGreaterThanOrEqual(10);
		expect(block('ear_drill').cardIds.length).toBeLessThanOrEqual(30);
	});

	it('never picks a key the warm-up has no material for', () => {
		// Minor key centres exist only because the minor ii-V generates them; the
		// key-anchoring skills are major only.
		const mixed = [
			...KEYS.map((k) => card(`major-${k}`, 'see_play', k, 3, 'L1')),
			...['Cm', 'Fm', 'Gm'].map((k) => card(`minor-${k}`, 'see_play', k, 40, 'L4b'))
		];
		const planned = planSession({
			lengthMinutes: 20,
			cards: mixed,
			reviewsByKey: reviews({}),
			allKeys: [...KEYS, 'Cm', 'Fm', 'Gm'],
			now: NOW
		});
		expect(KEYS).toContain(planned.keyCenter);
	});

	it('gives the warm-up material that matches what it tells you to do', () => {
		// It says "scale in the right hand, the seven diatonic sevenths
		// underneath", so it must not hand over a ii-V-i.
		const mixed = [
			...deck(),
			card('twofive', 'see_play', 'C', 9, 'L4'),
			card('modes', 'see_play', 'C', 9, 'L6')
		];
		const withOther = planSession({
			lengthMinutes: 20,
			cards: mixed,
			reviewsByKey: reviews({}),
			allKeys: KEYS,
			now: NOW
		});
		const warmup = withOther.blocks.find((b) => b.type === 'wheel_warmup')!;
		expect(warmup.cardIds).not.toContain('twofive');
		expect(warmup.cardIds).not.toContain('modes');
		expect(warmup.cardIds.length).toBeGreaterThan(0);
	});

	it('asks each block only the directions it can actually pose', () => {
		const deckById = new Map(deck().map((c) => [c.cardId, c]));
		const directionsIn = (type: BlockType) =>
			new Set(block(type).cardIds.map((id) => deckById.get(id)!.direction));

		expect([...directionsIn('ear_drill')].every((d) => d === 'hear_name' || d === 'hear_play')).toBe(
			true
		);
		expect([...directionsIn('wheel_warmup')]).toEqual(['see_play']);
		expect([...directionsIn('name_what_you_play')]).toEqual(['play_name']);
	});

	it('puts today’s key at the front of each queue', () => {
		const deckById = new Map(deck().map((c) => [c.cardId, c]));
		const first = block('ear_drill').cardIds[0];
		expect(deckById.get(first)!.keyCenter).toBe(plan.keyCenter);
	});

	it('carries the new atom and the cold keys', () => {
		expect(plan.atomId).toBe('L4');
		expect(plan.coldKeys).toHaveLength(4);
	});

	it('plans a session even with nothing due', () => {
		const empty = planSession({
			lengthMinutes: 20,
			cards: [],
			reviewsByKey: new Map(),
			allKeys: KEYS,
			now: NOW
		});
		expect(empty.blocks).toHaveLength(6);
		expect(empty.blocks.every((b) => b.cardIds.length === 0)).toBe(true);
	});

	it('gives every block something to say', () => {
		for (const b of plan.blocks) {
			expect(b.title.length, b.type).toBeGreaterThan(2);
			expect(b.instruction.length, b.type).toBeGreaterThan(20);
		}
	});
});

describe('resuming', () => {
	const plan: SessionPlan = planSession({
		lengthMinutes: 20,
		cards: deck(),
		reviewsByKey: new Map(),
		allKeys: KEYS,
		now: NOW
	});

	it('starts at the beginning when nothing is done', () => {
		expect(resumeIndex(plan, [])).toBe(0);
		expect(isFinished(plan, [])).toBe(false);
	});

	it('picks up at the first block with no result', () => {
		expect(resumeIndex(plan, ['wheel_warmup', 'name_what_you_play'])).toBe(2);
	});

	it('knows when a session is over', () => {
		const all = plan.blocks.map((b) => b.type);
		expect(resumeIndex(plan, all)).toBe(6);
		expect(isFinished(plan, all)).toBe(true);
	});

	it('does not care what order blocks were finished in', () => {
		expect(resumeIndex(plan, ['ear_drill', 'wheel_warmup'])).toBe(1);
	});
});
