import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { SESSION_COOKIE, checkPassword, cookieOptions, issueToken } from '$lib/server/auth';

/** Only ever redirect to a same-origin path, never to an attacker-supplied URL. */
function safeNext(raw: string | null): string {
	if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/';
	return raw;
}

export const load: ServerLoad = ({ locals, url }) => {
	if (locals.authed) redirect(303, safeNext(url.searchParams.get('next')));
	return {};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const password = form.get('password');

		if (typeof password !== 'string' || !checkPassword(password)) {
			return fail(401, { error: 'Not that one.' });
		}

		cookies.set(SESSION_COOKIE, issueToken(), {
			...cookieOptions,
			// Allow http://localhost during development, where there is no TLS.
			secure: url.protocol === 'https:'
		});

		redirect(303, safeNext(url.searchParams.get('next')));
	}
};
