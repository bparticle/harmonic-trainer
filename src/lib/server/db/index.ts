import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

/*
 * One driver everywhere: node-postgres against Neon's *pooled* endpoint in
 * production and against a local Postgres in development.
 *
 * Neon's own `neon-http` driver is faster to cold-start, but it cannot do
 * interactive transactions — and the sync endpoint that drains the offline
 * IndexedDB outbox needs to commit a batch of reviews, blocks and takes
 * atomically. Trading ~50ms of cold start for real transactions is obviously
 * right here: this is a single-user app, and local-first sync already keeps
 * the network off the critical practice path.
 *
 * Use the pooled connection string (the one with `-pooler` in the hostname).
 * PgBouncer handles connection limits, so each serverless instance keeps a
 * pool of exactly one.
 */

if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

const pool = new pg.Pool({
	connectionString: env.DATABASE_URL,
	max: 1,
	idleTimeoutMillis: 10_000
});

export const db = drizzle(pool, { schema });
export { schema };
