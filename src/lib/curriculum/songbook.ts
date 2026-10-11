import type { ChartCategory } from './charts';

export type BookEntry = {
	slug: string;
	name: string;
	artist?: string;
	notes: string;
	category: ChartCategory;
	defaultKey?: string;
	defaultGroove: string;
	defaultBpm: number;
	ready: boolean;
	reach: number;
};
export type BookSort = 'title' | 'artist' | 'simplest' | 'tempo';
export type BookFilters = {
	search: string;
	category: ChartCategory | 'all';
	artist: string;
	key: string;
	groove: string;
	readyOnly: boolean;
	sort: BookSort;
};

export function searchText(value: string): string {
	return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[’']/g, '');
}

export function browseSongs<T extends BookEntry>(entries: T[], filters: BookFilters): T[] {
	const words = searchText(filters.search).trim().split(/\s+/).filter(Boolean);
	return entries
		.filter((entry) => {
			if (filters.category !== 'all' && entry.category !== filters.category) return false;
			if (filters.artist !== 'all' && entry.artist !== filters.artist) return false;
			if (filters.key !== 'all' && entry.defaultKey !== filters.key) return false;
			if (filters.groove !== 'all' && entry.defaultGroove !== filters.groove) return false;
			if (filters.readyOnly && !entry.ready) return false;
			const text = searchText(`${entry.name} ${entry.artist ?? ''} ${entry.notes}`);
			return words.every((word) => text.includes(word));
		})
		.sort((a, b) => {
			const title = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
			if (filters.sort === 'artist')
				return (
					Number(!a.artist) - Number(!b.artist) ||
					(a.artist ?? '').localeCompare(b.artist ?? '') ||
					title
				);
			if (filters.sort === 'simplest') return a.reach - b.reach || title;
			if (filters.sort === 'tempo') return a.defaultBpm - b.defaultBpm || title;
			return title;
		});
}
