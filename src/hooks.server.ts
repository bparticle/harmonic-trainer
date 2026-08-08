import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, verifyToken } from '$lib/server/auth';

const PUBLIC_PATHS = ['/login'];

export function isPublicRequest(pathname: string, method: string): boolean {
	const isPublicPath = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
	// The root is the public project page for visitors. Keep mutations behind the
	// session gate: only read requests may pass through without authentication.
	return isPublicPath || (pathname === '/' && (method === 'GET' || method === 'HEAD'));
}

export const handle: Handle = async ({ event, resolve }) => {
	const authed = verifyToken(event.cookies.get(SESSION_COOKIE));
	event.locals.authed = authed;

	if (!authed && !isPublicRequest(event.url.pathname, event.request.method)) {
		// Preserve where they were headed so the redirect after login is not jarring.
		const next = event.url.pathname + event.url.search;
		redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}

	return resolve(event);
};
