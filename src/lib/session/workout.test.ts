import { describe, expect, it } from 'vitest';
import type { CardDirection } from '$lib/server/db/schema';
import { initialState, type Schedulable } from '$lib/srs/scheduler';
import {
	cellsOf,
	FIRST_FRONTIER,
	frontierFromPosition,
	minorKeysReached,
	nextCell,
	nextOpening,
	type Frontier,
	type RungId
} from '$lib/curriculum/ladder';
import {
	cardsForProgression,
	cardsForReached,
	cardsForRung,
	CROSSING_SKILL
} from '$lib/curriculum/cards';
import { RUNGS, STAGES } from '$lib/curriculum/ladder';
import { PROGRESSIONS } from '$lib/curriculum/progressions';
import { MISSION_CHARTS, chartDemand } from '$lib/curriculum/charts';
import { ALL_RUNGS, vocabularyOf } from '$lib/curriculum/vocabulary';
import { describeGoal } from '$lib/practice/goal';
import { suggestLadder, type HeldRun } from '$lib/practice/tempo';
import {
	ASKED_DIRECTIONS,
	TASK_COUNT,
	chooseNovelty,
	coldSpotsFrom,
	coldestKeys,
	composeWorkout,
	dayNumber,
	earQueue,
	functionQueue,
	makeupOf,
	noveltyId,
	sightQueue,
	describeAcquaintance,
	type MissionChart,
	type Novelty,
	type Task,
	type Workout,
	type WorkoutInput,
	type WorkoutSize
} from './workout';

