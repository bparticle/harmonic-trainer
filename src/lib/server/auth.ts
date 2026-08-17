import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '$env/dynamic/private';

/*
 * A single shared password and a signed cookie. That is the whole auth system.
 *
 * Moving the database off a private NAS onto a public URL means *something* has
 * to stand between the internet and the practice vault, and this is the
 * smallest thing that does the job: no registration, no email, one secret, one
 * cookie, nothing to maintain.
 *
 * Accounts were an explicit anti-goal when this was written, and are now the
 * direction — see ROADMAP.md, M9. Nothing here changes until then. The plan is
 * to name the user in the signed payload and resolve it through one accessor,
 * not to grow this file into a login system.
 */

export const SESSION_COOKIE = 'ht_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 90; // 90 days — re-entering a password mid-practice is hostile.

function secret(): string {
	const value = env.AUTH_SECRET;
	if (!value) throw new Error('AUTH_SECRET is not set');
	return value;
}

function sign(payload: string): string {
	return createHmac('sha256', secret()).update(payload).digest('base64url');
}

/** Constant-time comparison that tolerates differing lengths. */
function safeEqual(a: string, b: string): boolean {
	const ab = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ab.length !== bb.length) {
		// Still compare something of equal length so the timing does not leak length.
		timingSafeEqual(ab, ab);
		return false;
	}
	return timingSafeEqual(ab, bb);
}

export function checkPassword(candidate: string): boolean {
	const expected = env.APP_PASSWORD;
	if (!expected) throw new Error('APP_PASSWORD is not set');
	return safeEqual(candidate, expected);
}

export function issueToken(now = Date.now()): string {
	const issuedAt = String(now);
	return `${issuedAt}.${sign(issuedAt)}`;
}

export function verifyToken(token: string | undefined, now = Date.now()): boolean {
	if (!token) return false;
	const dot = token.lastIndexOf('.');
	if (dot < 1) return false;

	const issuedAt = token.slice(0, dot);
	const signature = token.slice(dot + 1);
	if (!safeEqual(signature, sign(issuedAt))) return false;

	const age = (now - Number(issuedAt)) / 1000;
	return Number.isFinite(age) && age >= 0 && age < MAX_AGE_SECONDS;
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
