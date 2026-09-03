import { BADGE_TIERS } from '$lib/effects/streak';
import { stationHolding } from '$lib/curriculum/ladder';
import { keyTonic } from '$lib/music/key';
import type { Verdict } from '$lib/practice/goal';
import type { Workout } from './workout';

/**
 * What actually changed.
 *
 * The end screen of a workout, and the whole of its discipline is in one rule:
 * **every figure traces to a row.** Accuracy is the reviews this workout graded,
 * counted; the comparison is the same count over the last workout that asked
 * anything; a cold key is a key the record held nothing in before today; a badge
 * is a `badges` row won by a run this workout set. Where a number would have to
 * be estimated it is not shown — which is why there is no time-at-the-piano
 * figure here, no "improvement" percentage, and nothing at all on a workout that
 * asked nothing.
 *
 * Pure, and given rows rather than a database, so what the screen says can be
 * checked without one. The store next door does the counting; this decides what
 * is worth saying about it, and refuses to say anything the counts do not
 * support.
 *
 * Two things it deliberately does not do. It never phrases a figure as a loss —
 * "four points under last time" is a fact and "you got worse" is a telling-off,
 * and this app has never told anyone off. And it never fills a quiet day with
 * something warmer: a workout where the rows say little says little.
 */

export type Asked = { asked: number; correct: number };

/** A key the workout touched, and what the record held there beforehand. */
export type KeyTouched = { keyCenter: string; heldBefore: number };

export type BadgeWon = { tier: string; chartSlug: string; count: number };

export type ReportInput = {
	workout: Workout;
	/** Blocks of this workout with an `ended_at`. */
	tasksFinished: number;
	/** Reviews graded in this workout. */
	answered: Asked;
	/** The same count over the last workout that asked anything, or null. */
	previous: Asked | null;
	/** Verdicts recorded on this workout's mission blocks. */
	verdicts: Verdict[];
	keysTouched: KeyTouched[];
	badges: BadgeWon[];
};

export type WorkoutReport = {
	tasksFinished: number;
	tasksTotal: number;
	keyCenter: string;
	/** Null when nothing was asked. A percentage of nothing is not a percentage. */
	accuracy: (Asked & { percent: number }) | null;
	/** Last time's percentage and the distance to it, in points. */
	against: { percent: number; delta: number } | null;
	missions: Array<{ met: boolean; says: string; chartName: string }>;
	/** Only keys the record held nothing in before today. */
	coldKeys: string[];
	/**
	 * Every station the run actually reached, in the order the rows were written.
	 *
	 * The bookend to the board's *calls at*. That row is a forecast composed
	 * before anything is answered; this is the register, off `chord_attempts` and
	 * `reviews` — and a workout is the one thing in this app where the two can
	 * honestly differ, because a queue that runs short stops early. Saying what
	 * the run did is the only version of the sentence that is a fact.
	 */
	calledAt: string[];
	badges: Array<BadgeWon & { name: string }>;
	/** The lines the end screen shows, in order, and nothing beyond them. */
	says: string[];
};

const percentOf = (count: Asked): number => Math.round((count.correct / count.asked) * 100);

/** The tier's own word for itself, so the end screen and the shelf agree. */
const tierName = (id: string): string => BADGE_TIERS.find((tier) => tier.id === id)?.name ?? id;

const plural = (count: number, one: string, many = `${one}s`) => (count === 1 ? one : many);

/**
 * What this workout has to show for itself.
 *
 * Assembled in the order the screen reads it: what was done, how it went against
 * last time, what the missions said, where it went that the record had never
 * been, and what was won. Each line appears only if its rows do.
 */
export function reportWorkout(input: ReportInput): WorkoutReport {
	const tasksTotal = input.workout.tasks.length;
	const answered = input.answered;
	const accuracy = answered.asked > 0 ? { ...answered, percent: percentOf(answered) } : null;

	const against =
		accuracy && input.previous && input.previous.asked > 0
			? {
					percent: percentOf(input.previous),
					delta: accuracy.percent - percentOf(input.previous)
				}
			: null;

	const missions = input.verdicts.map((verdict) => ({
		met: verdict.met,
		says: verdict.says,
		chartName: chartNameFor(input.workout, verdict.context.chartSlug)
	}));

	// Zero and nothing else. A key with three chords on record is a cold key and
	// the record can say so, but "three" and "three hundred" would need a
	// threshold nobody has evidence for — where the row count is zero there is no
	// judgement being made at all.
	const coldKeys = [
		...new Set(
			input.keysTouched.filter((key) => key.heldBefore === 0).map((key) => keyTonic(key.keyCenter))
		)
	];

	const badges = input.badges.map((badge) => ({ ...badge, name: tierName(badge.tier) }));

	// Stations rather than keys, so a run that asked about C and about A minor
	// reports one stop and not two. Order of first touch, which is the order the
	// rows were written.
	const calledAt: string[] = [];
	for (const touched of input.keysTouched) {
		const station = stationHolding(touched.keyCenter) ?? keyTonic(touched.keyCenter);
		if (!calledAt.includes(station)) calledAt.push(station);
	}

	const says: string[] = [
		`${input.tasksFinished}/${tasksTotal} ${plural(tasksTotal, 'task')} · ${input.workout.keyCenter}`
	];

	if (accuracy) {
		says.push(
			`${accuracy.correct}/${accuracy.asked} right · ${accuracy.percent}%${sinceLastTime(against)}`
		);
	}

	for (const mission of missions) {
		says.push(`${mission.chartName} · ${mission.says}`);
	}

	// Only where it says something the first line does not: a run that stayed at
	// one station has already named it.
	if (calledAt.length > 1) {
		says.push(`Called at ${calledAt.join(', ')}.`);
	}

	for (const key of coldKeys) {
		says.push(`First play in ${key}.`);
	}

	for (const badge of badges) {
		says.push(`${badge.name} · ${badge.count} in a row · ${badge.chartSlug}`);
	}

	return {
		tasksFinished: input.tasksFinished,
		tasksTotal,
		keyCenter: input.workout.keyCenter,
		accuracy,
		against,
		missions,
		coldKeys,
		calledAt,
		badges,
		says
	};
}

/**
 * The comparison, said without making it a verdict.
 *
 * A workout below last time's percentage is a workout below last time's
 * percentage: the number is reported and nothing is drawn from it. Rebuilding
 * this sentence around "worse" would make the end screen the first thing in the
 * app that tells you off, on the day you practised something hard.
 */
function sinceLastTime(against: { percent: number; delta: number } | null): string {
	if (!against) return '';
	if (against.delta === 0) return ` · same as last`;
	const points = Math.abs(against.delta);
	return against.delta > 0
		? ` · +${points} vs ${against.percent}%`
		: ` · −${points} vs ${against.percent}%`;
}

/** The tune's name as the workout wrote it down, falling back to the slug. */
function chartNameFor(workout: Workout, chartSlug: string): string {
	for (const task of workout.tasks) {
		if (task.kind === 'mission' && task.mission.chartSlug === chartSlug)
			return task.mission.chartName;
	}
	return chartSlug;
}
