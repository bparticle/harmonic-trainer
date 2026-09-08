import { describe, expect, it } from 'vitest';
import { closeKey, closeCell } from '$lib/curriculum/ladder';
import { cardsInScope } from './practice-scope';

const before = { widths: [3, 3, 3, 3, 1, 0, 0] };
const cards = [
	{ keyCenter: 'C', skillCode: 'rung:relative-minor' },
	{ keyCenter: 'G', skillCode: 'rung:all-triads' },
	{ keyCenter: 'F', skillCode: 'rung:scale' },
	{ keyCenter: 'F', skillCode: 'rung:all-triads' }
];
describe('practice scope after closing', () => {
	it('excludes saved F cards while preserving C minor and G triads', () => {
		expect(cardsInScope(cards, closeKey(before, 'F')!)).toEqual(cards.slice(0, 2));
		expect(cards).toHaveLength(4);
		expect(cardsInScope(cards, before)).toEqual(cards);
	});
	it('excludes a closed topic even when its scale remains open', () => {
		expect(cardsInScope(cards, closeCell(before, 'C', 'relative-minor')!)).toEqual(cards.slice(1));
	});
	it('allows an explicitly selected closed lesson without including the rest of its key', () => {
		expect(
			cardsInScope(cards, closeKey(before, 'F')!, { kind: 'rung', key: 'F', rungId: 'all-triads' })
		).toEqual([cards[0], cards[1], cards[3]]);
	});
});
