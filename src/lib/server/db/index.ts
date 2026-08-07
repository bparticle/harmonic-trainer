import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
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

type Db = NodePgDatabase<typeof schema>;

let instance: Db | null = null;

/*
 * Built on first use, not on import.
 *
 * SvelteKit's production build imports every server module to work out
 * prerendering, which runs this file's top level on a machine that is
 * building the app, not serving it — CI, most obviously, which has no
 * `DATABASE_URL` and has no reason to need one. A module-level `throw` here
 * used to fail that build outright. Deferring the check to the first real
 * query means importing the module is free, and the error still appears
 * immediately for the first request that actually needs a database.
 */
function connect(): Db {
	if (!instance) {
		if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
		const pool = new pg.Pool({
			connectionString: env.DATABASE_URL,
			max: 1,
			idleTimeoutMillis: 10_000
		});
		instance = drizzle(pool, { schema });
	}
	return instance;
}

export const db: Db = new Proxy({} as Db, {
	get(_target, prop, receiver) {
		const real = connect();
		const value = Reflect.get(real, prop, receiver);
		return typeof value === 'function' ? value.bind(real) : value;
	}
});

export { schema };
