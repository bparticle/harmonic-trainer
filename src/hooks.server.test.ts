import { describe, expect, it } from 'vitest';
import { isPublicRequest } from './hooks.server';

describe('public routes', () => {
	it('serves the project home page to visitors', () => {
		expect(isPublicRequest('/', 'GET')).toBe(true);
		expect(isPublicRequest('/', 'HEAD')).toBe(true);
	});

	it('keeps root mutations behind authentication', () => {
		expect(isPublicRequest('/', 'POST')).toBe(false);
	});

	it('keeps login public and application pages private', () => {
		expect(isPublicRequest('/login', 'GET')).toBe(true);
		expect(isPublicRequest('/login/help', 'GET')).toBe(true);
		expect(isPublicRequest('/backing', 'GET')).toBe(false);
	});

	it('serves the demo to visitors', () => {
		expect(isPublicRequest('/demo', 'GET')).toBe(true);
		expect(isPublicRequest('/demo', 'HEAD')).toBe(true);
	});

	it('refuses to let the demo be posted to', () => {
		// It has no actions, and the real play-along page's do need a session.
		expect(isPublicRequest('/demo', 'POST')).toBe(false);
	});

	it('serves the notes and every essay under them to visitors', () => {
		expect(isPublicRequest('/notes', 'GET')).toBe(true);
		expect(isPublicRequest('/notes/the-ladder', 'GET')).toBe(true);
		expect(isPublicRequest('/notes', 'POST')).toBe(false);
	});

	it('does not let a public prefix open a private path', () => {
		expect(isPublicRequest('/demonstration', 'GET')).toBe(false);
		expect(isPublicRequest('/notesomething', 'GET')).toBe(false);
		expect(isPublicRequest('/settings/colours', 'GET')).toBe(false);
	});
});
