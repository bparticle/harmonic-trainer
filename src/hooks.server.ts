import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, verifyToken } from '$lib/server/auth';

const PUBLIC_PATHS = ['/login'];

/**
 * Readable by anyone: the project page at the root, and the demo.
 *
 * The demo is the whole play-along page with no account behind it, so it must
 * be reachable without a session — but it writes nothing and has no actions, so
 * it has no business accepting anything but a read.
 */
const PUBLIC_READ_PATHS = ['/demo'];

export function isPublicRequest(pathname: string, method: string): boolean {
	if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;

	// Keep mutations behind the session gate wherever the page itself is open.
	if (method !== 'GET' && method !== 'HEAD') return false;

	if (pathname === '/') return true;
	return PUBLIC_READ_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export const handle: Handle = async ({ event, resolve }) => {
	const claim = verifyToken(event.cookies.get(SESSION_COOKIE));
	const authed = claim !== null;
	event.locals.authed = authed;
	// What the cookie says, unresolved. `currentUserId` turns it into a user;
	// nothing else is allowed to, which is what keeps the seam a single seam.
	event.locals.userId = claim?.userId ?? null;

	if (!authed && !isPublicRequest(event.url.pathname, event.request.method)) {
		// Preserve where they were headed so the redirect after login is not jarring.
		const next = event.url.pathname + event.url.search;
		redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}

	return resolve(event);
};
