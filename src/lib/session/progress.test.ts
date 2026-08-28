import { describe, expect, it } from 'vitest';
import type { Goal } from '$lib/practice/goal';
import type { LegacyBlockType } from '$lib/server/db/schema';
import {
	hydrateWorkout,
	isWorkout,
	describeMaterial,
	previewTasks,
	readChoice,
	readSize,
	sizeFromMinutes,
	taskBlockType,
	taskIndexOf,
	taskTags,
	type StoredBlock
} from './progress';
import type { Makeup, Mission, Task, Workout } from './workout';

const STARTED = new Date('2026-02-10T09:00:00Z');

const MISSION: Mission = {
	chartSlug: 'blues-12',
	chartName: 'Jazz blues',
	keyCenter: 'Eb',
	bpmFloor: 140,
	groove: 'swing',
	choruses: 2,
	rootless: false,
	coldSpot: null,
	band: null
};

const questions = (count: number): Goal => ({ kind: 'questions', count });

const TASKS: Record<string, Task> = {
	ear: {
		kind: 'ear',
		title: 'Ear',
		instruction: 'Listen, then play it back.',
		goal: questions(10),
		cardIds: ['a', 'b', 'c']
	},
	fn: {
		kind: 'function',
		title: 'The function',
		instruction: 'Play the chord the degree asks for.',
		goal: questions(8),
		cardIds: ['d', 'e']
	},
	mission: {
		kind: 'mission',
		title: 'Mission',
		instruction: 'Jazz blues in E♭.',
		goal: { kind: 'guide_tones', percent: 85, choruses: 2 },
		mission: MISSION
	},
	newThing: {
		kind: 'new_thing',
		title: 'One new thing',
		instruction: 'A rhythm section you have not played over.',
		goal: { kind: 'once' },
		novelty: { kind: 'groove', groove: 'bossa' }
	}
};

const workout = (tasks: Task[] = Object.values(TASKS)): Workout => ({
	version: 2,
	day: 20_493,
	size: 'standard',
	keyCenter: 'Eb',
	tasks,
	choice: null,
	coldSpots: [],
	novelty: { kind: 'groove', groove: 'bossa' },
	missionHeld: null
});

const stored = (plan: unknown = workout()) => ({
	id: 'session-1',
	startedAt: STARTED,
	planJson: plan
});

const block = (
	blockType: string,
	options: { id?: string; endedAt?: Date | null; result?: unknown } = {}
): StoredBlock => ({
	id: options.id ?? `block-${blockType}`,
	blockType,
	endedAt: options.endedAt ?? null,
	resultJson: options.result ?? null
});

/** What the six-block planner used to leave in `plan_json`. */
const V1_PLAN = {
	keyCenter: 'C',
	lengthMinutes: 20,
	blocks: [
		{ type: 'wheel_warmup', duration: 180, title: 'Warm up', instruction: '', cardIds: [] },
		{ type: 'ear_drill', duration: 240, title: 'Ear drill', instruction: '', cardIds: [] }
	],
	atomId: null,
	coldKeys: []
};

describe('a task names the row that records it', () => {
	it('says what it was and which one it was', () => {
		expect(taskBlockType('mission', 4)).toBe('mission_4');
		expect(taskBlockType('new_thing', 0)).toBe('new_thing_0');
	});

	it('reads the position back out of the name', () => {
		expect(taskIndexOf('ear_0')).toBe(0);
		expect(taskIndexOf('new_thing_2')).toBe(2);
	});

	it('tells the two missions of a long workout apart', () => {
		expect(taskBlockType('mission', 2)).not.toBe(taskBlockType('mission', 4));
	});

	// Every one of them, named against the type that keeps them alive: these are
	// rows in the database and no longer words the app can say, and a reader who
	// deletes `LegacyBlockType` as dead code fails here rather than in production.
	it('refuses to read a six-block session’s rows as tasks', () => {
		const old = [
			'wheel_warmup',
			'name_what_you_play',
			'ear_drill',
			'new_atom',
			'apply',
			'log'
		] satisfies LegacyBlockType[];

		for (const blockType of old) expect(taskIndexOf(blockType)).toBeNull();
	});

	it('refuses anything that is not a kind and a number', () => {
		expect(taskIndexOf('mission')).toBeNull();
		expect(taskIndexOf('mission_')).toBeNull();
		expect(taskIndexOf('mission_two')).toBeNull();
		expect(taskIndexOf('_0')).toBeNull();
	});
});

