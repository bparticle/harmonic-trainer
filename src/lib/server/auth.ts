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
 * direction. M9 has done the half of it that is expensive to retrofit: the
 * payload names a user, and one accessor resolves it. The other half — real
 * per-player credentials — is M12, and until it lands this file is still a
 * shared password and nothing more. Naming a user in a signed payload is not a
 * security claim; `AUTH_SECRET` gates minting a token at all, and there is one
 * password behind it. It is a place for the answer to live once there is more
 * than one. See SECURITY.md, which is still accurate.
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

/**
 * What a valid cookie says.
 *
 * `userId` is null for one minted before payloads named anybody, which is every
 * cookie issued before M9. Those are still perfectly good sessions — see
 * `verifyToken` — and resolve to the local player.
 */
export type SessionClaim = { userId: string | null };

export function issueToken(userId: string, now = Date.now()): string {
	const payload = `${userId}.${now}`;
	return `${payload}.${sign(payload)}`;
}

/**
 * Read a cookie, or refuse it. The claim, never a boolean.
 *
 * The payload is `userId.issuedAt` and is signed whole, so neither half can be
 * swapped without the signature failing. A payload with no dot in it is an
 * older cookie carrying only a timestamp: it verifies exactly as it always did
 * and names nobody, so upgrading signs no one out mid-practice.
 */
export function verifyToken(token: string | undefined, now = Date.now()): SessionClaim | null {
	if (!token) return null;
	const dot = token.lastIndexOf('.');
	if (dot < 1) return null;

	const payload = token.slice(0, dot);
	const signature = token.slice(dot + 1);
	if (!safeEqual(signature, sign(payload))) return null;

	const split = payload.lastIndexOf('.');
	const issuedAt = split < 0 ? payload : payload.slice(split + 1);
	// `split < 1` rather than `< 0`: a payload starting with a dot names an
	// empty user, which is not a name.
	const userId = split < 1 ? null : payload.slice(0, split);

	// Digits only, so nothing that merely coerces to a number — ' 12', '0x10' —
	// can pass for a timestamp.
	if (!/^\d+$/.test(issuedAt)) return null;

	const age = (now - Number(issuedAt)) / 1000;
	if (age < 0 || age >= MAX_AGE_SECONDS) return null;

	return { userId };
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
