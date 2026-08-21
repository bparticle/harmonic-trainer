import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq, sql } from 'drizzle-orm';
import { hashPassword } from '../src/lib/server/password.ts';
import { LOCAL_PLAYER_ID } from '../src/lib/server/db/user.ts';
import * as schema from '../src/lib/server/db/schema.ts';
import { DEFAULT_COLOR_MAP, DEFAULT_PREFS, DEFAULT_WHEEL_CONFIG } from '../src/lib/settings.ts';

const input = process.argv.slice(2);
const command = input[0];
const positional = command === 'owner' || command === 'add';
const args = parseArgs(input);
const name = (positional ? input[1] : args.get('name'))?.trim();
const email = (positional ? input[2] : args.get('email'))?.trim().toLowerCase();
const owner = command === 'owner' || args.has('owner');
const supplied = positional ? input[3] : args.get('password');
const password = supplied ?? randomBytes(18).toString('base64url');

if (!name || !email) {
	throw new Error(
		'Usage: npm run account:create -- owner "Name" "name@example.com" [password]\n' +
			'   or: npm run account:create -- add "Name" "name@example.com" [password]'
	);
}
if (!/^[^@\s\\]+@[^@\s\\]+\.[^@\s\\]+$/.test(email)) {
	throw new Error('Email does not look valid. Do not escape @ with a backslash.');
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const pool = new pg.Pool({ connectionString: url, max: 1 });
const db = drizzle(pool, { schema });

async function main() {
	const passwordHash = await hashPassword(password);
	const [existing] = await db
		.select({ id: schema.users.id })
		.from(schema.users)
		.where(eq(schema.users.email, email!))
		.limit(1);
	const id = owner ? LOCAL_PLAYER_ID : (existing?.id ?? randomUUID());

	await db
		.insert(schema.users)
		.values({ id, name: name!, email: email!, passwordHash })
		.onConflictDoUpdate({
			target: schema.users.id,
			set: {
				name: name!,
				email: email!,
				passwordHash,
				sessionEpoch: sql`${schema.users.sessionEpoch} + 1`
			}
		});

	await db
		.insert(schema.settings)
		.values({
			id: 1,
			colorMapJson: DEFAULT_COLOR_MAP,
			wheelConfigJson: DEFAULT_WHEEL_CONFIG,
			prefsJson: DEFAULT_PREFS,
			midiDevice: null
		})
		.onConflictDoNothing();

	await db
		.insert(schema.userPrefs)
		.values({
			userId: id,
			colorMapJson: DEFAULT_COLOR_MAP,
			wheelConfigJson: DEFAULT_WHEEL_CONFIG,
			midiDevice: null,
			prefsJson: DEFAULT_PREFS
		})
		.onConflictDoNothing();

	console.log(existing || owner ? `Account updated for ${email}` : `Account created for ${email}`);
	if (!supplied) console.log(`Temporary password: ${password}`);
	console.log('The player can change it from Account after signing in.');
}

function parseArgs(input: string[]): Map<string, string> {
	const parsed = new Map<string, string>();
	for (let i = 0; i < input.length; i += 1) {
		const item = input[i];
		if (!item.startsWith('--')) continue;
		const key = item.slice(2);
		const next = input[i + 1];
		if (!next || next.startsWith('--')) parsed.set(key, '');
		else {
			parsed.set(key, next);
			i += 1;
		}
	}
	return parsed;
}

main()
	.then(() => pool.end())
	.catch(async (error) => {
		console.error(error instanceof Error ? error.message : error);
		await pool.end();
		process.exit(1);
	});