describe('telling a workout from what came before it', () => {
	it('recognises a stored workout by the version it stamped', () => {
		expect(isWorkout(workout())).toBe(true);
	});

	it('does not recognise a six-block plan, or anything else', () => {
		expect(isWorkout(V1_PLAN)).toBe(false);
		expect(isWorkout(null)).toBe(false);
		expect(isWorkout('a workout, honestly')).toBe(false);
	});
});

describe('picking a workout back up', () => {
	it('starts at the first task when nothing has been begun', () => {
		const active = hydrateWorkout(stored(), [])!;
		expect(active.resumeAt).toBe(0);
		expect(active.complete).toBe(false);
		expect(active.tasks.map((entry) => entry.task.kind)).toEqual([
			'ear',
			'function',
			'mission',
			'new_thing'
		]);
	});

	it('resumes at the first task no block has finished', () => {
		const active = hydrateWorkout(stored(), [
			block('ear_0', { endedAt: STARTED }),
			block('function_1')
		])!;
		expect(active.resumeAt).toBe(1);
	});

	it('carries the row a begun task is being recorded in, so a mission can name it', () => {
		const active = hydrateWorkout(stored(), [block('mission_2', { id: 'row-9' })])!;
		expect(active.tasks[2].blockId).toBe('row-9');
		expect(active.tasks[2].finished).toBe(false);
	});

	it('counts a mission finished by the run that met its goal', () => {
		const active = hydrateWorkout(stored(), [
			block('ear_0', { endedAt: STARTED }),
			block('function_1', { endedAt: STARTED }),
			block('mission_2', { endedAt: STARTED, result: { met: true, says: 'Met.' } })
		])!;
		expect(active.resumeAt).toBe(3);
		expect(active.tasks[2].result).toEqual({ met: true, says: 'Met.' });
	});

	it('is complete only when every task has ended', () => {
		const blocks = workout().tasks.map((task, index) =>
			block(taskBlockType(task.kind, index), { endedAt: STARTED })
		);
		const active = hydrateWorkout(stored(), blocks)!;
		expect(active.complete).toBe(true);
		expect(active.resumeAt).toBe(active.tasks.length);
	});

	it('leaves a six-block session where it lies rather than resuming it', () => {
		expect(
			hydrateWorkout(stored(V1_PLAN), [block('wheel_warmup', { endedAt: STARTED })])
		).toBeNull();
	});

	it('ignores a block naming a task the stored plan does not have', () => {
		const active = hydrateWorkout(stored(), [block('mission_9', { endedAt: STARTED })])!;
		expect(active.resumeAt).toBe(0);
		expect(active.tasks).toHaveLength(4);
	});
});

describe('previewing today’s tasks', () => {
	const preview = previewTasks(workout());

	it('previews one line per task, in the order they will be asked', () => {
		expect(preview.map((item) => item.kind)).toEqual(['ear', 'function', 'mission', 'new_thing']);
	});

	it('counts the questions, because a question is countable and a minute was not', () => {
		expect(preview[0].line).toContain('3');
		expect(preview[1].line).toContain('2');
	});

	it('names the tune a mission is set on and the bar it has to clear', () => {
		expect(preview[2].line).toContain('Jazz blues');
		expect(preview[2].line).toContain('85%');
	});

	it('leaves the mission’s key out, because a pinned choice moves it', () => {
		expect(preview[2].line).not.toContain('Eb');
	});
});

