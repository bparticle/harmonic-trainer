import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { isRateLimited, recordEvent } from './rate-limit';
import { rateLimitEvents } from './schema';
import { db } from './test-helpers';

/** Every test uses a key unique to itself, so a previous or concurrent run's
 *  rows never bleed into this one's counts — and cleans its own rows up
 *  afterward rather than leaving them for the next run to work around. */
describe('rate limiting', () => {
	let usedKeys: string[] = [];

	afterEach(async () => {
		for (const key of usedKeys) {
			await db.delete(rateLimitEvents).where(eq(rateLimitEvents.key, key));
		}
		usedKeys = [];
	});

	function freshKey(label: string) {
		const key = `rate-limit-test-${label}-${randomUUID()}@test.invalid`;
		usedKeys.push(key);
		return key;
	}

	it('stays open below the limit and locks at it', async () => {
		const key = freshKey('threshold');
		const limit = { windowMinutes: 15, max: 3 };

		for (let i = 0; i < 2; i += 1) {
			expect(await isRateLimited(key, 'sign_in_failed', limit)).toBe(false);
			await recordEvent(key, 'sign_in_failed');
		}

		// Two recorded, limit is 3: still open.
		expect(await isRateLimited(key, 'sign_in_failed', limit)).toBe(false);
		await recordEvent(key, 'sign_in_failed');
		// Three recorded: locked.
		expect(await isRateLimited(key, 'sign_in_failed', limit)).toBe(true);
	});

	it('counts sign-in failures and reset requests separately', async () => {
		const key = freshKey('kinds');
		const limit = { windowMinutes: 15, max: 1 };

		await recordEvent(key, 'sign_in_failed');
		expect(await isRateLimited(key, 'sign_in_failed', limit)).toBe(true);
		expect(await isRateLimited(key, 'reset_request', limit)).toBe(false);
	});

	it('ignores events outside the window', async () => {
		const key = freshKey('old');
		const limit = { windowMinutes: 15, max: 1 };

		await db.insert(rateLimitEvents).values({
			key,
			kind: 'sign_in_failed',
			createdAt: new Date(Date.now() - 20 * 60_000)
		});

		expect(await isRateLimited(key, 'sign_in_failed', limit)).toBe(false);
	});
});
