import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { actions } from './+page.server';

const writes = vi.hoisted(() => ({
	insert: vi.fn(),
	update: vi.fn(),
	scope: vi.fn(),
	changed: [{ slug: 'existing-slug' }] as { slug: string }[]
}));
vi.mock('$lib/server/db', () => ({
	db: {
		select: () => ({ from: () => ({ where: async () => [] }) }),
		insert: () => ({ values: writes.insert }),
		update: () => ({
			set: (value: unknown) => {
				writes.update(value);
				return {
					where: (scope: unknown) => {
						writes.scope(scope);
						return { returning: async () => writes.changed };
					}
				};
			}
		})
	}
}));
vi.mock('$lib/server/db/session-store', () => ({ currentVocabulary: vi.fn() }));

const userId = '11111111-2222-4333-8444-555555555555';
const chartId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
function submit(action: 'create' | 'update', changes: Record<string, string> = {}) {
	const form = new FormData();
	for (const [key, value] of Object.entries({
		name: 'Drunken Sailor',
		artist: '  Traditional  ',
		key: 'E',
		mode: 'minor',
		bpm: '132',
		groove: 'rock',
		grid: JSON.stringify([['Em', 'D', 'Em', 'D Em']]),
		...changes
	}))
		form.set(key, value);
	const handler = actions[action]!;
	return handler({
		request: new Request('http://localhost/songbook', { method: 'POST', body: form }),
		locals: { userId }
	} as Parameters<typeof handler>[0]);
}

beforeEach(() => {
	vi.clearAllMocks();
	writes.changed = [{ slug: 'existing-slug' }];
});
describe('saving songbook charts', () => {
	it('saves a built-in copy under a new slug with its artist and split-bar changes', async () => {
		await expect(submit('create')).rejects.toMatchObject({
			status: 303,
			location: '/backing?chart=drunken-sailor-2'
		});
		expect(writes.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				userId,
				artist: 'Traditional',
				slug: 'drunken-sailor-2',
				gridJson: [['i', 'bVII', 'i', 'bVII i']]
			})
		);
	});
	it('updates artist and chords while retaining the saved slug and owner scope', async () => {
		await expect(
			submit('update', { id: chartId, artist: 'New artist', name: 'Renamed chart' })
		).rejects.toMatchObject({ status: 303, location: '/backing?chart=existing-slug' });
		expect(writes.update).toHaveBeenCalledWith(
			expect.objectContaining({ artist: 'New artist', name: 'Renamed chart' })
		);
		expect(writes.update.mock.calls[0][0]).not.toHaveProperty('slug');
		const query = new PgDialect().sqlToQuery(writes.scope.mock.calls[0][0]);
		expect(query.sql).toContain('"charts"."user_id"');
		expect(query.params).toEqual([chartId, userId]);
	});
	it('returns entered artist and chords after a refused save', async () => {
		expect(await submit('update', { id: chartId, name: '' })).toMatchObject({
			status: 400,
			data: { id: chartId, artist: 'Traditional', text: 'Em | D | Em | D Em' }
		});
		expect(writes.update).not.toHaveBeenCalled();
	});
	it('allows an artist to be cleared', async () => {
		await expect(submit('update', { id: chartId, artist: '' })).rejects.toMatchObject({
			status: 303
		});
		expect(writes.update).toHaveBeenCalledWith(expect.objectContaining({ artist: '' }));
	});
	it('returns to the book when the owned chart no longer exists', async () => {
		writes.changed = [];
		await expect(submit('update', { id: chartId })).rejects.toMatchObject({
			status: 303,
			location: '/songbook'
		});
	});
});
