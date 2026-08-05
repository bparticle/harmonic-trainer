import { beforeEach, describe, expect, it, vi } from 'vitest';

// $env/dynamic/private is a SvelteKit virtual module; stub it for unit tests.
vi.mock('$env/dynamic/private', () => ({
	env: { AUTH_SECRET: 'test-secret-aaaaaaaaaaaaaaaaaaaaaaaa', APP_PASSWORD: 'correct horse' }
}));

const { checkPassword, issueToken, verifyToken } = await import('./auth');

describe('password check', () => {
	it('accepts the configured password', () => {
		expect(checkPassword('correct horse')).toBe(true);
	});

	it('rejects a wrong password', () => {
		expect(checkPassword('wrong horse')).toBe(false);
	});

	it('rejects a prefix of the password', () => {
		expect(checkPassword('correct')).toBe(false);
	});

	it('rejects an empty password', () => {
		expect(checkPassword('')).toBe(false);
	});
});

describe('session token', () => {
	it('round-trips a freshly issued token', () => {
		expect(verifyToken(issueToken())).toBe(true);
	});

	it('rejects undefined, empty and malformed tokens', () => {
		expect(verifyToken(undefined)).toBe(false);
		expect(verifyToken('')).toBe(false);
		expect(verifyToken('nodot')).toBe(false);
		expect(verifyToken('.onlysig')).toBe(false);
	});

	it('rejects a tampered signature', () => {
		const token = issueToken();
		const tampered = token.slice(0, -1) + (token.at(-1) === 'A' ? 'B' : 'A');
		expect(verifyToken(tampered)).toBe(false);
	});

	it('rejects a tampered timestamp', () => {
		const now = Date.now();
		const token = issueToken(now);
		const signature = token.slice(token.lastIndexOf('.') + 1);
		expect(verifyToken(`${now + 1}.${signature}`)).toBe(false);
	});

	it('expires after 90 days', () => {
		const now = Date.now();
		const token = issueToken(now);
		const day = 24 * 60 * 60 * 1000;
		expect(verifyToken(token, now + 89 * day)).toBe(true);
		expect(verifyToken(token, now + 91 * day)).toBe(false);
	});

	it('rejects a token issued in the future', () => {
		const now = Date.now();
		expect(verifyToken(issueToken(now + 60_000), now)).toBe(false);
	});
});
