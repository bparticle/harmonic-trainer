import { redirect, type RequestHandler } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/server/auth';

export const POST: RequestHandler = ({ cookies }) => {
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, '/login');
};
