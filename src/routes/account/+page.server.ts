import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SESSION_COOKIE } from '$lib/server/auth';
import {
	changePassword,
	deleteAccount,
	normalizeEmail,
	revokeSessions
} from '$lib/server/db/accounts';
import { currentUserId } from '$lib/server/db/user';

export const load: PageServerLoad = ({ locals }) => ({
	user: locals.user ? { name: locals.user.name, email: locals.user.email } : null
});

export const actions: Actions = {
	password: async ({ request, locals, cookies }) => {
		const form = await request.formData();
		const current = form.get('currentPassword');
		const next = form.get('newPassword');
		const confirm = form.get('confirmPassword');

		if (typeof current !== 'string' || typeof next !== 'string' || typeof confirm !== 'string') {
			return fail(400, { passwordError: 'Complete all three password fields.' });
		}
		if (next.length < 12) {
			return fail(400, { passwordError: 'Use at least 12 characters.' });
		}
		if (next !== confirm) return fail(400, { passwordError: 'The new passwords do not match.' });

		const changed = await changePassword(currentUserId(locals.userId), current, next);
		if (!changed) return fail(401, { passwordError: 'The current password is not right.' });

		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login?changed=1');
	},

	revoke: async ({ locals, cookies }) => {
		await revokeSessions(currentUserId(locals.userId));
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login?revoked=1');
	},

	delete: async ({ request, locals, cookies }) => {
		const userId = currentUserId(locals.userId);
		const form = await request.formData();
		const confirmation = form.get('email');

		// The enabled/disabled button is a courtesy; the account this deletes is
		// decided here; never by whatever a submitted form happens to contain.
		if (
			typeof confirmation !== 'string' ||
			!locals.user ||
			normalizeEmail(confirmation) !== normalizeEmail(locals.user.email)
		) {
			return fail(400, { deleteError: 'Type your email exactly as shown to confirm.' });
		}

		await deleteAccount(userId);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/login?deleted=1');
	}
};
