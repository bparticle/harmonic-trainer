import { error, json, type RequestHandler } from '@sveltejs/kit';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { charts } from '$lib/server/db/schema';
import { currentUserId } from '$lib/server/db/user';
import { loadBests, loadRecord, saveFlush } from '$lib/server/db/play-log';
import { BADGE_TIERS } from '$lib/effects/streak';
import type { AttemptPayload, BadgePayload, Flush, RunPayload } from '$lib/practice/run';

/**
 * Where a run of the transport is written down.
 *
 * One post per flush, carrying the runs, their chords and any badges earned, in
 * one transaction. Everything is keyed on ids the browser generated, so a
 * request that timed out can simply be sent again — see `saveFlush`.
 *
 * Nothing here trusts the body. It arrives from a page that is also a local
 * cache the player can edit, and the difference between "the client is on our
 * side" and "the client is ours" is the difference between a personal instance
 * and the hosted one this is being built towards.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LANDINGS = new Set(['landed', 'partial', 'missed']);
const TIERS = new Set(BADGE_TIERS.map((tier) => tier.id));

/*
 * Ceilings, not guesses. A run is a sitting at a piano: an hour of playing is a
 * few thousand chords, and nothing on this page can produce more than one run
 * per press of stop. They exist so a broken client cannot write an unbounded
 * number of rows, not to tell anybody how long to practise.
 *
 * `MAX_FLUSH_ATTEMPTS` is the one that actually bounds the work. Per-run caps
 * multiply — a hundred runs of twenty thousand chords is two million rows in
 * one transaction — so the budget is spent across the whole post and the rest
 * of that post is still accepted. A week stuck offline is a few thousand
 * chords, so nothing real comes anywhere near it.
 */
const MAX_RUNS = 100;
const MAX_ATTEMPTS = 20_000;
const MAX_FLUSH_ATTEMPTS = 50_000;
const MAX_TEXT = 120;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.authed) error(401, 'Not signed in');
	const userId = currentUserId(locals.userId);

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected JSON');
	}

	if (typeof body !== 'object' || body === null) error(400, 'Expected an object');
	const raw = body as Record<string, unknown>;

	const runs = Array.isArray(raw.runs) ? raw.runs.slice(0, MAX_RUNS) : [];
	const badgeList = Array.isArray(raw.badges) ? raw.badges.slice(0, MAX_RUNS * 6) : [];

	const flush: Flush = {
		runs: runs.flatMap((run) => parseRun(run)),
		badges: badgeList.flatMap((badge) => parseBadge(badge))
	};

	// Spend the attempt budget oldest run first, and keep every run either way:
	// losing the chords off the end of a long sitting is a smaller loss than
	// losing that the sitting happened, and the run's own totals still stand.
	let budget = MAX_FLUSH_ATTEMPTS;
	for (const run of flush.runs) {
		run.attempts = run.attempts.slice(0, Math.max(0, budget));
		budget -= run.attempts.length;
	}

	// A chart id is only allowed to name one of yours. Today that is every chart
	// with an owner; the check is here because "it happens to be true" and "the
	// database will not let it be otherwise" are different guarantees.
	await keepOwnCharts(userId, flush);

	await saveFlush(userId, flush);

	// Hand back what the record now says, so the page's cache is corrected by the
	// answer rather than by its own optimism.
	return json({
		accepted: flush.runs.length,
		record: await loadRecord(userId),
		bests: await loadBests(userId)
	});
};

