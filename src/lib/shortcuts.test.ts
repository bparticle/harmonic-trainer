import { describe, expect, it } from 'vitest';
import { shouldHandleSpace } from './shortcuts';

function event(overrides: Record<string, unknown> = {}) {
	return {
		key: ' ',
		defaultPrevented: false,
		repeat: false,
		altKey: false,
		ctrlKey: false,
		metaKey: false,
		shiftKey: false,
		target: null,
		...overrides
	} as unknown as KeyboardEvent;
}

describe('page shortcuts', () => {
	it('handles a plain Space press on the page', () => {
		expect(shouldHandleSpace(event())).toBe(true);
	});

	it('leaves buttons and form fields alone', () => {
		const target = { closest: () => ({}) };
		expect(shouldHandleSpace(event({ target }))).toBe(false);
	});

	it('ignores repeats and modified shortcuts', () => {
		expect(shouldHandleSpace(event({ repeat: true }))).toBe(false);
		expect(shouldHandleSpace(event({ ctrlKey: true }))).toBe(false);
	});
});
