import { describe, expect, it } from 'vitest';
import { windowStart } from './rate-limit';

describe('rate limit window', () => {
	it('reaches back exactly windowMinutes from now', () => {
		const now = new Date('2026-01-01T12:00:00Z');
		expect(windowStart(now, 15).toISOString()).toBe('2026-01-01T11:45:00.000Z');
		expect(windowStart(now, 60).toISOString()).toBe('2026-01-01T11:00:00.000Z');
	});

	it('does not mutate the date it was given', () => {
		const now = new Date('2026-01-01T12:00:00Z');
		windowStart(now, 15);
		expect(now.toISOString()).toBe('2026-01-01T12:00:00.000Z');
	});
});
