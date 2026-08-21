import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('$env/dynamic/private', () => ({
	env: { AUTH_SECRET: 'test-secret-aaaaaaaaaaaaaaaaaaaaaaaa' }
}));

const { hashPassword, issueToken, safeRedirectPath, verifyPassword, verifyToken } =
	await import('./auth');

describe('password hashing', () => {
	it('round-trips the right password and rejects another', async () => {
		const hash = await hashPassword('correct horse battery staple');
		expect(hash).not.toContain('correct horse');
		await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
		await expect(verifyPassword('wrong horse battery staple', hash)).resolves.toBe(false);
	});

	it('uses a fresh salt', async () => {
		const first = await hashPassword('correct horse battery staple');
		const second = await hashPassword('correct horse battery staple');
		expect(first).not.toBe(second);
	});

	it('rejects short passwords and malformed stored values', async () => {
		await expect(hashPassword('too short')).rejects.toThrow('12 characters');
		await expect(verifyPassword('anything long enough', 'disabled')).resolves.toBe(false);
	});
});

describe('session token', () => {
	const PLAYER = '00000000-0000-4000-8000-000000000001';

	it('round-trips a fresh token with its revocation epoch', () => {
		expect(verifyToken(issueToken(PLAYER, 3))).toEqual({ userId: PLAYER, sessionEpoch: 3 });
	});

	it('rejects undefined, empty and malformed tokens', () => {
		expect(verifyToken(undefined)).toBeNull();
		expect(verifyToken('')).toBeNull();
		expect(verifyToken('nodot')).toBeNull();
		expect(verifyToken('.onlysig')).toBeNull();
	});

	it('rejects a tampered signature or payload', () => {
		const now = Date.now();
		const token = issueToken(PLAYER, 0, now);
		const tampered = token.slice(0, -1) + (token.at(-1) === 'A' ? 'B' : 'A');
		expect(verifyToken(tampered)).toBeNull();

		const signature = token.slice(token.lastIndexOf('.') + 1);
		expect(verifyToken(`2.${PLAYER}.1.${now}.${signature}`)).toBeNull();
	});

	it('expires after 90 days and rejects the future', () => {
		const now = Date.now();
		const day = 24 * 60 * 60 * 1000;
		const token = issueToken(PLAYER, 0, now);
		expect(verifyToken(token, now + 89 * day)).toEqual({ userId: PLAYER, sessionEpoch: 0 });
		expect(verifyToken(token, now + 91 * day)).toBeNull();
		expect(verifyToken(issueToken(PLAYER, 0, now + 60_000), now)).toBeNull();
	});

	it('parses cookies from both earlier single-player formats', () => {
		const now = Date.now();
		expect(verifyToken(signedPayload(`${PLAYER}.${now}`), now)).toEqual({
			userId: PLAYER,
			sessionEpoch: null
		});
		expect(verifyToken(signedPayload(String(now)), now)).toEqual({
			userId: null,
			sessionEpoch: null
		});
	});
});

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
		(destination) => expect(safeRedirectPath(destination, origin)).toBe('/')
	);
});
