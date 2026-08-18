import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

// $env/dynamic/private is a SvelteKit virtual module; stub it for unit tests.
vi.mock('$env/dynamic/private', () => ({
	env: { AUTH_SECRET: 'test-secret-aaaaaaaaaaaaaaaaaaaaaaaa', APP_PASSWORD: 'correct horse' }
}));

const { checkPassword, issueToken, safeRedirectPath, verifyToken } = await import('./auth');

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
	const PLAYER = '00000000-0000-4000-8000-000000000001';

	it('round-trips a freshly issued token, and it names the user', () => {
		expect(verifyToken(issueToken(PLAYER))).toEqual({ userId: PLAYER });
	});

	it('rejects undefined, empty and malformed tokens', () => {
		expect(verifyToken(undefined)).toBeNull();
		expect(verifyToken('')).toBeNull();
		expect(verifyToken('nodot')).toBeNull();
		expect(verifyToken('.onlysig')).toBeNull();
	});

	it('rejects a tampered signature', () => {
		const token = issueToken(PLAYER);
		const tampered = token.slice(0, -1) + (token.at(-1) === 'A' ? 'B' : 'A');
		expect(verifyToken(tampered)).toBeNull();
	});

	it('rejects a tampered timestamp', () => {
		const now = Date.now();
		const token = issueToken(PLAYER, now);
		const signature = token.slice(token.lastIndexOf('.') + 1);
		expect(verifyToken(`${PLAYER}.${now + 1}.${signature}`)).toBeNull();
	});

	it('rejects a swapped user, which is the point of signing the payload whole', () => {
		const now = Date.now();
		const token = issueToken(PLAYER, now);
		const signature = token.slice(token.lastIndexOf('.') + 1);
		const other = '00000000-0000-4000-8000-000000000002';
		expect(verifyToken(`${other}.${now}.${signature}`)).toBeNull();
	});

	it('expires after 90 days', () => {
		const now = Date.now();
		const token = issueToken(PLAYER, now);
		const day = 24 * 60 * 60 * 1000;
		expect(verifyToken(token, now + 89 * day)).toEqual({ userId: PLAYER });
		expect(verifyToken(token, now + 91 * day)).toBeNull();
	});

	it('rejects a token issued in the future', () => {
		const now = Date.now();
		expect(verifyToken(issueToken(PLAYER, now + 60_000), now)).toBeNull();
	});

	it('rejects a timestamp that is not digits', () => {
		expect(verifyToken(signedPayload(` ${Date.now()}`))).toBeNull();
		expect(verifyToken(signedPayload(`${PLAYER}.0x10`))).toBeNull();
	});
});

/*
 * Cookies minted before the payload named anyone.
 *
 * Nobody is signed out by the upgrade: an old cookie still verifies and simply
 * names nobody, which `currentUserId` resolves to the local player.
 */
describe('a cookie from before users existed', () => {
	it('is still valid, and names nobody', () => {
		const now = Date.now();
		expect(verifyToken(signedPayload(String(now)), now)).toEqual({ userId: null });
	});

	it('still expires on the same schedule', () => {
		const now = Date.now();
		const day = 24 * 60 * 60 * 1000;
		expect(verifyToken(signedPayload(String(now)), now + 91 * day)).toBeNull();
	});
});

/** Sign an arbitrary payload the way the module does, to build tokens it would not. */
function signedPayload(payload: string): string {
	const signature = createHmac('sha256', 'test-secret-aaaaaaaaaaaaaaaaaaaaaaaa')
		.update(payload)
		.digest('base64url');
	return `${payload}.${signature}`;
}

describe('post-login redirect', () => {
	const origin = 'https://practice.example';

	it('keeps an internal path and query', () => {
		expect(safeRedirectPath('/backing?chart=blues', origin)).toBe('/backing?chart=blues');
	});

	it.each(['https://evil.example', '//evil.example/path', '/\\evil.example/path', 'backing'])(
		'rejects unsafe destination %s',
		(destination) => {
			expect(safeRedirectPath(destination, origin)).toBe('/');
		}
	);
});
