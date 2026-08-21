import { describe, expect, it } from 'vitest';
import { avatarTraits } from './avatar';

describe('chromatic avatar traits', () => {
	it('is stable across case and surrounding whitespace', () => {
		expect(avatarTraits('  Béla ')).toEqual(avatarTraits('béla'));
	});

	it('uses four different pitch colours in range', () => {
		const traits = avatarTraits('Bruno');
		const colours = [traits.field, traits.orbit, traits.mark, traits.spark];
		expect(new Set(colours).size).toBe(4);
		expect(colours.every((note) => note >= 0 && note < 12)).toBe(true);
	});

	it('gives different names different portraits', () => {
		expect(avatarTraits('Bruno')).not.toEqual(avatarTraits('Béla'));
	});
});
