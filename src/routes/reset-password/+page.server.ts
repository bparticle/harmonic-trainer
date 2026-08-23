import { fail, redirect, type Actions, type ServerLoad } from '@sveltejs/kit';
import { resetPassword, resetTokenIsValid } from '$lib/server/db/accounts';

export const load: ServerLoad = async ({ url }) => {
	const token = url.searchParams.get('token');
	return { valid: token ? await resetTokenIsValid(token) : false };
};

export const actions: Actions = {
	default: async ({ request, url }) => {
		const token = url.searchParams.get('token');
		if (!token) return fail(400, { error: 'This link is missing its token.' });

		const form = await request.formData();
		const next = form.get('newPassword');
		const confirm = form.get('confirmPassword');

		if (typeof next !== 'string' || typeof confirm !== 'string') {
			return fail(400, { error: 'Complete both password fields.' });
		}
		if (next.length < 12) return fail(400, { error: 'Use at least 12 characters.' });
		if (next !== confirm) return fail(400, { error: 'The passwords do not match.' });

		const outcome = await resetPassword(token, next);
		if (outcome === 'invalid') {
			return fail(400, { error: 'This link has expired or was already used.' });
		}

		redirect(303, '/login?changed=1');
	}
};
