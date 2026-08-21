import { describe, expect, it } from 'vitest';
import { LOCAL_PLAYER_ID } from './user';
import { normalizeEmail, sessionIsCurrent, type SessionUser } from './accounts';

const user = (id = LOCAL_PLAYER_ID, sessionEpoch = 0): SessionUser => ({
	id,
	name: 'Player',
	email: 'player@example.com',
	sessionEpoch
});

describe('account identity', () => {
	it('normalizes an address before lookup', () => {
		expect(normalizeEmail('  Player@Example.COM ')).toBe('player@example.com');
	});

	it('accepts only the current revocation epoch', () => {
		expect(
			sessionIsCurrent(user(LOCAL_PLAYER_ID, 4), { userId: LOCAL_PLAYER_ID, sessionEpoch: 4 })
		).toBe(true);
		expect(
			sessionIsCurrent(user(LOCAL_PLAYER_ID, 4), { userId: LOCAL_PLAYER_ID, sessionEpoch: 3 })
		).toBe(false);
		expect(
			sessionIsCurrent(user(LOCAL_PLAYER_ID, 4), {
				userId: '11111111-2222-4333-8444-555555555555',
				sessionEpoch: 4
			})
		).toBe(false);
	});

	it('accepts a legacy cookie only for the original owner before first revocation', () => {
		expect(sessionIsCurrent(user(), { userId: LOCAL_PLAYER_ID, sessionEpoch: null })).toBe(true);
		expect(
			sessionIsCurrent(user(LOCAL_PLAYER_ID, 1), { userId: LOCAL_PLAYER_ID, sessionEpoch: null })
		).toBe(false);
		expect(
			sessionIsCurrent(user('11111111-2222-4333-8444-555555555555'), {
				userId: '11111111-2222-4333-8444-555555555555',
				sessionEpoch: null
			})
		).toBe(false);
	});
});