describe('what the picker pinned', () => {
	it('is nothing at all when nothing was chosen', () => {
		expect(readChoice({}, 'C')).toBeNull();
	});

	it('pins a progression in the key the picker sent', () => {
		expect(readChoice({ progressionId: 'ii-V-I', progressionKey: 'Ab' }, 'C')).toEqual({
			kind: 'progression',
			progressionId: 'ii-V-I',
			keyCenter: 'Ab'
		});
	});

	it('puts a progression where the ladder is when no key came with it', () => {
		const choice = readChoice({ progressionId: 'ii-V-I' }, 'G');
		expect(choice).toEqual({ kind: 'progression', progressionId: 'ii-V-I', keyCenter: 'G' });
	});

	it('pins a rung anywhere on the ladder, including further along than you have got', () => {
		expect(readChoice({ focusKey: 'Gb', focusRung: 'all-sevenths' }, 'C')).toEqual({
			kind: 'rung',
			key: 'Gb',
			rungId: 'all-sevenths'
		});
	});

	it('ignores a key or a rung that does not exist, rather than inventing material', () => {
		expect(readChoice({ focusKey: 'H', focusRung: 'scale' }, 'C')).toBeNull();
		expect(readChoice({ focusKey: 'C', focusRung: 'quartal-voicings' }, 'C')).toBeNull();
		expect(readChoice({ progressionId: 'nothing-like-this' }, 'C')).toBeNull();
	});
});

describe('the three sizes', () => {
	it('takes the size the picker sent', () => {
		expect(readSize('short')).toBe('short');
		expect(readSize('long')).toBe('long');
	});

	it('gives a standard workout to anything it does not recognise', () => {
		expect(readSize('20')).toBe('standard');
		expect(readSize(null)).toBe('standard');
	});

	it('reads a saved length preference as the size it was asking for', () => {
		expect(sizeFromMinutes(10)).toBe('short');
		expect(sizeFromMinutes(20)).toBe('standard');
		expect(sizeFromMinutes(35)).toBe('long');
	});
});

describe('saying what a task is made of', () => {
	const makeup = (over: Partial<Makeup> = {}): Makeup => ({
		keys: ['C'],
		skills: ['rung:scale'],
		fresh: 0,
		seen: 4,
		...over
	});

	it('names the keys with real accidentals and the topics in lower case', () => {
		expect(describeMaterial(makeup({ keys: ['Bb', 'F#'], skills: ['rung:tonic-triad'] }))).toBe(
			'B♭, F♯ · the home chord'
		);
	});

	it('caps a long list rather than printing all of it', () => {
		const line = describeMaterial(makeup({ keys: ['C', 'G', 'F', 'D', 'Bb'] }));
		expect(line).toContain('C, G, F +2');
		expect(line).not.toContain('Bb');
	});

	it('drops a skill code that names nothing rather than printing the code', () => {
		expect(describeMaterial(makeup({ skills: ['rung:gone'] }))).toBe('C');
	});

	it('says nothing at all about a task with no makeup recorded', () => {
		expect(describeMaterial(undefined)).toBe('');
	});
});

describe('the chips beside a task', () => {
	const drill = (makeup: Makeup | undefined): Task => ({
		kind: 'ear',
		title: 'Ear',
		instruction: '',
		goal: { kind: 'questions', count: 1 },
		cardIds: ['a'],
		makeup
	});

	const base: Makeup = { keys: ['C'], skills: [], fresh: 0, seen: 0 };

	it('says all new, or all revision, in one chip', () => {
		expect(taskTags(drill({ ...base, fresh: 6 }))).toEqual(['all new']);
		expect(taskTags(drill({ ...base, seen: 6 }))).toEqual(['all revision']);
	});

	it('splits a mixture, new first', () => {
		expect(taskTags(drill({ ...base, fresh: 2, seen: 8 }))).toEqual(['2 new', '8 again']);
	});

	it('says nothing where nothing is recorded', () => {
		expect(taskTags(drill(undefined))).toEqual([]);
		expect(taskTags(drill(base))).toEqual([]);
	});

	it('says whether a mission’s tune has been met', () => {
		const mission = (playedBefore: number | undefined): Task => ({
			kind: 'mission',
			title: 'Mission',
			instruction: '',
			goal: { kind: 'choruses', count: 1 },
			mission: { ...MISSION, playedBefore }
		});
		expect(taskTags(mission(0))).toEqual(['first time']);
		expect(taskTags(mission(4))).toEqual(['played 4×']);
		expect(taskTags(mission(undefined))).toEqual([]);
	});

	it('says nothing beside the new thing, which is new by its own name', () => {
		expect(
			taskTags({
				kind: 'new_thing',
				title: 'One new thing',
				instruction: '',
				goal: { kind: 'once' },
				novelty: { kind: 'groove', groove: 'bossa' }
			})
		).toEqual([]);
	});
});
