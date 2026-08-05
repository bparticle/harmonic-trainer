import { redirect, type Handle } from '@sveltejs/kit';
import { SESSION_COOKIE, verifyToken } from '$lib/server/auth';

const PUBLIC_PATHS = ['/login'];

export const handle: Handle = async ({ event, resolve }) => {
	const authed = verifyToken(event.cookies.get(SESSION_COOKIE));
	event.locals.authed = authed;

	const isPublic = PUBLIC_PATHS.some(
		(p) => event.url.pathname === p || event.url.pathname.startsWith(`${p}/`)
	);

	if (!authed && !isPublic) {
		// Preserve where they were headed so the redirect after login is not jarring.
		const next = event.url.pathname + event.url.search;
		redirect(303, `/login?next=${encodeURIComponent(next)}`);
	}

	return resolve(event);
};
