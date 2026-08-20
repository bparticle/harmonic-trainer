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
	type BlockResultPayload,
	type Flush,
	type RunPayload,
	type StorageLike
} from './run';
import { emptyTally, type Tally } from './match';
import { evaluateGoal } from './goal';

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
	sessionBlockId: null,
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

/** A real verdict, from the real evaluator, so the wire carries the real shape. */
const blockResult = (blockId: string, runId: string): BlockResultPayload => ({
	blockId,
	runId,
	verdict: evaluateGoal({ kind: 'choruses', count: 1 }, [], {
		chartSlug: 'blues-12',
		keyCenter: 'C',
		bpm: 140,
		barsPerChorus: 12
	})
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

/** A post with only the parts a test cares about; the rest is empty. */
const post = (parts: Partial<Flush>): Flush => ({ ...emptyFlush(), ...parts });

describe('the outbox', () => {
	let store: ReturnType<typeof memoryStore>;
	beforeEach(() => (store = memoryStore()));

	it('starts empty', () => {
		expect(readOutbox(store)).toEqual(emptyFlush());
		expect(isEmpty(readOutbox(store))).toBe(true);
	});

	it('keeps a run across a reload', () => {
		queue(store, post({ runs: [run('run-a')], badges: [] }));
		expect(readOutbox(store).runs.map((r) => r.id)).toEqual(['run-a']);
	});

	it('merges a second sitting into the same post', () => {
		queue(store, post({ runs: [run('run-a')], badges: [badge('nice')] }));
		queue(store, post({ runs: [run('run-b')], badges: [badge('cooking')] }));

		const waiting = readOutbox(store);
		expect(waiting.runs.map((r) => r.id)).toEqual(['run-a', 'run-b']);
		expect(waiting.badges.map((b) => b.tier)).toEqual(['nice', 'cooking']);
	});

	it('never queues the same run twice', () => {
		queue(store, post({ runs: [run('run-a')], badges: [] }));
		queue(store, post({ runs: [run('run-a')], badges: [] }));
		expect(readOutbox(store).runs).toHaveLength(1);
	});

	/* First earned wins on this side too, so a replay cannot rewrite a date. */
	it('keeps the first badge when the same one is queued again', () => {
		queue(store, post({ runs: [], badges: [badge('nice')] }));
		queue(
			store,
			post({ runs: [], badges: [{ ...badge('nice'), wonAt: '2027-01-01T00:00:00.000Z' }] })
		);

		expect(readOutbox(store).badges).toHaveLength(1);
		expect(readOutbox(store).badges[0].wonAt).toBe('2026-08-17T10:02:00.000Z');
	});

	it('tells the same tier on two tunes apart', () => {
		queue(store, post({ runs: [], badges: [badge('nice'), badge('nice', 'ja-da')] }));
		expect(readOutbox(store).badges).toHaveLength(2);
	});

	it('empties the key entirely once everything has been accepted', () => {
		const sent: Flush = post({ runs: [run('run-a')], badges: [badge('nice')] });
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
		const sent: Flush = post({ runs: [run('run-a')], badges: [] });
		queue(store, sent);
		queue(store, post({ runs: [run('run-b')], badges: [badge('fire')] }));
		settle(store, sent);

		const left = readOutbox(store);
		expect(left.runs.map((r) => r.id)).toEqual(['run-b']);
		expect(left.badges.map((b) => b.tier)).toEqual(['fire']);
	});

	/*
	 * A mission played with the network away follows the run's fate and not one of
	 * its own. There is no second queue: the verdict waits in this one beside the
	 * run that earned it, and until the post lands the block is simply not
	 * finished yet.
	 */
	it('keeps a mission verdict waiting beside the run that earned it', () => {
		queue(store, post({ runs: [run('run-a')], blocks: [blockResult('block-1', 'run-a')] }));

		const waiting = readOutbox(store);
		expect(waiting.blocks).toHaveLength(1);
		expect(waiting.blocks[0].runId).toBe('run-a');
		expect(isEmpty(waiting)).toBe(false);
	});

	it('tells two attempts at the same mission apart', () => {
		queue(store, post({ blocks: [blockResult('block-1', 'run-a')] }));
		queue(store, post({ blocks: [blockResult('block-1', 'run-b')] }));
		expect(readOutbox(store).blocks).toHaveLength(2);
	});

	it('drops a verdict once it has been accepted and keeps the rest', () => {
		const sent = post({ blocks: [blockResult('block-1', 'run-a')] });
		queue(store, sent);
		queue(store, post({ blocks: [blockResult('block-2', 'run-b')] }));
		settle(store, sent);

		expect(readOutbox(store).blocks.map((b) => b.blockId)).toEqual(['block-2']);
	});

	it('reads an outbox written before missions existed', () => {
		// A browser holding a run from last week has no `blocks` in it, and that run
		// belonged to no session anyway.
		store.setItem(OUTBOX_KEY, JSON.stringify({ runs: [run('run-a')], badges: [] }));
		expect(readOutbox(store).blocks).toEqual([]);
		expect(readOutbox(store).runs).toHaveLength(1);
	});

	it('drops an outbox it did not write rather than trusting it', () => {
		store.setItem(OUTBOX_KEY, 'not json at all');
		expect(readOutbox(store)).toEqual(emptyFlush());

		store.setItem(OUTBOX_KEY, JSON.stringify({ runs: 'lots' }));
		expect(readOutbox(store)).toEqual(emptyFlush());
	});
});
