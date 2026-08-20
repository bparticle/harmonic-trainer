import { beforeEach, describe, expect, it } from 'vitest';
import {
	OUTBOX_KEY,
	emptyFlush,
	isEmpty,
	queue,
	readOutbox,
	settle,
	tallyColumns,
	type BadgePayload,
	type Flush,
	type RunPayload,
	type StorageLike
} from './run';
import { emptyTally, type Tally } from './match';

/** Enough of a Storage to exercise the outbox without a browser. */
function memoryStore(): StorageLike & { raw: Map<string, string> } {
	const raw = new Map<string, string>();
	return {
		raw,
		getItem: (key) => raw.get(key) ?? null,
		setItem: (key, value) => void raw.set(key, value),
		removeItem: (key) => void raw.delete(key)
	};
}

const run = (id: string): RunPayload => ({
	id,
	chartSlug: 'blues-12',
	chartId: null,
	keyCenter: 'C',
	bpm: 140,
	groove: 'swing',
	startedAt: '2026-08-17T10:00:00.000Z',
	endedAt: '2026-08-17T10:04:00.000Z',
	playingMs: 240_000,
	voiced: 24,
	landed: 20,
	partial: 3,
	missed: 1,
	notesChord: 60,
	notesColour: 12,
	notesOutside: 2,
	bestStreak: 12,
	attempts: []
});

const badge = (tier: string, chartSlug = 'blues-12'): BadgePayload => ({
	chartSlug,
	tier,
	wonAt: '2026-08-17T10:02:00.000Z',
	count: 12,
	pc: 5,
	keyCenter: 'C',
	runId: 'run-a'
});

describe('flattening a tally', () => {
	it('lays the seven numbers out as the columns that hold them', () => {
		const tally: Tally = {
			...emptyTally(),
			voiced: 9,
			landed: 7,
			partial: 1,
			missed: 1,
			notes: { chord: 30, colour: 4, outside: 2 }
		};

		expect(tallyColumns(tally)).toEqual({
			voiced: 9,
			landed: 7,
			partial: 1,
			missed: 1,
			notesChord: 30,
			notesColour: 4,
			notesOutside: 2
		});
	});
});

describe('the outbox', () => {
	let store: ReturnType<typeof memoryStore>;
	beforeEach(() => (store = memoryStore()));

	it('starts empty', () => {
		expect(readOutbox(store)).toEqual(emptyFlush());
		expect(isEmpty(readOutbox(store))).toBe(true);
	});

	it('keeps a run across a reload', () => {
		queue(store, { runs: [run('run-a')], badges: [] });
		expect(readOutbox(store).runs.map((r) => r.id)).toEqual(['run-a']);
	});

	it('merges a second sitting into the same post', () => {
		queue(store, { runs: [run('run-a')], badges: [badge('nice')] });
		queue(store, { runs: [run('run-b')], badges: [badge('cooking')] });

		const waiting = readOutbox(store);
		expect(waiting.runs.map((r) => r.id)).toEqual(['run-a', 'run-b']);
		expect(waiting.badges.map((b) => b.tier)).toEqual(['nice', 'cooking']);
	});

	it('never queues the same run twice', () => {
		queue(store, { runs: [run('run-a')], badges: [] });
		queue(store, { runs: [run('run-a')], badges: [] });
		expect(readOutbox(store).runs).toHaveLength(1);
	});

	/* First earned wins on this side too, so a replay cannot rewrite a date. */
	it('keeps the first badge when the same one is queued again', () => {
		queue(store, { runs: [], badges: [badge('nice')] });
		queue(store, { runs: [], badges: [{ ...badge('nice'), wonAt: '2027-01-01T00:00:00.000Z' }] });

		expect(readOutbox(store).badges).toHaveLength(1);
		expect(readOutbox(store).badges[0].wonAt).toBe('2026-08-17T10:02:00.000Z');
	});

	it('tells the same tier on two tunes apart', () => {
		queue(store, { runs: [], badges: [badge('nice'), badge('nice', 'ja-da')] });
		expect(readOutbox(store).badges).toHaveLength(2);
	});

	it('empties the key entirely once everything has been accepted', () => {
		const sent: Flush = { runs: [run('run-a')], badges: [badge('nice')] };
		queue(store, sent);
		settle(store, sent);

		expect(isEmpty(readOutbox(store))).toBe(true);
		expect(store.raw.has(OUTBOX_KEY)).toBe(false);
	});

	/*
	 * The sitting where somebody is playing hard enough for this to matter: a run
	 * finishes while the previous post is still in flight, and clearing the whole
	 * key would throw it away.
	 */
	it('keeps a run that arrived while the post was in flight', () => {
		const sent: Flush = { runs: [run('run-a')], badges: [] };
		queue(store, sent);
		queue(store, { runs: [run('run-b')], badges: [badge('fire')] });
		settle(store, sent);

		const left = readOutbox(store);
		expect(left.runs.map((r) => r.id)).toEqual(['run-b']);
		expect(left.badges.map((b) => b.tier)).toEqual(['fire']);
	});

	it('drops an outbox it did not write rather than trusting it', () => {
		store.setItem(OUTBOX_KEY, 'not json at all');
		expect(readOutbox(store)).toEqual(emptyFlush());

		store.setItem(OUTBOX_KEY, JSON.stringify({ runs: 'lots' }));
		expect(readOutbox(store)).toEqual(emptyFlush());
	});
});
