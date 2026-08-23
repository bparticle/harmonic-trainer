import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { SESSION_COOKIE, cookieOptions, issueToken, safeRedirectPath } from '$lib/server/auth';
import { authenticate, normalizeEmail } from '$lib/server/db/accounts';
import { isRateLimited, recordEvent, SIGN_IN_LIMIT } from '$lib/server/db/rate-limit';

export const load: ServerLoad = ({ locals, url }) => {
	if (locals.authed) redirect(303, safeRedirectPath(url.searchParams.get('next'), url.origin));
	return {
		notice: url.searchParams.has('changed')
			? 'Password changed. Sign in again.'
			: url.searchParams.has('revoked')
				? 'Signed out everywhere.'
				: url.searchParams.has('deleted')
					? 'Account deleted.'
					: null
	};
};

export const actions: Actions = {
	default: async ({ request, cookies, url }) => {
		const form = await request.formData();
		const email = form.get('email');
		const password = form.get('password');

		if (typeof email !== 'string' || typeof password !== 'string') {
			return fail(400, { error: 'Enter your email and password.', email: String(email ?? '') });
		}

		const key = normalizeEmail(email);
		if (await isRateLimited(key, 'sign_in_failed', SIGN_IN_LIMIT)) {
			return fail(429, { error: 'Too many attempts. Try again in a few minutes.', email });
		}

		const user = await authenticate(email, password);
		if (!user) {
			await recordEvent(key, 'sign_in_failed');
			return fail(401, { error: 'Email or password is not right.', email });
		}

		cookies.set(SESSION_COOKIE, issueToken(user.id, user.sessionEpoch), {
			...cookieOptions,
			// Allow http://localhost during development, where there is no TLS.
			secure: url.protocol === 'https:'
		});

		redirect(303, safeRedirectPath(url.searchParams.get('next'), url.origin));
	}
};
