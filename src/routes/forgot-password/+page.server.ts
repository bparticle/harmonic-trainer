import { fail, type Actions } from '@sveltejs/kit';
import { normalizeEmail, requestPasswordReset } from '$lib/server/db/accounts';
import { isRateLimited, recordEvent, RESET_REQUEST_LIMIT } from '$lib/server/db/rate-limit';

export const actions: Actions = {
	default: async ({ request, url }) => {
		const form = await request.formData();
		const email = form.get('email');

		if (typeof email !== 'string' || !email.trim()) {
			return fail(400, { error: 'Enter your email.', email: String(email ?? '') });
		}

		const key = normalizeEmail(email);
		if (await isRateLimited(key, 'reset_request', RESET_REQUEST_LIMIT)) {
			return fail(429, { error: 'Too many requests. Try again in an hour.', email });
		}
		// Recorded before the lookup below, so a burst of requests against
		// addresses nobody owns costs the same as a burst against a real one —
		// the limit protects the mail quota, not just one account.
		await recordEvent(key, 'reset_request');

		await requestPasswordReset(email, (token) => `${url.origin}/reset-password?token=${token}`);

		return { sent: true };
	}
};
