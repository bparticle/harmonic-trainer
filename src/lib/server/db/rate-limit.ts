import { and, count, eq, gte } from 'drizzle-orm';
import { db } from './index';
import { rateLimitEvents, type RateLimitKind } from './schema';

/**
 * How far back a window reaches. Pure, so the arithmetic is checkable
 * without a database — the rest of this file is a thin insert and a thin
 * count, the same shape `accounts.ts` already leaves untested in the fast
 * suite (see CONTRIBUTING.md: a query is not logic to unit-test around).
 */
export function windowStart(now: Date, windowMinutes: number): Date {
	return new Date(now.getTime() - windowMinutes * 60_000);
}

/** Record one failed sign-in or one reset request, for `key` (a normalised email). */
export async function recordEvent(key: string, kind: RateLimitKind): Promise<void> {
	await db.insert(rateLimitEvents).values({ key, kind });
}

/** Whether `key` has already made `max` or more `kind` attempts inside the window. */
export async function isRateLimited(
	key: string,
	kind: RateLimitKind,
	{ windowMinutes, max }: { windowMinutes: number; max: number },
	now = new Date()
): Promise<boolean> {
	const [row] = await db
		.select({ n: count() })
		.from(rateLimitEvents)
		.where(
			and(
				eq(rateLimitEvents.key, key),
				eq(rateLimitEvents.kind, kind),
				gte(rateLimitEvents.createdAt, windowStart(now, windowMinutes))
			)
		);
	return (row?.n ?? 0) >= max;
}

/** Sign-in and reset-request limits. Named constants so a future adjustment
 *  is one line, not an archaeology dig through the routes that use them. */
export const SIGN_IN_LIMIT = { windowMinutes: 15, max: 8 };
export const RESET_REQUEST_LIMIT = { windowMinutes: 60, max: 3 };
