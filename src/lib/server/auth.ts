import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';
export { hashPassword, verifyPassword } from './password';

export const SESSION_COOKIE = 'ht_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

function secret(): string {
	const value = env.AUTH_SECRET;
	if (!value) throw new Error('AUTH_SECRET is not set');
	return value;
}

function sign(payload: string): string {
	return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Constant-time comparison that tolerates differing lengths. */
function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
	const ab = Buffer.isBuffer(a) ? a : Buffer.from(a);
	const bb = Buffer.isBuffer(b) ? b : Buffer.from(b);
	if (ab.length !== bb.length) {
		timingSafeEqual(ab, ab);
		return false;
	}
	return timingSafeEqual(ab, bb);
}

/** What a structurally valid signed cookie claims. The database still decides. */
export type SessionClaim = { userId: string | null; sessionEpoch: number | null };

export function issueToken(userId: string, sessionEpoch: number, now = Date.now()): string {
	const payload = `2.${userId}.${sessionEpoch}.${now}`;
	return `${payload}.${sign(payload)}`;
}

/**
 * Verify the signature and age of a cookie.
 *
 * Version-two payloads carry `userId.sessionEpoch.issuedAt`. Cookies minted by
 * the previous single-player releases still parse with a null epoch so a deploy
 * does not interrupt a session; the database accepts that compatibility path
 * only for the original local player at epoch zero.
 */
export function verifyToken(token: string | undefined, now = Date.now()): SessionClaim | null {
	if (!token) return null;
	const dot = token.lastIndexOf('.');
	if (dot < 1) return null;

	const payload = token.slice(0, dot);
	const signature = token.slice(dot + 1);
	if (!safeEqual(signature, sign(payload))) return null;

	let userId: string | null = null;
	let sessionEpoch: number | null = null;
	let issuedAt: string;
	const parts = payload.split('.');

	if (parts[0] === '2') {
		if (parts.length !== 4 || !UUID.test(parts[1]) || !/^\d+$/.test(parts[2])) return null;
		userId = parts[1];
		sessionEpoch = Number(parts[2]);
		issuedAt = parts[3];
	} else if (parts.length === 2 && UUID.test(parts[0])) {
		[userId, issuedAt] = parts;
	} else if (parts.length === 1) {
		issuedAt = parts[0];
	} else {
		return null;
	}

	if (!/^\d+$/.test(issuedAt)) return null;
	const age = (now - Number(issuedAt)) / 1000;
	if (age < 0 || age >= MAX_AGE_SECONDS) return null;

	return { userId, sessionEpoch };
}

/** Return a same-origin path, including its query, or the safe home fallback. */
export function safeRedirectPath(raw: string | null, origin: string): string {
	if (!raw) return '/';
	try {
		const destination = new URL(raw, origin);
		if (destination.origin !== origin || !raw.startsWith('/') || raw.startsWith('//')) return '/';
		return `${destination.pathname}${destination.search}${destination.hash}`;
	} catch {
		return '/';
	}
}

export const cookieOptions = {
	path: '/',
	httpOnly: true,
	sameSite: 'lax',
	secure: true,
	maxAge: MAX_AGE_SECONDS
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
