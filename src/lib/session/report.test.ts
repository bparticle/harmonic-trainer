import { describe, expect, it } from 'vitest';
import type { Verdict } from '$lib/practice/goal';
import { reportWorkout, type ReportInput } from './report';
import type { Task, Workout } from './workout';

const MISSION_TASK: Task = {
	kind: 'mission',
	title: 'Mission',
	instruction: 'Jazz blues in E♭.',
	goal: { kind: 'guide_tones', percent: 85, choruses: 2 },
	mission: {
		chartSlug: 'blues-12',
		chartName: 'Jazz blues',
		keyCenter: 'Eb',
		bpmFloor: 140,
		groove: 'swing',
		choruses: 2,
		rootless: false,
		coldSpot: null,
		band: null
	}
};

const EAR_TASK: Task = {
	kind: 'ear',
	title: 'Ear',
	instruction: 'Listen, then play it back.',
	goal: { kind: 'questions', count: 10 },
	cardIds: ['a', 'b']
};

const WORKOUT: Workout = {
	version: 2,
	day: 20_493,
	size: 'standard',
	keyCenter: 'Eb',
	tasks: [EAR_TASK, MISSION_TASK],
	choice: null,
	coldSpots: [],
	novelty: null,
	missionHeld: null
};

const verdict = (met: boolean, says: string): Verdict => ({
	met,
	goal: { kind: 'guide_tones', percent: 85, choruses: 2 },
	context: { chartSlug: 'blues-12', keyCenter: 'Eb', bpm: 140, barsPerChorus: 12 },
	measured: { voiced: 24, landed: 21, percent: 88, coverage: 92, barsCovered: 24, choruses: 2 },
	shortfall: { percent: 0, choruses: 0 },
	says
});

const input = (overrides: Partial<ReportInput> = {}): ReportInput => ({
	workout: WORKOUT,
	tasksFinished: 2,
	answered: { asked: 0, correct: 0 },
	previous: null,
	verdicts: [],
	keysTouched: [],
	badges: [],
	...overrides
});

describe('what a workout has to show for itself', () => {
	it('counts the tasks it finished against the tasks it had', () => {
		const report = reportWorkout(input({ tasksFinished: 1 }));
		expect(report.tasksFinished).toBe(1);
		expect(report.tasksTotal).toBe(2);
		expect(report.says[0]).toBe('1 of 2 tasks in Eb.');
	});

	it('says nothing at all about accuracy when nothing was asked', () => {
		const report = reportWorkout(input());
		expect(report.accuracy).toBeNull();
		expect(report.says.join(' ')).not.toContain('%');
	});

	it('reports accuracy as the questions that were actually graded', () => {
		const report = reportWorkout(input({ answered: { asked: 18, correct: 14 } }));
		expect(report.accuracy).toEqual({ asked: 18, correct: 14, percent: 78 });
		expect(report.says[1]).toContain('14 of 18 right');
	});
});

describe('against last time', () => {
	it('compares with the last workout that asked something', () => {
		const report = reportWorkout(
			input({ answered: { asked: 10, correct: 9 }, previous: { asked: 10, correct: 8 } })
		);
		expect(report.against).toEqual({ percent: 80, delta: 10 });
		expect(report.says[1]).toContain("10 points up on last time's 80%");
	});

	it('says nothing about last time when there was no last time', () => {
		const report = reportWorkout(input({ answered: { asked: 4, correct: 4 } }));
		expect(report.against).toBeNull();
		expect(report.says[1]).toBe('4 of 4 right — 100%.');
	});

	it('states a shortfall as a distance and never as a failure', () => {
		const report = reportWorkout(
			input({ answered: { asked: 10, correct: 7 }, previous: { asked: 10, correct: 9 } })
		);
		expect(report.says[1]).toContain("20 points under last time's 90%");
		expect(report.says.join(' ').toLowerCase()).not.toContain('worse');
	});

	it('says so plainly when nothing moved', () => {
		const report = reportWorkout(
			input({ answered: { asked: 8, correct: 6 }, previous: { asked: 4, correct: 3 } })
		);
		expect(report.says[1]).toContain('the same as last time');
	});

	it('refuses to compare with a workout that graded nothing', () => {
		const report = reportWorkout(
			input({ answered: { asked: 5, correct: 5 }, previous: { asked: 0, correct: 0 } })
		);
		expect(report.against).toBeNull();
	});
});

describe('what the missions said', () => {
	it('quotes the verdict rather than re-deciding it', () => {
		const report = reportWorkout(
			input({ verdicts: [verdict(true, 'Met. 88% landed over 2 choruses.')] })
		);
		expect(report.missions[0].met).toBe(true);
		expect(report.says).toContain('Jazz blues: Met. 88% landed over 2 choruses.');
	});

	it('names the tune the workout set, not the slug it is filed under', () => {
		const report = reportWorkout(input({ verdicts: [verdict(false, '3 short of 85%.')] }));
		expect(report.missions[0].chartName).toBe('Jazz blues');
	});

	it('falls back to the slug for a verdict the workout has no mission for', () => {
		const stray = {
			...verdict(true, 'Met.'),
			context: { ...verdict(true, 'Met.').context, chartSlug: 'so-what' }
		};
		expect(reportWorkout(input({ verdicts: [stray] })).missions[0].chartName).toBe('so-what');
	});
});

describe('a cold key touched', () => {
	it('names a key the record held nothing in before today', () => {
		const report = reportWorkout(input({ keysTouched: [{ keyCenter: 'Gb', heldBefore: 0 }] }));
		expect(report.coldKeys).toEqual(['Gb']);
		expect(report.says).toContain('First time in Gb. The record held nothing there before today.');
	});

	it('says nothing about a key the record already had something in', () => {
		const report = reportWorkout(input({ keysTouched: [{ keyCenter: 'C', heldBefore: 588 }] }));
		expect(report.coldKeys).toEqual([]);
	});

	it('counts a key once however the record spelled it', () => {
		const report = reportWorkout(
			input({
				keysTouched: [
					{ keyCenter: 'Eb', heldBefore: 0 },
					{ keyCenter: 'Eb dorian', heldBefore: 0 },
					{ keyCenter: 'Ebm', heldBefore: 0 }
				]
			})
		);
		expect(report.coldKeys).toEqual(['Eb']);
	});
});

describe('a badge earned', () => {
	it('says which tier, on which tune, and what clinched it', () => {
		const report = reportWorkout(
			input({ badges: [{ tier: 'fire', chartSlug: 'blues-12', count: 13 }] })
		);
		expect(report.badges[0].name).toBe('on fire');
		expect(report.says).toContain('on fire — 13 in a row on blues-12. New badge.');
	});

	it('has nothing to say when none was won', () => {
		expect(reportWorkout(input()).badges).toEqual([]);
	});
});

describe('a quiet workout', () => {
	it('says only what the rows support, and does not fill the gap', () => {
		expect(reportWorkout(input()).says).toEqual(['2 of 2 tasks in Eb.']);
	});
});
