import { error, json, type RequestHandler } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { takes } from '$lib/server/db/schema';
import { decodeSmf } from '$lib/midi/smf';

/**
 * Captured takes.
 *
 * The primary key comes from the client so a take created offline keeps its
 * identity when it is eventually flushed, and re-sending the same take is a
 * no-op rather than a duplicate.
 *
 * The blob is decoded here before it is stored — not to transform it, but to
 * refuse anything that is not actually a readable MIDI file. A take that cannot
 * be parsed is worse than no take, because it looks like data until the day it
 * is needed.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.authed) error(401, 'Not signed in');

	let body: {
		id?: string;
		sessionId?: string | null;
		midiBase64?: string;
		bpm?: number;
		durationMs?: number;
		tags?: string[];
	};
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected JSON');
	}

	if (!body.id || !/^[0-9a-f-]{36}$/i.test(body.id)) error(400, 'A take needs a UUID');
	if (typeof body.midiBase64 !== 'string' || body.midiBase64.length === 0) {
		error(400, 'A take needs its MIDI');
	}

	let bytes: Uint8Array;
	try {
		bytes = Uint8Array.from(Buffer.from(body.midiBase64, 'base64'));
		decodeSmf(bytes);
	} catch (e) {
		error(400, `Unreadable MIDI: ${e instanceof Error ? e.message : 'unknown'}`);
	}

	const [row] = await db
		.insert(takes)
		.values({
			id: body.id,
			sessionId: body.sessionId ?? null,
			midiBlob: bytes,
			bpm: body.bpm ?? null,
			durationMs: Math.max(0, Math.round(body.durationMs ?? 0)),
			tags: body.tags ?? []
		})
		.onConflictDoNothing()
		.returning({ id: takes.id, ts: takes.ts });

	return json({ id: row?.id ?? body.id, stored: Boolean(row) });
};

/** Recent takes, newest first. The blob is left out; it is fetched per take. */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.authed) error(401, 'Not signed in');

	const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)));
	const rows = await db
		.select({
			id: takes.id,
			ts: takes.ts,
			bpm: takes.bpm,
			durationMs: takes.durationMs,
			tags: takes.tags
		})
		.from(takes)
		.orderBy(desc(takes.ts))
		.limit(limit);

	return json(rows);
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
	if (!locals.authed) error(401, 'Not signed in');
	const id = url.searchParams.get('id');
	if (!id) error(400, 'Which take?');
	await db.delete(takes).where(eq(takes.id, id));
	return json({ deleted: id });
};
