import { describe, expect, it } from 'vitest';
import { LOCAL_PLAYER_ID, currentUserId } from './user';

/*
 * The seam, and the promise it currently keeps.
 *
 * There is one player. These tests exist so that stops being true loudly rather
 * than quietly: when M12 lands they should fail, and the failure is the
 * reminder that `SECURITY.md`, the README's opening claim and the landing copy
 * all have to change in the same release.
 */
describe('who a request is for', () => {
	it('resolves a cookie that names nobody to the local player', () => {
		// Every cookie minted before M9 carries a timestamp and no user.
		expect(currentUserId(null)).toBe(LOCAL_PLAYER_ID);
		expect(currentUserId()).toBe(LOCAL_PLAYER_ID);
	});

	it('resolves the local player to themselves', () => {
		expect(currentUserId(LOCAL_PLAYER_ID)).toBe(LOCAL_PLAYER_ID);
	});

	/*
	 * The point of the check. Nothing creates a second user, so a claim naming
	 * one is not a user — it is a string. Honouring it would let the number of
	 * accounts this app supports be decided by what was in somebody's browser.
	 */
	it('refuses a claim naming somebody who cannot exist', () => {
		for (const stranger of [
			'00000000-0000-4000-8000-000000000002',
			'11111111-2222-4333-8444-555555555555',
			'',
			'not-a-uuid',
			'; drop table users'
		]) {
			expect(currentUserId(stranger)).toBe(LOCAL_PLAYER_ID);
		}
	});

	it('is a uuid, so it can be a foreign key', () => {
		expect(LOCAL_PLAYER_ID).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
		);
	});
});
