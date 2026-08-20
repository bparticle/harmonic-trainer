import { describe, expect, it } from 'vitest';
import type { CardDirection } from '$lib/server/db/schema';
import { initialState, type Schedulable } from '$lib/srs/scheduler';
import { FIRST_POSITION, positionOf, reachedSoFar, type RungId } from '$lib/curriculum/ladder';
import { cardsForRung } from '$lib/curriculum/cards';
import { STAGES } from '$lib/curriculum/ladder';
import {
	TASK_COUNT,
	chooseNovelty,
	composeWorkout,
	dayNumber,
	degreePrompts,
	describeGoal,
	earQueue,
	noveltyId,
	type Novelty,
	type Task,
	type Workout,
	type WorkoutInput,
	type WorkoutSize
} from './workout';

const NOW = new Date('2026-02-10T09:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** As far as a player with a few months on the ladder has got. */
const FAR = positionOf('Eb', 'all-sevenths')!;
const REACHED = reachedSoFar(FAR);
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

/** A bank spread over every reached key and every direction. */
function bank(options: { dueInDays?: number; reps?: number } = {}): Schedulable[] {
	const directions: CardDirection[] = ['hear_name', 'hear_play', 'see_play', 'play_name'];
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
	return out;
}

const input = (overrides: Partial<WorkoutInput> = {}): WorkoutInput => ({
	cards: bank(),
	reached: REACHED,
	now: NOW,
	...overrides
});

const taskKinds = (workout: Workout) => workout.tasks.map((t) => t.kind);
const earCards = (workout: Workout) =>
	workout.tasks.flatMap((t) => (t.kind === 'ear' ? t.cardIds : []));
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
});

describe('the function task', () => {
	it('asks degrees drawn from everywhere the ladder has been', () => {
		const prompts = degreePrompts(REACHED, { day: 0 });
		expect(prompts).toHaveLength(8);
		expect(new Set(prompts.map((p) => p.key)).size).toBeGreaterThan(1);
	});

	it('never asks a scale for its degree, because a scale has none', () => {
		const scaleOnly = degreePrompts([{ key: 'C', rungId: 'scale' }], { day: 0 });
		expect(scaleOnly).toEqual([]);
	});

	it('carries the answer with the question, so it can be marked', () => {
		for (const prompt of degreePrompts(REACHED, { day: 2 })) {
			expect(prompt.degree.length, prompt.answer).toBeGreaterThan(0);
			expect(prompt.answerPitchClasses.length, prompt.answer).toBeGreaterThan(2);
		}
	});

	it('leads with today’s key', () => {
		const prompts = degreePrompts(REACHED, { day: 5, keyCenter: 'Bb' });
		expect(prompts[0].key).toBe('Bb');
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

		const fn = workout.tasks.find((t) => t.kind === 'function');
		expect(fn?.kind === 'function' && fn.prompts[0]).toMatchObject({
			key: 'F',
			rungId: 'all-sevenths' satisfies RungId
		});
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
			reached: REACHED,
			keyCenter: 'Eb',
			playedProgressions: [],
			playedGrooves: [],
			rungLooksSolid: true,
			yesterday: null,
			day: 0
		});
		expect(novelty).toEqual({ kind: 'rung', key: 'Eb', rungId: 'relative-minor' });
	});

	it('offers something else when the rung is still being fought', () => {
		const novelty = chooseNovelty({
			reached: REACHED,
			keyCenter: 'Eb',
			playedProgressions: [],
			playedGrooves: [],
			rungLooksSolid: false,
			yesterday: null,
			day: 0
		});
		expect(novelty?.kind).not.toBe('rung');
	});

	it('does not offer a progression or a groove the record already holds', () => {
		const novelty = chooseNovelty({
			reached: REACHED,
			keyCenter: 'C',
			playedProgressions: ['I-IV-V-I'],
			playedGrooves: ['swing'],
			rungLooksSolid: false,
			yesterday: null,
			day: 0
		});
		expect(noveltyId(novelty!)).not.toBe('progression|C|I-IV-V-I');
		expect(noveltyId(novelty!)).not.toBe('groove|swing');
	});

	it('gives the slot to a mission when there is genuinely nothing new left', () => {
		const everything = {
			progressions: [
				'I-IV-V-I',
				'I-V-vi-IV',
				'i-iv-v-i',
				'I-vi-ii-V',
				'vi-ii-V-I',
				'ii-V-I',
				'ii-V-i-minor',
				'blues-basic',
				'blues-quick',
				'secondary-dominant',
				'borrowed-four',
				'tritone-sub',
				'backdoor'
			],
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
		const finished = reachedSoFar(positionOf('Gb', 'relative-minor')!);
		const workout = composeWorkout(
			input({ reached: finished, played: { ...everything, grooves: [...everything.grooves] } })
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
						defaultGroove: 'swing'
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
	const firstReached = reachedSoFar(FIRST_POSITION);
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
		now: NOW
	});

	it('gets a full workout on day one', () => {
		expect(first.tasks).toHaveLength(4);
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
