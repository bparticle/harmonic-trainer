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
});