const NOW = new Date('2026-02-10T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** As far as a player with a few months on the ladder has got. */
const FAR = frontierFromPosition('Eb', 'all-sevenths')!;
const REACHED = cellsOf(FAR);
const REACHED_KEYS = [...new Set(REACHED.map((r) => r.key))];

const card = (
	id: string,
	direction: CardDirection,
	keyCenter: string,
	options: { dueInDays?: number; reps?: number; skillCode?: string } = {}
): Schedulable => ({
	cardId: id,
	direction,
	keyCenter,
	skillCode: options.skillCode ?? 'rung:all-sevenths',
	state: {
		...initialState(NOW),
		state: 'review',
		reps: options.reps ?? 3,
		dueAt: new Date(NOW.getTime() + (options.dueInDays ?? -1) * DAY)
	}
});

/**
 * A bank spread over every reached key and every direction.
 *
 * Including one key-centre card per key, because that is what an account
 * actually holds: `cardsForReached` makes one for every key the frontier has
 * opened, whatever depth it reaches there. A bank without them would leave the
 * crossing slot falling through to a mission and quietly test the fallthrough
 * instead of the thing under test.
 */
function bank(options: { dueInDays?: number; reps?: number } = {}): Schedulable[] {
	const directions: CardDirection[] = ['hear_name', 'hear_play', 'see_play', 'degree_play'];
	const out: Schedulable[] = [];
	for (const { key, rungId } of REACHED) {
		for (const direction of directions) {
			for (let i = 0; i < 3; i++) {
				out.push(
					card(`${key}-${rungId}-${direction}-${i}`, direction, key, {
						...options,
						skillCode: `rung:${rungId}`
					})
				);
			}
		}
	}
	for (const key of REACHED_KEYS) {
		out.push(card(`${key}-pivot`, 'pivot_play', key, { ...options, skillCode: CROSSING_SKILL }));
	}
	return out;
}

/**
 * Somebody who has met everything.
 *
 * The fixture that keeps every assertion below about the thing it is about.
 * Readiness has a suite of its own further down; a test asking whether a long
 * workout repeats a tune should not also be a test of the curriculum gate.
 */
const KNOWS_EVERYTHING = vocabularyOf({
	rungs: ALL_RUNGS,
	progressions: PROGRESSIONS.map((progression) => progression.id)
});

const input = (overrides: Partial<WorkoutInput> = {}): WorkoutInput => ({
	cards: bank(),
	reached: REACHED,
	nextCell: nextCell(FAR),
	vocabulary: KNOWS_EVERYTHING,
	now: NOW,
	...overrides
});

/**
 * One tune to set a mission on, so a tempo assertion is about the tempo.
 *
 * The record's rhythm changes: a bebop vehicle that goes at 160, which is the
 * whole reason a band has to be a share rather than an absolute.
 */
const ONE_TUNE: MissionChart = {
	slug: 'rhythm-changes',
	name: 'Rhythm changes',
	style: 'rhythm_changes',
	category: 'standard',
	mode: 'major',
	defaultBpm: 160,
	defaultGroove: 'swing',
	demand: chartDemand({
		grid: [['I6 vi7', 'ii7 V7', 'I7', 'IV7']],
		mode: 'major'
	})
};

/** A run that cleared the mission's bar at a given tempo. */
const held = (bpm: number): HeldRun => ({ bpm, voiced: 20, landed: 20, bestStreak: 12 });

const taskKinds = (workout: Workout) => workout.tasks.map((t) => t.kind);
const earCards = (workout: Workout) =>
	workout.tasks.flatMap((t) => (t.kind === 'ear' ? t.cardIds : []));
const functionCards = (workout: Workout) =>
	workout.tasks.flatMap((t) => (t.kind === 'function' ? t.cardIds : []));
const missions = (workout: Workout) =>
	workout.tasks.flatMap((t) => (t.kind === 'mission' ? [t.mission] : []));

describe('the shape of a workout', () => {
	it('counts tasks rather than minutes', () => {
		for (const size of ['short', 'standard', 'long'] as WorkoutSize[]) {
			const workout = composeWorkout(input({ size }));
			expect(workout.tasks, size).toHaveLength(TASK_COUNT[size]);
		}
	});

	it('is a standard workout when nobody said', () => {
		const workout = composeWorkout(input());
		expect(workout.size).toBe('standard');
		expect(workout.tasks).toHaveLength(4);
	});

	it('asks one of each kind at standard length', () => {
		const workout = composeWorkout(input({ size: 'standard' }));
		expect(new Set(taskKinds(workout))).toEqual(
			new Set(['ear', 'function', 'mission', 'new_thing'])
		);
	});

	it('adds a second mission at long, because the band asks what it can ask', () => {
		const workout = composeWorkout(input({ size: 'long' }));
		expect(missions(workout)).toHaveLength(2);
	});

	it('keeps the mission and the new thing on a short day', () => {
		for (let d = 0; d < 4; d++) {
			const workout = composeWorkout(
				input({ size: 'short', now: new Date(NOW.getTime() + d * DAY) })
			);
			expect(taskKinds(workout), `day ${d}`).toContain('mission');
			expect(taskKinds(workout), `day ${d}`).toContain('new_thing');
		}
	});

	it('alternates which drill question a short day drops', () => {
		const kinds = new Set<string>();
		for (let d = 0; d < 4; d++) {
			const workout = composeWorkout(
				input({ size: 'short', now: new Date(NOW.getTime() + d * DAY) })
			);
			for (const kind of taskKinds(workout))
				if (kind === 'ear' || kind === 'function') kinds.add(kind);
		}
		expect(kinds).toEqual(new Set(['ear', 'function']));
	});

	it('gives every task something to say and something to meet', () => {
		const workout = composeWorkout(input({ size: 'long' }));
		for (const task of workout.tasks) {
			expect(task.title.length, task.kind).toBeGreaterThan(2);
			expect(task.instruction.length, task.kind).toBeGreaterThan(20);
			expect(describeGoal(task.goal).length, task.kind).toBeGreaterThan(5);
		}
	});

	it('stamps the version the stored plan is read back by', () => {
		expect(composeWorkout(input()).version).toBe(2);
	});
});

describe('deciding itself, and deciding the same way twice', () => {
	it('composes the identical workout for the same date and the same state', () => {
		const first = composeWorkout(input({ size: 'long' }));
		const second = composeWorkout(input({ size: 'long' }));
		expect(second).toEqual(first);
	});

	it('does not change between the morning and the evening', () => {
		const morning = composeWorkout(input({ now: new Date('2026-02-10T07:30:00Z') }));
		const evening = composeWorkout(input({ now: new Date('2026-02-10T22:45:00Z') }));
		expect(evening).toEqual(morning);
	});

	it('produces a visibly different workout the next day', () => {
		const today = composeWorkout(input({ size: 'long' }));
		const tomorrow = composeWorkout(input({ size: 'long', now: new Date(NOW.getTime() + DAY) }));

		expect(earCards(tomorrow)).not.toEqual(earCards(today));
		expect(JSON.stringify(tomorrow.tasks)).not.toBe(JSON.stringify(today.tasks));
	});

	it('keeps moving across a fortnight rather than settling', () => {
		const seen = new Set<string>();
		for (let d = 0; d < 14; d++) {
			const workout = composeWorkout(input({ now: new Date(NOW.getTime() + d * DAY) }));
			seen.add(JSON.stringify(workout.tasks));
		}
		expect(seen.size).toBeGreaterThan(10);
	});

	it('takes its whole seed from the day number', () => {
		expect(dayNumber(new Date('2026-02-10T00:00:00Z'))).toBe(
			dayNumber(new Date('2026-02-10T23:59:59Z'))
		);
		expect(dayNumber(new Date('2026-02-11T00:00:00Z'))).toBe(
			dayNumber(new Date('2026-02-10T00:00:00Z')) + 1
		);
	});
});

describe('one bank, four queues, and nothing left out of all of them', () => {
	/*
	 * The invariant this milestone exists to restore.
	 *
	 * `cards.ts` generated `see_play` and `play_name` for every triad and every
	 * seventh, and no queue asked for either — so both accumulated in the bank
	 * with SRS rows that were permanently due and permanently unreachable. A pool
	 * is defined by what it takes, and nothing was ever defined by what was
	 * left over.
	 */
	it('asks every direction the curriculum can generate', () => {
		const everywhere = STAGES.flatMap((stage) =>
			RUNGS.map((rung) => ({ key: stage.key, rungId: rung.id }))
		);
		const generated = new Set(cardsForReached(everywhere).map((c) => c.direction));
		for (const progression of PROGRESSIONS) {
			for (const made of cardsForProgression(progression, 'C')) generated.add(made.direction);
		}

		expect(generated.size).toBeGreaterThan(0);
		for (const direction of generated) {
			expect(ASKED_DIRECTIONS, direction).toContain(direction);
		}
	});

	it('puts each direction in one pool and no more, so nothing is asked twice', () => {
		expect(new Set(ASKED_DIRECTIONS).size).toBe(ASKED_DIRECTIONS.length);
	});
});

describe('the sight task, where the material arrives', () => {
	/** A symbol that has been opened and never yet answered. */
	const unmet = (id: string, keyCenter = 'C'): Schedulable => ({
		cardId: id,
		direction: 'see_play',
		keyCenter,
		skillCode: 'rung:all-sevenths',
		state: { ...initialState(NOW), reps: 0 }
	});

	it('asks the one direction that shows you the answer', () => {
		const cards = [...bank(), unmet('new-one'), unmet('new-two', 'G')];
		const byId = new Map(cards.map((c) => [c.cardId, c]));
		for (const id of sightQueue(cards, { now: NOW, day: 2 })) {
			expect(byId.get(id)!.direction, id).toBe('see_play');
		}
	});

	it('has nothing to say once every symbol has been played back', () => {
		// The whole of `bank()` has graduated, and a symbol you can already play is
		// one the play-along page asks all day with a band behind it.
		expect(sightQueue(bank(), { now: NOW, day: 0 })).toEqual([]);
	});

	it('hands the introduction back to a shape that graduated and was then failed', () => {
		const failed: Schedulable = {
			cardId: 'lapsed',
			direction: 'see_play',
			keyCenter: 'C',
			skillCode: 'rung:all-sevenths',
			state: {
				...initialState(NOW),
				state: 'relearning',
				reps: 6,
				dueAt: new Date(NOW.getTime() - DAY)
			}
		};
		expect(sightQueue([failed], { now: NOW, day: 0 })).toContain('lapsed');
	});

	it('leads the day, because an exercise must not arrive before its material', () => {
		const workout = composeWorkout(input({ cards: [...bank(), unmet('new-one')] }));
		expect(taskKinds(workout)[0]).toBe('sight');
	});

	it('is added to the day rather than taken out of it', () => {
		const ordinary = composeWorkout(input({ size: 'standard' }));
		const arriving = composeWorkout(
			input({ size: 'standard', cards: [...bank(), unmet('new-one')] })
		);

		expect(taskKinds(ordinary)).toEqual(['ear', 'function', 'mission', 'new_thing']);
		expect(taskKinds(arriving)).toEqual(['sight', 'ear', 'function', 'mission', 'new_thing']);
	});

	it('leaves its slot empty rather than borrowing a task to fill it', () => {
		// Nothing falls into the sight slot. An introduction handed out for want of
		// anything better would be the app teaching you something to pass the time.
		const workout = composeWorkout(input({ size: 'long' }));
		expect(taskKinds(workout)).not.toContain('sight');
		expect(workout.tasks).toHaveLength(TASK_COUNT.long);
	});

	it('says what it is made of, like every other drill', () => {
		const workout = composeWorkout(input({ cards: [...bank(), unmet('new-one')] }));
		const sight = workout.tasks.find((t) => t.kind === 'sight');
		expect(sight?.makeup?.keys).toContain('C');
		expect(sight?.instruction).toMatch(/symbols/);
	});
});

describe('the ear queue never runs dry', () => {
	it('fills from the due pile when there is one', () => {
		const queue = earQueue(bank(), { now: NOW, day: 0 });
		expect(queue).toHaveLength(10);
	});

	it('falls back to near-due when nothing at all is due', () => {
		const cards = bank({ dueInDays: 9 });
		expect(cards.every((c) => c.state.dueAt.getTime() > NOW.getTime())).toBe(true);

		const workout = composeWorkout(input({ cards }));
		const ear = workout.tasks.find((t) => t.kind === 'ear');
		expect(ear).toBeDefined();
		expect(earCards(workout)).toHaveLength(10);
	});

	it('falls back to fresh material that has never been reviewed', () => {
		const cards = bank({ dueInDays: 30, reps: 0 });
		const workout = composeWorkout(input({ cards }));
		expect(earCards(workout)).toHaveLength(10);
	});

	it('puts review work ahead of material only just met', () => {
		const fresh = card('fresh', 'hear_play', 'C', { reps: 0, dueInDays: -5 });
		const owed = card('owed', 'hear_name', 'C', { reps: 4, dueInDays: -1 });
		const queue = earQueue([fresh, owed], { now: NOW, day: 0 });
		expect(queue.indexOf('owed')).toBeLessThan(queue.indexOf('fresh'));
	});

	it('asks only the questions a chart cannot pose', () => {
		const cards = bank();
		const byId = new Map(cards.map((c) => [c.cardId, c]));
		for (const id of earQueue(cards, { now: NOW, day: 3 })) {
			expect(['hear_play', 'hear_name'], id).toContain(byId.get(id)!.direction);
		}
	});

	it('goes round a short pool rather than stopping early, but only so far', () => {
		const one = [card('only-one', 'hear_play', 'C')];
		expect(earQueue(one, { now: NOW, day: 0 })).toEqual(['only-one', 'only-one', 'only-one']);
	});

	it('has nothing to say when the bank holds no aural cards at all', () => {
		const silent = [card('seen', 'see_play', 'C'), card('named', 'play_name', 'C')];
		expect(earQueue(silent, { now: NOW, day: 0 })).toEqual([]);
	});

	/*
	 * Found by using the app: pinning "F · the scale" and departing asked for the
	 * G scale first, because G's card was riper. The answer was fine and the
	 * promise was not.
	 */
	it('enters a pinned rung through the key it was pinned in', () => {
		const cards = bank();
		const byId = new Map(cards.map((c) => [c.cardId, c]));
		const queue = earQueue(cards, {
			now: NOW,
			day: 4,
			pinnedSkill: 'rung:scale',
			keyCenter: 'F'
		});

		expect(byId.get(queue[0])!.keyCenter).toBe('F');
		expect(byId.get(queue[0])!.skillCode).toBe('rung:scale');
	});

	it('still runs on into the other keys, because leading is not narrowing', () => {
		const cards = bank();
		const byId = new Map(cards.map((c) => [c.cardId, c]));
		const queue = earQueue(cards, {
			now: NOW,
			day: 4,
			pinnedSkill: 'rung:scale',
			keyCenter: 'F'
		});

		const keys = new Set(queue.map((id) => byId.get(id)!.keyCenter));
		expect(keys.size).toBeGreaterThan(1);
	});

	it('leaves the queue alone when nothing is pinned', () => {
		const cards = bank();
		expect(earQueue(cards, { now: NOW, day: 4, keyCenter: 'F' })).toEqual(
			earQueue(cards, { now: NOW, day: 4 })
		);
	});
});

describe('the function queue', () => {
	it('asks eight, and asks them of degree cards only', () => {
		const cards = bank();
		const byId = new Map(cards.map((c) => [c.cardId, c]));
		const queue = functionQueue(cards, { now: NOW, day: 0 });

		expect(queue).toHaveLength(8);
		for (const id of queue) expect(byId.get(id)!.direction, id).toBe('degree_play');
	});

	it('is scheduled like everything else rather than invented on the spot', () => {
		// The point of making the degrees real cards: review work owed comes before
		// material only just met, exactly as it does in the ear.
		const fresh = card('fresh', 'degree_play', 'C', { reps: 0, dueInDays: -5 });
		const owed = card('owed', 'degree_play', 'C', { reps: 4, dueInDays: -1 });
		const queue = functionQueue([fresh, owed], { now: NOW, day: 0 });
		expect(queue.indexOf('owed')).toBeLessThan(queue.indexOf('fresh'));
	});

	it('never runs dry when the deck is well run', () => {
		for (const options of [{ dueInDays: 9 }, { dueInDays: 30, reps: 0 }]) {
			expect(
				functionQueue(bank(options), { now: NOW, day: 0 }),
				JSON.stringify(options)
			).toHaveLength(8);
		}
	});

	it('spreads the numerals over the keys rather than drilling one', () => {
		const cards = bank();
		const byId = new Map(cards.map((c) => [c.cardId, c]));
		const keys = new Set(
			functionQueue(cards, { now: NOW, day: 0 }).map((id) => byId.get(id)!.keyCenter)
		);
		expect(keys.size).toBe(REACHED_KEYS.length);
	});

	it('leads with today’s key', () => {
		const cards = bank();
		const byId = new Map(cards.map((c) => [c.cardId, c]));
		const queue = functionQueue(cards, { now: NOW, day: 5, keyCenter: 'Bb' });
		expect(byId.get(queue[0])!.keyCenter).toBe('Bb');
	});

	it('goes round a short pool rather than stopping early, but only so far', () => {
		const one = [card('only-one', 'degree_play', 'C')];
		expect(functionQueue(one, { now: NOW, day: 0 })).toEqual(['only-one', 'only-one', 'only-one']);
	});

	it('has nothing to say when nothing reached carries a numeral', () => {
		// A brand-new account owns the C major scale and nothing else, and a scale
		// is not a numbered chord — so `cards.ts` never made the card to ask.
		const scaleOnly = cardsForRung('scale', STAGES[0]);
		expect(scaleOnly.map((c) => c.direction)).not.toContain('degree_play');
		expect(functionQueue([card('seen', 'see_play', 'C')], { now: NOW, day: 0 })).toEqual([]);
	});

	it('never asks the same card as the ear task, one bank between the two', () => {
		const workout = composeWorkout(input({ size: 'long' }));
		const overlap = earCards(workout).filter((id) => functionCards(workout).includes(id));
		expect(overlap).toEqual([]);
	});
});

describe('the picker is honoured', () => {
	it('pins a rung, and the workout takes its key', () => {
		const workout = composeWorkout(
			input({ choice: { kind: 'rung', key: 'F', rungId: 'all-sevenths' } })
		);
		expect(workout.keyCenter).toBe('F');

		const byId = new Map(bank().map((c) => [c.cardId, c]));
		expect(byId.get(earCards(workout)[0])!.skillCode).toBe('rung:all-sevenths');

		const first = byId.get(functionCards(workout)[0])!;
		expect(first.skillCode).toBe(`rung:${'all-sevenths' satisfies RungId}`);
		expect(first.keyCenter).toBe('F');
	});

	it('pins a progression in the key it was asked for', () => {
		const cards = [
			...bank(),
			card('prog-ear', 'hear_play', 'Ab', { skillCode: 'prog:ii-V-I', dueInDays: -1 })
		];
		const workout = composeWorkout(
			input({ cards, choice: { kind: 'progression', progressionId: 'ii-V-I', keyCenter: 'Ab' } })
		);

		expect(workout.keyCenter).toBe('Ab');
		expect(earCards(workout)[0]).toBe('prog-ear');
		expect(workout.choice).toEqual({
			kind: 'progression',
			progressionId: 'ii-V-I',
			keyCenter: 'Ab'
		});
	});

	it('varies around the choice instead of orbiting it', () => {
		const choice = { kind: 'rung', key: 'F', rungId: 'all-sevenths' } as const;
		const today = composeWorkout(input({ choice }));
		const tomorrow = composeWorkout(input({ choice, now: new Date(NOW.getTime() + DAY) }));

		expect(tomorrow.keyCenter).toBe(today.keyCenter);
		expect(earCards(tomorrow)).not.toEqual(earCards(today));
	});

	it('does not narrow the whole workout to the pinned skill', () => {
		// The narrowing that made twenty minutes orbit a handful of facts is
		// exactly what this milestone is undoing.
		const cards = bank();
		const byId = new Map(cards.map((c) => [c.cardId, c]));
		const workout = composeWorkout(
			input({ cards, choice: { kind: 'rung', key: 'F', rungId: 'tonic-triad' } })
		);
		const skills = new Set(earCards(workout).map((id) => byId.get(id)!.skillCode));
		expect(skills.size).toBeGreaterThan(1);
	});
});

describe('one new thing', () => {
	it('never repeats yesterday’s', () => {
		const yesterday = composeWorkout(input());
		expect(yesterday.novelty).not.toBeNull();

		const today = composeWorkout(
			input({
				now: new Date(NOW.getTime() + DAY),
				yesterdaysNovelty: noveltyId(yesterday.novelty!)
			})
		);
		expect(noveltyId(today.novelty!)).not.toBe(noveltyId(yesterday.novelty!));
	});

	it('never repeats yesterday’s over a fortnight of carrying it forward', () => {
		let previous: Novelty | null = null;
		for (let d = 0; d < 14; d++) {
			const workout = composeWorkout(
				input({
					now: new Date(NOW.getTime() + d * DAY),
					yesterdaysNovelty: previous ? noveltyId(previous) : null
				})
			);
			if (previous) expect(noveltyId(workout.novelty!), `day ${d}`).not.toBe(noveltyId(previous));
			previous = workout.novelty;
		}
		expect(previous).not.toBeNull();
	});

	it('says “ready to move on” out loud when the rung looks solid', () => {
		const novelty = chooseNovelty({
			keyCenter: 'Eb',
			// What the frontier would open next, handed over rather than derived —
			// the composer is pure and does not know the frontier's shape.
			nextCell: { key: 'C', rungId: 'relative-minor' },
			playedProgressions: [],
			playedGrooves: [],
			rungLooksSolid: true,
			yesterday: null,
			day: 0
		});
		expect(novelty).toEqual({ kind: 'rung', key: 'C', rungId: 'relative-minor' });
	});

	it('offers something else when the rung is still being fought', () => {
		const novelty = chooseNovelty({
			keyCenter: 'Eb',
			nextCell: { key: 'C', rungId: 'relative-minor' },
			playedProgressions: [],
			playedGrooves: [],
			rungLooksSolid: false,
			yesterday: null,
			vocabulary: KNOWS_EVERYTHING,
			canPlayAlong: true,
			day: 0
		});
		expect(novelty?.kind).not.toBe('rung');
	});

	/*
	 * The first morning, and the whole of what this slot got wrong.
	 *
	 * An account one rung deep was offered the twelve-bar blues — *every chord is
	 * a dominant seventh*, five rungs before the ladder builds one — because the
	 * slot asked whether a progression had been *seen* and never whether it could
	 * be *played*. With nothing ready and no tune to play over, the only honest
	 * new thing left is the next step on the ladder, which is exactly what a first
	 * week should be made of.
	 */
	it('offers the next rung, and only that, to somebody who has learned one scale', () => {
		const novelty = chooseNovelty({
			keyCenter: 'C',
			nextCell: { key: 'C', rungId: 'tonic-triad' },
			playedProgressions: [],
			playedGrooves: [],
			rungLooksSolid: false,
			yesterday: null,
			vocabulary: vocabularyOf({ rungs: ['scale'] }),
			canPlayAlong: false,
			day: 0
		});
		expect(novelty).toEqual({ kind: 'rung', key: 'C', rungId: 'tonic-triad' });
	});

	it('refuses a progression whose chords the ladder has not built', () => {
		const blues = chooseNovelty({
			keyCenter: 'C',
			nextCell: null,
			playedProgressions: [],
			playedGrooves: [],
			rungLooksSolid: false,
			yesterday: null,
			// Two rungs: the scale and the home chord. No seventh anywhere.
			vocabulary: vocabularyOf({ rungs: ['scale', 'tonic-triad'] }),
			canPlayAlong: false,
			day: 0
		});
		expect(blues?.kind === 'progression' ? blues.progressionId : null).not.toBe('blues-basic');
	});

	/*
	 * A groove is a thing you play over, and on a morning when the composer has
	 * already worked out that no tune is playable it is a rhythm section offered
	 * to nobody.
	 */
	it('holds a groove back until some tune is playable', () => {
		const nothingToPlay = chooseNovelty({
			keyCenter: 'C',
			nextCell: null,
			playedProgressions: PROGRESSIONS.map((p) => p.id),
			playedGrooves: [],
			rungLooksSolid: false,
			yesterday: null,
			vocabulary: KNOWS_EVERYTHING,
			canPlayAlong: false,
			day: 0
		});
		expect(nothingToPlay).toBeNull();

		const somethingToPlay = chooseNovelty({
			keyCenter: 'C',
			nextCell: null,
			playedProgressions: PROGRESSIONS.map((p) => p.id),
			playedGrooves: [],
			rungLooksSolid: false,
			yesterday: null,
			vocabulary: KNOWS_EVERYTHING,
			canPlayAlong: true,
			day: 0
		});
		expect(somethingToPlay?.kind).toBe('groove');
	});

	it('does not offer a progression or a groove the record already holds', () => {
		const novelty = chooseNovelty({
			keyCenter: 'C',
			nextCell: null,
			playedProgressions: ['I-IV-V-I'],
			playedGrooves: ['swing'],
			rungLooksSolid: false,
			yesterday: null,
			vocabulary: KNOWS_EVERYTHING,
			canPlayAlong: true,
			day: 0
		});
		expect(noveltyId(novelty!)).not.toBe('progression|C|I-IV-V-I');
		expect(noveltyId(novelty!)).not.toBe('groove|swing');
	});

	it('gives the slot to a mission when there is genuinely nothing new left', () => {
		const everything = {
			// Derived rather than listed: a hand-typed copy of the library goes stale
			// the day somebody adds a progression to it, which is how this test broke.
			progressions: PROGRESSIONS.map((progression) => progression.id),
			grooves: [
				'swing',
				'straight',
				'shuffle',
				'rock',
				'pop',
				'ballad',
				'bossa',
				'reggae',
				'funk'
			] as const
		};
		const full: Frontier = frontierFromPosition('Gb', 'relative-minor')!;
		const workout = composeWorkout(
			input({
				reached: cellsOf(full),
				nextCell: nextCell(full),
				played: { ...everything, grooves: [...everything.grooves] }
			})
		);

		expect(workout.novelty).toBeNull();
		expect(taskKinds(workout)).not.toContain('new_thing');
		expect(workout.tasks).toHaveLength(4);
	});

	it('names a novelty stably, so it survives being stored and read back', () => {
		expect(noveltyId({ kind: 'rung', key: 'Bb', rungId: 'all-triads' })).toBe('rung|Bb|all-triads');
		expect(noveltyId({ kind: 'progression', progressionId: 'ii-V-I', keyCenter: 'F' })).toBe(
			'progression|F|ii-V-I'
		);
		expect(noveltyId({ kind: 'groove', groove: 'bossa' })).toBe('groove|bossa');
	});
});

describe('the mission', () => {
	it('is always offered, because a chart is always there', () => {
		const workout = composeWorkout(input({ cards: [], reached: [] }));
		expect(missions(workout).length).toBeGreaterThan(0);
	});

	it('is set in a key the ladder has actually reached', () => {
		const workout = composeWorkout(input({ size: 'long' }));
		for (const mission of missions(workout)) {
			expect(REACHED_KEYS, mission.chartSlug).toContain(mission.keyCenter);
		}
	});

	it('goes to a key the record has least to say about, and never to a warm one', () => {
		// Rotated through the coldest few rather than pinned to the coldest, the
		// way the key has been chosen since M5: always drilling the worst key
		// would make every workout a fight.
		const untouched = ['Eb', 'A', 'Bb', 'D'];
		const cold: WorkoutInput['coldSpots'] = REACHED_KEYS.map((keyCenter) => ({
			keyCenter,
			quality: 'maj',
			attempts: untouched.includes(keyCenter) ? 0 : 500,
			accuracy: untouched.includes(keyCenter) ? null : 0.9
		}));

		const chosen = new Set<string>();
		for (let d = 0; d < 8; d++) {
			const workout = composeWorkout(
				input({ coldSpots: cold, now: new Date(NOW.getTime() + d * DAY) })
			);
			expect(untouched, `day ${d}`).toContain(workout.keyCenter);
			expect(missions(workout)[0].keyCenter, `day ${d}`).toBe(workout.keyCenter);
			chosen.add(workout.keyCenter);
		}
		expect(chosen.size).toBeGreaterThan(1);
		expect(chosen.has('C')).toBe(false);
	});

	it('is steered towards the form a cold quality lives in', () => {
		const workout = composeWorkout(
			input({
				coldSpots: [{ keyCenter: 'C', quality: 'min7b5', attempts: 0, accuracy: null }]
			})
		);
		const mission = missions(workout)[0];
		expect(mission.chartSlug).toBe('minor-blues-12');
		expect(mission.coldSpot?.quality).toBe('min7b5');
	});

	it('does not send a long workout round the same tune twice', () => {
		const both = missions(composeWorkout(input({ size: 'long' })));
		expect(both[0].chartSlug).not.toBe(both[1].chartSlug);
	});

	it('judges a cycle on getting round it, and everything else on guide tones', () => {
		const cycle = composeWorkout(
			input({
				charts: [
					{
						slug: 'fifths-cycle',
						name: 'ii–V round the wheel',
						style: 'custom',
						category: 'cycle',
						mode: 'major',
						defaultBpm: 100,
						defaultGroove: 'swing',
						demand: chartDemand({ grid: [['ii7 V7', 'v7 I7']], mode: 'major' })
					}
				]
			})
		);
		expect(missions(cycle)[0]).toBeDefined();
		const goal = cycle.tasks.find((t) => t.kind === 'mission')!.goal;
		expect(goal).toEqual({ kind: 'choruses', count: 1 });

		const blues = composeWorkout(input());
		const bluesGoal = blues.tasks.find(
			(t): t is Extract<Task, { kind: 'mission' }> => t.kind === 'mission'
		)!.goal;
		expect(bluesGoal.kind).toBe('guide_tones');
	});

	it('asks for a tempo floor rather than a setting', () => {
		const mission = missions(composeWorkout(input()))[0];
		expect(mission.bpmFloor).toBeGreaterThan(0);
		expect(describeGoal({ kind: 'guide_tones', percent: 70, choruses: 2 })).toContain('70%');
	});

	it('asks for the next band up on a tune the ladder has something to say about', () => {
		// Rhythm changes from the record: held clean at 100 on a tune that goes at
		// 160, so the work is at 128 and not at the tune's own tempo. Asking for
		// 160 says the same thing to somebody at 63% and to somebody past tempo.
		const workout = composeWorkout(
			input({
				charts: [ONE_TUNE],
				ladders: { 'rhythm-changes': suggestLadder([held(100)], 160) }
			})
		);
		const mission = missions(workout)[0];
		expect(mission.bpmFloor).toBe(128);
		expect(mission.band).toBe('nearly');
	});

	it('says why it is asking for a tempo the tune does not go at', () => {
		const workout = composeWorkout(
			input({
				charts: [ONE_TUNE],
				ladders: { 'rhythm-changes': suggestLadder([held(100)], 160) }
			})
		);
		const task = workout.tasks.find((t) => t.kind === 'mission')!;
		expect(task.instruction).toContain('≥128 BPM');
		expect(task.instruction).toContain('one band up');
	});

	it('keeps the tune’s own tempo where the ladder has nothing to say', () => {
		const nothing = composeWorkout(input({ charts: [ONE_TUNE] }));
		expect(missions(nothing)[0].bpmFloor).toBe(ONE_TUNE.defaultBpm);
		expect(missions(nothing)[0].band).toBeNull();

		const unheld = composeWorkout(
			input({ charts: [ONE_TUNE], ladders: { 'rhythm-changes': suggestLadder([], 160) } })
		);
		expect(missions(unheld)[0].bpmFloor).toBe(ONE_TUNE.defaultBpm);
		expect(missions(unheld)[0].band).toBeNull();
	});

	it('has nothing above past tempo to send anybody to', () => {
		// The open question, settled: `past` is shown and awards nothing, so there
		// is no band beyond it for a mission to aim at either.
		const workout = composeWorkout(
			input({
				charts: [ONE_TUNE],
				ladders: { 'rhythm-changes': suggestLadder([held(200)], 160) }
			})
		);
		expect(missions(workout)[0].band).toBeNull();
		expect(missions(workout)[0].bpmFloor).toBe(ONE_TUNE.defaultBpm);
	});

	it('reads the ladder per tune, because tempo does not transfer', () => {
		// A ladder filed under one slug says nothing about another, exactly as
		// holding rhythm changes at 100 says nothing about a bossa.
		const workout = composeWorkout(
			input({ charts: [ONE_TUNE], ladders: { bossa: suggestLadder([held(100)], 160) } })
		);
		expect(missions(workout)[0].bpmFloor).toBe(ONE_TUNE.defaultBpm);
	});

	it('takes the grade as an input rather than going and asking for it', () => {
		// The composer is pure and stays pure: the same inputs on the same day
		// compose the identical workout, ladders included, with no database
		// anywhere near the proof.
		const ladders = { 'rhythm-changes': suggestLadder([held(100)], 160) };
		const once = composeWorkout(input({ charts: [ONE_TUNE], ladders }));
		const twice = composeWorkout(input({ charts: [ONE_TUNE], ladders }));
		expect(once).toEqual(twice);
	});

	it('takes the roots away often enough to be a habit, not a rule', () => {
		const rootless = [];
		for (let d = 0; d < 9; d++) {
			const workout = composeWorkout(input({ now: new Date(NOW.getTime() + d * DAY) }));
			rootless.push(missions(workout)[0].rootless);
		}
		expect(rootless.filter(Boolean).length).toBe(3);
	});
});

describe('a brand-new account', () => {
	const firstReached = cellsOf(FIRST_FRONTIER);
	const firstCards: Schedulable[] = cardsForRung('scale', STAGES[0]).map((generated, i) => ({
		cardId: `first-${i}`,
		direction: generated.direction,
		keyCenter: generated.keyCenter,
		skillCode: generated.skillCode,
		state: { ...initialState(NOW), reps: 0 }
	}));

	const first = composeWorkout({
		cards: firstCards,
		reached: firstReached,
		nextCell: nextCell(FIRST_FRONTIER),
		vocabulary: vocabularyOf({ rungs: firstReached.map((cell) => cell.rungId) }),
		now: NOW
	});

	/*
	 * Three tasks on the very first day, and this is the fix rather than a
	 * regression.
	 *
	 * Day one owns one rung — the seven notes of C major — and therefore no chord
	 * shape at all. The function task cannot be built, because a scale has no
	 * degree to ask for, and now the mission cannot either, because every tune in
	 * the book asks for a chord nobody has been shown. What used to fill that slot
	 * was a chart picked out of the whole list: a Cmaj7 into an E♭7 on the second
	 * morning of playing the piano.
	 *
	 * So it is short, and it says so. The size picker counts the tasks actually
	 * composed and `missionHeld` names the tune that is nearest and what it wants.
	 * By the second rung — the home chord — a major triad is a shape you have met
	 * and the first play-along appears.
	 *
	 * What it does open with is the scale, written down and played from the page,
	 * before anything asks for it back by ear. That ordering is the build-up rule
	 * at the scale of one morning, and until the sight task existed the very first
	 * question this app ever asked anybody was an exam.
	 */
	it('is short on day one, because there is nothing honest to fill it with', () => {
		expect(taskKinds(first)).toEqual(['sight', 'ear', 'new_thing']);
	});

	it('shows the material before asking for it back', () => {
		expect(taskKinds(first).indexOf('sight')).toBeLessThan(taskKinds(first).indexOf('ear'));
	});

	it('says which tune is nearest and what it is waiting for', () => {
		expect(first.missionHeld).not.toBeNull();
		expect(first.missionHeld!.needs).toBeTruthy();
		expect(first.missionHeld!.teaches.length).toBeGreaterThan(0);
	});

	it('has a play-along by the time the home chord is met', () => {
		const second = cellsOf(frontierFromPosition('C', 'tonic-triad')!);
		const workout = composeWorkout({
			cards: firstCards,
			reached: second,
			vocabulary: vocabularyOf({ rungs: second.map((cell) => cell.rungId) }),
			now: NOW
		});
		expect(taskKinds(workout)).toContain('mission');
		expect(workout.missionHeld).toBeNull();
	});

	it('has an ear task even though it owns one aural card', () => {
		expect(earCards(first)).toHaveLength(3);
		expect(new Set(earCards(first)).size).toBe(1);
	});

	it('drops the function task rather than asking a scale for its degree', () => {
		expect(taskKinds(first)).not.toContain('function');
	});

	it('stays in C major throughout', () => {
		expect(first.keyCenter).toBe('C');
		for (const mission of missions(first)) expect(mission.keyCenter).toBe('C');
		if (first.novelty?.kind === 'progression') expect(first.novelty.keyCenter).toBe('C');
		if (first.novelty?.kind === 'rung') expect(first.novelty.key).toBe('C');
	});
});

describe('the mission only lands on a tune you have been taught', () => {
	/*
	 * The complaint, end to end. The drill room would ask for a C triad and the
	 * seven notes of C major and the same workout would send you to a three-tonic
	 * cycle — Cmaj7 into E♭7 into A♭maj7 — chords nobody had mentioned, in keys
	 * nobody had been to. `curriculum/vocabulary.ts` decides what is ready; this
	 * is the proof that the composer actually asks it.
	 */
	const early = cellsOf(frontierFromPosition('C', 'all-triads')!);
	const earlyInput = input({
		reached: early,
		vocabulary: vocabularyOf({ rungs: early.map((cell) => cell.rungId) }),
		charts: MISSION_CHARTS
	});

	it('never sets a mission on a tune that leaves the key you have been shown', () => {
		for (let d = 0; d < 30; d++) {
			const workout = composeWorkout({
				...earlyInput,
				size: 'long',
				now: new Date(NOW.getTime() + d * DAY)
			});
			for (const mission of missions(workout)) {
				const chart = MISSION_CHARTS.find((c) => c.slug === mission.chartSlug)!;
				expect(chart.demand.devices, `${chart.slug} on day ${d}`).toEqual([]);
			}
		}
	});

	it('reaches the cycles once the chromatic devices have been met', () => {
		const far = input({
			charts: MISSION_CHARTS,
			vocabulary: vocabularyOf({
				rungs: ALL_RUNGS,
				progressions: PROGRESSIONS.map((progression) => progression.id)
			})
		});
		const slugs = new Set<string>();
		for (let d = 0; d < 60; d++) {
			const workout = composeWorkout({
				...far,
				size: 'long',
				now: new Date(NOW.getTime() + d * DAY)
			});
			for (const mission of missions(workout)) slugs.add(mission.chartSlug);
		}
		expect(slugs.has('three-tonic-cycle')).toBe(true);
	});

	it('refuses a second mission that would be the same tune in the same key', () => {
		// One rung, one key, one ready tune. A long workout asks for two missions;
		// the second would be a copy of the first, so it is not built.
		const workout = composeWorkout({ ...earlyInput, size: 'long' });
		const set = missions(workout).map((mission) => `${mission.chartSlug} ${mission.keyCenter}`);
		expect(new Set(set).size).toBe(set.length);
	});

	it('still steers by the coldest quality, but only among what is ready', () => {
		const coldDominant = composeWorkout({
			...input({ charts: MISSION_CHARTS }),
			coldSpots: [{ keyCenter: 'C', quality: 'dom', attempts: 0, accuracy: null }]
		});
		const chart = MISSION_CHARTS.find((c) => c.slug === missions(coldDominant)[0].chartSlug)!;
		expect(chart.style).toBe('blues');
	});
});

describe('the record’s cold spots, folded out of one GROUP BY', () => {
	const rows = [
		{ localKey: 'C', chord: 'C7', attempts: 40, landed: 36 },
		{ localKey: 'C', chord: 'F7', attempts: 20, landed: 10 },
		{ localKey: 'C', chord: 'Dm7', attempts: 6, landed: 6 },
		{ localKey: 'A', chord: 'Amaj7', attempts: 4, landed: 2 }
	];

	it('groups chords by what they are, not by how they were written', () => {
		const dominants = coldSpotsFrom(rows).find(
			(spot) => spot.keyCenter === 'C' && spot.quality === 'dom'
		);
		expect(dominants?.attempts).toBe(60);
		expect(dominants?.accuracy).toBeCloseTo(46 / 60);
	});

	it('files a chord under the key it was heard in, whatever mode that was called', () => {
		const spots = coldSpotsFrom([
			{ localKey: 'Eb dorian', chord: 'Ebm7', attempts: 3, landed: 1 },
			{ localKey: 'Eb', chord: 'Ebm7', attempts: 2, landed: 2 }
		]);
		expect(spots).toHaveLength(1);
		expect(spots[0]).toMatchObject({ keyCenter: 'Eb', quality: 'min', attempts: 5 });
	});

	it('hands them over coldest first, which is the order the mission reads', () => {
		const attempts = coldSpotsFrom(rows).map((spot) => spot.attempts);
		expect(attempts).toEqual([...attempts].sort((a, b) => a - b));
	});

	it('drops a symbol it cannot read rather than filing it under a guess', () => {
		expect(coldSpotsFrom([{ localKey: 'C', chord: '???', attempts: 9, landed: 0 }])).toEqual([]);
	});

	it('invents nothing for a quality the record has never held', () => {
		const qualities = coldSpotsFrom(rows).map((spot) => spot.quality);
		expect(qualities).not.toContain('dim7');
		expect(coldSpotsFrom([])).toEqual([]);
	});

	it('steers the day’s key ranking towards what the record has least of', () => {
		expect(coldestKeys(['C', 'A', 'Eb'], coldSpotsFrom(rows), 2)).toEqual(['Eb', 'A']);
	});
});

describe('makeupOf', () => {
	const bank = [
		card('a', 'hear_play', 'C', { reps: 0, skillCode: 'rung:scale' }),
		card('b', 'hear_play', 'C', { reps: 4, skillCode: 'rung:scale' }),
		card('c', 'hear_play', 'G', { reps: 2, skillCode: 'rung:tonic-triad' })
	];

	it('names keys and skills in the order they are first asked', () => {
		expect(makeupOf(['c', 'a', 'b'], bank)).toMatchObject({
			keys: ['G', 'C'],
			skills: ['rung:tonic-triad', 'rung:scale']
		});
	});

	it('counts questions rather than cards, because a short pool repeats', () => {
		expect(makeupOf(['a', 'a', 'b'], bank)).toMatchObject({ fresh: 2, seen: 1 });
	});

	it('calls a card new only when nobody has ever answered it', () => {
		expect(makeupOf(['a'], bank)).toMatchObject({ fresh: 1, seen: 0 });
		expect(makeupOf(['b'], bank)).toMatchObject({ fresh: 0, seen: 1 });
	});

	it('skips a card the bank no longer holds rather than counting it as new', () => {
		expect(makeupOf(['a', 'gone'], bank)).toMatchObject({ fresh: 1, seen: 0, keys: ['C'] });
	});
});

describe('the makeup a composed workout carries', () => {
	it('is on both drill tasks and agrees with their queues', () => {
		const workout = composeWorkout(input({ size: 'standard' }));
		for (const task of workout.tasks) {
			if (task.kind !== 'ear' && task.kind !== 'function') continue;
			expect(task.makeup).toBeDefined();
			expect(task.makeup!.fresh + task.makeup!.seen).toBe(task.cardIds.length);
			expect(task.makeup!.keys.length).toBeGreaterThan(0);
		}
	});

	it('reports revision when the whole bank has been answered before', () => {
		const workout = composeWorkout(input({ cards: bank({ reps: 5 }) }));
		const drills = workout.tasks.filter((t) => t.kind === 'ear' || t.kind === 'function');
		expect(drills.length).toBeGreaterThan(0);
		for (const task of drills) {
			expect((task as { makeup?: { fresh: number } }).makeup!.fresh).toBe(0);
		}
	});
});

describe('describeAcquaintance', () => {
	it('says nothing at all about a mission with no count on it', () => {
		expect(describeAcquaintance(undefined)).toBe('');
	});

	it('separates never, once, and more than once', () => {
		expect(describeAcquaintance(0)).toContain('First time');
		expect(describeAcquaintance(1)).toContain('once before');
		expect(describeAcquaintance(6)).toContain('6 times before');
	});
});

describe('a mission says whether the tune has been met', () => {
	it('carries the count the record handed over', () => {
		const workout = composeWorkout(input({ charts: [ONE_TUNE], plays: { 'rhythm-changes': 3 } }));
		expect(missions(workout)[0].playedBefore).toBe(3);
		expect(workout.tasks.find((t) => t.kind === 'mission')!.instruction).toContain(
			'Played 3 times before'
		);
	});

	it('is zero rather than absent for a tune with no runs', () => {
		const workout = composeWorkout(input({ charts: [ONE_TUNE] }));
		expect(missions(workout)[0].playedBefore).toBe(0);
	});
});

describe('the crossing task', () => {
	const crossing = (workout: Workout) =>
		workout.tasks.find((task) => task.kind === 'crossing') as
			{ kind: 'crossing'; cardIds: string[]; makeup?: { keys: string[] } } | undefined;

	it('appears at long, and on alternate days at standard', () => {
		const long = composeWorkout(input({ size: 'long' }));
		expect(taskKinds(long)).toContain('crossing');
		expect(taskKinds(long)).toHaveLength(TASK_COUNT.long);

		const kinds = [0, 1].map((d) =>
			taskKinds(composeWorkout(input({ size: 'standard', now: new Date(NOW.getTime() + d * DAY) })))
		);
		expect(kinds.some((k) => k.includes('crossing'))).toBe(true);
		expect(kinds.some((k) => k.includes('function'))).toBe(true);
	});

	it('does not lengthen the standard day to fit', () => {
		for (let d = 0; d < 6; d++) {
			const workout = composeWorkout(
				input({ size: 'standard', now: new Date(NOW.getTime() + d * DAY) })
			);
			expect(workout.tasks, `day ${d}`).toHaveLength(TASK_COUNT.standard);
		}
	});

	/*
	 * The point of the exercise. Six questions all in one key would be six
	 * repetitions of "yes, still C"; the discrimination is the spread.
	 */
	it('spreads across the keys the frontier has opened', () => {
		const task = crossing(composeWorkout(input({ size: 'long' })))!;
		expect(task.makeup!.keys.length).toBeGreaterThan(1);
	});

	it('asks only the direction that asks about a key', () => {
		const workout = composeWorkout(input({ size: 'long' }));
		const asked = new Set(crossing(workout)!.cardIds);
		const bankById = new Map(bank().map((c) => [c.cardId, c]));
		for (const id of asked) expect(bankById.get(id)!.direction).toBe('pivot_play');
	});

	it('never hands the same card to two tasks', () => {
		const workout = composeWorkout(input({ size: 'long' }));
		const all = workout.tasks.flatMap((task) =>
			task.kind === 'ear' || task.kind === 'function' || task.kind === 'crossing'
				? task.cardIds
				: []
		);
		const crossingIds = new Set(crossing(workout)!.cardIds);
		const others = all.filter((id) => !crossingIds.has(id));
		for (const id of others) expect(crossingIds.has(id)).toBe(false);
	});

	it('falls through rather than leaving a hole when no key card exists', () => {
		// An account that has not reached the sevenths anywhere owns no pivots.
		const withoutKeys = bank().filter((c) => c.direction !== 'pivot_play');
		const workout = composeWorkout(input({ size: 'long', cards: withoutKeys }));
		expect(taskKinds(workout)).not.toContain('crossing');
		expect(workout.tasks.length).toBeGreaterThan(0);
	});
});

describe('the mission goes where the record has not been', () => {
	/*
	 * The complaint, exactly as it arrived: *I have to play "Linstead Market",
	 * literally every time the same song*. The record agreed — twenty-five runs of
	 * that tune, none at all of six others the account had been cleared for. The
	 * composer already knew both numbers and used neither; it rotated a fixed list
	 * one step a day, which hands the same tune to every workout started before
	 * midnight and comes back round every nine days.
	 */
	const early = cellsOf(frontierFromPosition('C', 'tonic-triad')!);
	const taughtHere = vocabularyOf({ rungs: early.map((cell) => cell.rungId) });
	const readyTunes = MISSION_CHARTS.filter((chart) =>
		chart.demand.shapes.every((shape) => taughtHere.shapes.includes(shape))
	).map((chart) => chart.slug);

	const withPlays = (plays: Record<string, number>) =>
		composeWorkout(
			input({
				reached: early,
				vocabulary: taughtHere,
				charts: MISSION_CHARTS,
				plays
			})
		);

	it('has more than one tune to choose from at this point on the ladder', () => {
		expect(readyTunes.length).toBeGreaterThan(1);
	});

	it('does not send you back to the tune you have played twenty-five times', () => {
		const worn = readyTunes[0];
		const workout = withPlays({ [worn]: 25 });
		for (const mission of missions(workout)) expect(mission.chartSlug).not.toBe(worn);
	});

	it('takes the tune the record has least of', () => {
		const [first, second, ...rest] = readyTunes;
		const plays = Object.fromEntries(readyTunes.map((slug) => [slug, 5]));
		plays[second] = 0;
		expect(missions(withPlays(plays))[0].chartSlug).toBe(second);
		expect(first).not.toBe(second);
		expect(rest).toBeDefined();
	});

	it('moves on within the same day, because playing one is what changes the count', () => {
		const before = missions(withPlays({}))[0].chartSlug;
		const after = missions(withPlays({ [before]: 1 }))[0].chartSlug;
		expect(after).not.toBe(before);
	});

	it('still walks the whole list when the record has nothing to choose between', () => {
		// The old behaviour, and it has to survive: with every count at zero the
		// day's rotation is the only thing ordering the pool.
		const seen = new Set<string>();
		for (let d = 0; d < 12; d++) {
			const workout = composeWorkout(
				input({
					reached: early,
					vocabulary: taughtHere,
					charts: MISSION_CHARTS,
					now: new Date(NOW.getTime() + d * DAY)
				})
			);
			for (const mission of missions(workout)) seen.add(mission.chartSlug);
		}
		expect(seen.size).toBeGreaterThan(1);
	});
});

describe('offering the next cell of the ladder', () => {
	/*
	 * The offer used to *be* the novelty: the "move the ladder here" button
	 * existed only when the one new thing happened to be the next rung, and the
	 * novelty slot has twenty-eight progressions and grooves it would rather show
	 * first. An account past its first week never saw it.
	 */
	// The account the complaint came from: parked on the home chord, with five
	// rungs of the ladder still ahead of it.
	const PARKED = frontierFromPosition('C', 'tonic-triad')!;
	const standingOn = {
		rungId: 'tonic-triad' as RungId,
		label: 'The home chord',
		reviews: 85,
		correct: 42
	};
	const parked = (overrides: Partial<WorkoutInput> = {}) =>
		input({
			reached: cellsOf(PARKED),
			nextCell: nextCell(PARKED),
			vocabulary: vocabularyOf({ rungs: cellsOf(PARKED).map((cell) => cell.rungId) }),
			standingOn,
			...overrides
		});

	it('says nothing while the rung is still being learned', () => {
		expect(composeWorkout(parked({ rungLooksSolid: false })).openNext).toBeNull();
	});

	it('names the rung the frontier would open, whatever the new thing is', () => {
		const workout = composeWorkout(parked({ rungLooksSolid: true }));
		expect(workout.openNext?.rungId).toBe(nextCell(PARKED)?.rungId);
		expect(workout.openNext?.from.reviews).toBe(85);
	});

	it('is offered even when the new thing is a progression', () => {
		// The rung led the novelty yesterday, so today's new thing is something
		// else. That used to take the offer off screen with it.
		const next = nextCell(PARKED)!;
		const workout = composeWorkout(
			parked({
				rungLooksSolid: true,
				yesterdaysNovelty: noveltyId({ kind: 'rung', key: next.key, rungId: next.rungId })
			})
		);
		expect(workout.novelty?.kind).not.toBe('rung');
		expect(workout.openNext).not.toBeNull();
		expect(workout.openNext?.label).toBeTruthy();
	});

	it('does not claim the rung is solid when only the count earned the offer', () => {
		expect(composeWorkout(parked({ rungLooksSolid: true })).openNext?.solid).toBe(false);
	});

	it('claims it is solid when the accuracy actually says so', () => {
		const workout = composeWorkout(
			parked({ standingOn: { ...standingOn, reviews: 15, correct: 14 }, rungLooksSolid: true })
		);
		expect(workout.openNext?.solid).toBe(true);
	});

	it('says nothing at the bottom of the ladder, where there is nowhere left', () => {
		expect(
			composeWorkout(parked({ rungLooksSolid: true, nextCell: null, nextOpening: null })).openNext
		).toBeNull();
	});

	/*
	 * The case the repaired account landed in and the reason the offer is not
	 * called "deepen". Seven rungs of C worked through, eleven keys untouched:
	 * `nextCell` has no answer, so the offer used to vanish at the exact moment
	 * the only thing left to do was take the ladder into another key.
	 */
	it('offers the same rung in a new key once every rung is open somewhere', () => {
		const finishedC: Frontier = { widths: [2, 1, 1, 1, 1, 1, 1] };
		const workout = composeWorkout(
			parked({
				reached: cellsOf(finishedC),
				nextCell: nextCell(finishedC),
				nextOpening: nextOpening(finishedC),
				rungLooksSolid: true
			})
		);
		expect(nextCell(finishedC)).toBeNull();
		expect(workout.openNext?.move).toBe('wider');
		expect(workout.openNext?.key).toBe('G');
	});
});

describe('a minor tune goes in a minor key the ladder opened', () => {
	/*
	 * *I tried a lesson on "relative minor" in the C scale and then had to play
	 * St. James Infirmary that had Cmin and Fmin, which is not part of A minor.*
	 *
	 * The numerals of a minor chart resolve against the major scale of whatever
	 * key name they are handed — see `realiseChart` — so handing one the workout's
	 * own key produced the parallel minor. A workout in C set the tune in C minor:
	 * Cm, Fm, G7, three flats, and no rung on this ladder teaches them.
	 */
	const FINISHED_C: Frontier = { widths: [2, 1, 1, 1, 1, 1, 1] };
	const reached = cellsOf(FINISHED_C);
	const knows = vocabularyOf({ rungs: reached.map((cell) => cell.rungId) });

	const minorTune = MISSION_CHARTS.find((chart) => chart.slug === 'st-james-infirmary')!;

	const inKey = (keyCenter: string, overrides: Partial<WorkoutInput> = {}) =>
		composeWorkout(
			input({
				reached,
				nextCell: nextCell(FINISHED_C),
				vocabulary: knows,
				charts: [minorTune],
				coldSpots: [],
				size: 'standard',
				choice: { kind: 'rung', key: keyCenter, rungId: 'relative-minor' },
				...overrides
			})
		);

	it('opens exactly one minor key at this point on the ladder', () => {
		expect(minorKeysReached(reached)).toEqual(['A']);
	});

	it('sets it in the relative minor of the key the workout is in', () => {
		expect(missions(inKey('C'))[0].keyCenter).toBe('A');
	});

	it('never sets it in the parallel minor', () => {
		for (let d = 0; d < 14; d++) {
			const workout = inKey('C', { now: new Date(NOW.getTime() + d * DAY), size: 'long' });
			for (const mission of missions(workout)) {
				expect(mission.keyCenter, `day ${d}`).not.toBe('C');
			}
		}
	});

	it('names the key as minor, so the task does not read as A major', () => {
		const task = inKey('C').tasks.find((t) => t.kind === 'mission')!;
		expect(task.instruction).toContain('A minor');
	});

	it('refuses the tune outright when no minor key is open', () => {
		const noMinor: Frontier = { widths: [2, 1, 1, 1, 1, 1, 0] };
		const cells = cellsOf(noMinor);
		const workout = composeWorkout(
			input({
				reached: cells,
				nextCell: nextCell(noMinor),
				vocabulary: vocabularyOf({ rungs: cells.map((cell) => cell.rungId) }),
				charts: [minorTune]
			})
		);
		expect(minorKeysReached(cells)).toEqual([]);
		expect(missions(workout)).toHaveLength(0);
		expect(workout.missionHeld?.needs).toContain('minor key');
	});
});

describe('a minor progression is placed the same way', () => {
	/*
	 * The same bug one slot along, and reachable sooner: the library is a quarter
	 * minor by level one, and `realiseProgression` resolves numerals against the
	 * major scale exactly as `realiseChart` does. "i – iv – v – i in C" is Cm, Fm,
	 * Gm — offered as *one new thing* to somebody who had never left C major.
	 */
	const minorIds = PROGRESSIONS.filter((p) => p.mode === 'minor').map((p) => p.id);

	const novelty = (minorKeys: string[]) =>
		chooseNovelty({
			keyCenter: 'C',
			nextCell: null,
			// Everything but the minor ones already met, so a minor one leads if it
			// is allowed to be offered at all.
			playedProgressions: PROGRESSIONS.filter((p) => p.mode !== 'minor').map((p) => p.id),
			playedGrooves: [],
			rungLooksSolid: false,
			yesterday: null,
			minorKeys,
			vocabulary: KNOWS_EVERYTHING,
			canPlayAlong: true,
			day: 0
		});

	it('has minor progressions to offer', () => {
		expect(minorIds.length).toBeGreaterThan(0);
	});

	it('offers none of them before a minor key is open', () => {
		const chosen = novelty([]);
		if (chosen?.kind === 'progression') expect(minorIds).not.toContain(chosen.progressionId);
		else expect(chosen?.kind ?? 'none').not.toBe('progression');
	});

	it('places one in the relative minor once there is one', () => {
		const chosen = novelty(['A']);
		expect(chosen?.kind).toBe('progression');
		if (chosen?.kind !== 'progression') return;
		expect(minorIds).toContain(chosen.progressionId);
		expect(chosen.keyCenter).toBe('A');
	});

	it('leaves major progressions in the workout’s key', () => {
		const chosen = chooseNovelty({
			keyCenter: 'C',
			nextCell: null,
			playedProgressions: [],
			playedGrooves: [],
			rungLooksSolid: false,
			yesterday: null,
			minorKeys: ['A'],
			vocabulary: KNOWS_EVERYTHING,
			canPlayAlong: true,
			day: 0
		});
		if (chosen?.kind !== 'progression') return;
		const mode = PROGRESSIONS.find((p) => p.id === chosen.progressionId)?.mode;
		expect(chosen.keyCenter).toBe(mode === 'minor' ? 'A' : 'C');
	});
});