async function keepOwnCharts(userId: string, flush: Flush): Promise<void> {
	const claimed = [
		...new Set(flush.runs.map((run) => run.chartId).filter((id): id is string => !!id))
	];
	if (claimed.length === 0) return;

	const rows = await db
		.select({ id: charts.id })
		.from(charts)
		.where(and(inArray(charts.id, claimed), eq(charts.userId, userId)));

	const mine = new Set(rows.map((row) => row.id));
	for (const run of flush.runs) {
		if (run.chartId && !mine.has(run.chartId)) run.chartId = null;
	}
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** A whole non-negative number, or nothing. */
function count(value: unknown, max = 1_000_000): number | null {
	const number = Number(value);
	if (!Number.isFinite(number) || number < 0 || number > max) return null;
	return Math.floor(number);
}

function text(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed && trimmed.length <= MAX_TEXT ? trimmed : null;
}

/** An ISO timestamp the browser wrote, or nothing. */
function when(value: unknown): Date | null {
	if (typeof value !== 'string') return null;
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * One run, or nothing at all.
 *
 * A run that does not parse is dropped rather than failing the whole post: the
 * rest of the sitting is real, and refusing all of it over one bad row would
 * cost somebody an evening's playing to punish a bug they did not write.
 */
function parseRun(value: unknown): RunPayload[] {
	if (!isObject(value)) return [];

	const id = typeof value.id === 'string' && UUID.test(value.id) ? value.id : null;
	const chartSlug = text(value.chartSlug);
	const keyCenter = text(value.keyCenter);
	// `feel` is what this was called before grooves existed. A browser can be
	// holding an unflushed run written by the old page, and dropping it over a
	// renamed field would lose a sitting to a rename.
	const groove = text(value.groove) ?? text(value.feel);
	const startedAt = when(value.startedAt);
	if (!id || !chartSlug || !keyCenter || !groove || !startedAt) return [];

	const numbers = {
		bpm: count(value.bpm, 400),
		playingMs: count(value.playingMs, 24 * 60 * 60 * 1000),
		voiced: count(value.voiced, MAX_ATTEMPTS),
		landed: count(value.landed, MAX_ATTEMPTS),
		partial: count(value.partial, MAX_ATTEMPTS),
		missed: count(value.missed, MAX_ATTEMPTS),
		notesChord: count(value.notesChord),
		notesColour: count(value.notesColour),
		notesOutside: count(value.notesOutside),
		bestStreak: count(value.bestStreak, MAX_ATTEMPTS)
	};
	if (Object.values(numbers).some((n) => n === null)) return [];

	const attempts = Array.isArray(value.attempts)
		? value.attempts.slice(0, MAX_ATTEMPTS).flatMap(parseAttempt)
		: [];

	const endedAt = when(value.endedAt);
	return [
		{
			id,
			chartSlug,
			chartId: typeof value.chartId === 'string' && UUID.test(value.chartId) ? value.chartId : null,
			keyCenter,
			groove,
			startedAt: startedAt.toISOString(),
			// A run cannot end before it started, whatever the clock on the machine
			// that wrote it thought.
			endedAt: endedAt && endedAt >= startedAt ? endedAt.toISOString() : null,
			...(numbers as Record<keyof typeof numbers, number>),
			attempts
		}
	];
}

function parseAttempt(value: unknown): AttemptPayload[] {
	if (!isObject(value)) return [];

	const id = typeof value.id === 'string' && UUID.test(value.id) ? value.id : null;
	const chord = text(value.chord);
	const numeral = text(value.numeral);
	const localKey = text(value.localKey);
	const landing = typeof value.landing === 'string' && LANDINGS.has(value.landing);
	if (!id || !chord || !numeral || !localKey || !landing) return [];

	const numbers = {
		bar: count(value.bar, 10_000),
		found: count(value.found, 12),
		needed: count(value.needed, 12),
		notesChord: count(value.notesChord, 10_000),
		notesColour: count(value.notesColour, 10_000),
		notesOutside: count(value.notesOutside, 10_000),
		atMs: count(value.atMs, 24 * 60 * 60 * 1000)
	};
	if (Object.values(numbers).some((n) => n === null)) return [];

	return [
		{
			id,
			chord,
			numeral,
			localKey,
			landing: value.landing as AttemptPayload['landing'],
			...(numbers as Record<keyof typeof numbers, number>)
		}
	];
}

function parseBadge(value: unknown): BadgePayload[] {
	if (!isObject(value)) return [];

	const chartSlug = text(value.chartSlug);
	const keyCenter = typeof value.keyCenter === 'string' ? value.keyCenter.slice(0, MAX_TEXT) : '';
	const tier = typeof value.tier === 'string' && TIERS.has(value.tier) ? value.tier : null;
	const wonAt = when(value.wonAt);
	const badgeCount = count(value.count, MAX_ATTEMPTS);
	const pc = count(value.pc, 11);
	if (!chartSlug || !tier || !wonAt || !badgeCount || pc === null) return [];

	return [
		{
			chartSlug,
			tier,
			wonAt: wonAt.toISOString(),
			count: badgeCount,
			pc,
			keyCenter,
			runId: typeof value.runId === 'string' && UUID.test(value.runId) ? value.runId : null
		}
	];
}
