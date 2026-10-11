import { describe, expect, it } from 'vitest';
import { browseSongs, type BookEntry, type BookFilters } from './songbook';

const defaults: BookFilters = {
	search: '',
	category: 'all',
	artist: 'all',
	key: 'all',
	groove: 'all',
	readyOnly: false,
	sort: 'title'
};
const entries: BookEntry[] = [
	{
		slug: 'sailor',
		name: 'Drunken Sailor',
		artist: 'Traditional',
		notes: 'Verse and chorus',
		category: 'traditional',
		defaultKey: 'E',
		defaultGroove: 'rock',
		defaultBpm: 132,
		ready: true,
		reach: 1
	},
	{
		slug: 'gone',
		name: 'After You’ve Gone',
		artist: 'Turner Layton',
		notes: 'Borrowed minor four',
		category: 'standard',
		defaultGroove: 'swing',
		defaultBpm: 170,
		ready: false,
		reach: 3
	},
	{
		slug: 'own',
		name: 'Été',
		artist: 'Björk',
		notes: 'My arrangement',
		category: 'mine',
		defaultKey: 'E',
		defaultGroove: 'rock',
		defaultBpm: 90,
		ready: true,
		reach: 2
	},
	{
		slug: 'pattern',
		name: 'Blues',
		notes: 'Practice pattern',
		category: 'form',
		defaultGroove: 'shuffle',
		defaultBpm: 120,
		ready: false,
		reach: 0
	}
];
const find = (filters: Partial<BookFilters> = {}) =>
	browseSongs(entries, { ...defaults, ...filters }).map((entry) => entry.slug);

describe('finding songs', () => {
	it('searches title, artist and notes, with words in any order', () => {
		expect(find({ search: 'layton gone' })).toEqual(['gone']);
		expect(find({ search: 'chorus drunken' })).toEqual(['sailor']);
		expect(find({ search: 'Bjork ete' })).toEqual(['own']);
		expect(find({ search: "you've" })).toEqual(['gone']);
	});
	it('combines all filters, and never makes readiness a lock by default', () => {
		expect(
			find({ category: 'mine', artist: 'Björk', key: 'E', groove: 'rock', readyOnly: true })
		).toEqual(['own']);
		expect(find({ search: 'gone' })).toEqual(['gone']);
		expect(find({ search: 'gone', readyOnly: true })).toEqual([]);
	});
	it('sorts without changing the source list, putting missing artists last', () => {
		expect(find()).toEqual(['gone', 'pattern', 'sailor', 'own']);
		expect(find({ sort: 'artist' })).toEqual(['own', 'sailor', 'gone', 'pattern']);
		expect(find({ sort: 'tempo' })).toEqual(['own', 'pattern', 'sailor', 'gone']);
		expect(find({ sort: 'simplest' })).toEqual(['pattern', 'sailor', 'own', 'gone']);
		expect(entries[0].slug).toBe('sailor');
	});
	it('treats whitespace as an empty search and handles an empty library', () => {
		expect(find({ search: '   ' })).toEqual(find());
		expect(browseSongs([], defaults)).toEqual([]);
	});
});
