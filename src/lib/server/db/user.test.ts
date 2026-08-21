import { describe, expect, it } from 'vitest';
import { LOCAL_PLAYER_ID, currentUserId } from './user';

describe('resolved request user', () => {
	it('returns the account id resolved by the hook', () => {
		expect(currentUserId(LOCAL_PLAYER_ID)).toBe(LOCAL_PLAYER_ID);
		expect(currentUserId('11111111-2222-4333-8444-555555555555')).toBe(
			'11111111-2222-4333-8444-555555555555'
		);
	});

	it('refuses an unauthenticated request', () => {
		expect(() => currentUserId(null)).toThrow('No signed-in user');
	});
});
