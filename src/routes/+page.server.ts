import { sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { outOfGamut } from '$lib/design/palette';

/**
 * Real facts, queried live. The point of the M0 page is to prove the whole
 * chain works — Vercel to Neon to Drizzle to the token layer — so nothing here
 * is hardcoded.
 *
 * Note `.rows`: the node-postgres driver returns a pg QueryResult from
 * `execute()`, not the bare array that Neon's HTTP driver returns.
 */
export const load: PageServerLoad = async ({ parent }) => {
	const { settings } = await parent();

	const tables = await db.execute<{ count: number }>(
		sql`select count(*)::int as count
		    from information_schema.tables
		    where table_schema = 'public'`
	);

	const migrations = await db.execute<{ count: number; migrated_at: string | null }>(
		sql`select count(*)::int as count,
		           to_char(to_timestamp(max(created_at) / 1000), 'YYYY-MM-DD HH24:MI') as migrated_at
		    from drizzle.__drizzle_migrations`
	);

	return {
		tableCount: tables.rows[0]?.count ?? 0,
		migrationCount: migrations.rows[0]?.count ?? 0,
		migratedAt: migrations.rows[0]?.migrated_at ?? null,
		gamutFailures: outOfGamut(settings.colorMap).length
	};
};
