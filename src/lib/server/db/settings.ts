import { eq } from 'drizzle-orm';
import { db } from './index';
import { settings, userPrefs } from './schema';
import {
	DEFAULT_COLOR_MAP,
	DEFAULT_PREFS,
	DEFAULT_WHEEL_CONFIG,
	type AppSettings,
	type ColorMap,
	type Prefs,
	type WheelConfig
} from '$lib/settings';

/**
 * The defaults row is a singleton pinned to id 1. It is created on first read
 * rather than by a migration, so defaults stay in TypeScript next to their
 * types instead of being frozen into SQL.
 */
async function loadDefaults() {
	const [row] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);

	if (!row) {
		const [created] = await db
			.insert(settings)
			.values({
				id: 1,
				colorMapJson: DEFAULT_COLOR_MAP,
				wheelConfigJson: DEFAULT_WHEEL_CONFIG,
				prefsJson: DEFAULT_PREFS,
				midiDevice: null
			})
			.onConflictDoNothing()
			.returning();

		if (created) return created;

		// Lost a race with a concurrent first request; re-read.
		const [existing] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
		return existing;
	}

	return row;
}

export async function loadSettings(userId: string): Promise<AppSettings> {
	const [row] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
	if (row) return toAppSettings(row);

	const defaults = await loadDefaults();
	const [created] = await db
		.insert(userPrefs)
		.values({
			userId,
			colorMapJson: defaults.colorMapJson,
			wheelConfigJson: defaults.wheelConfigJson,
			prefsJson: defaults.prefsJson,
			midiDevice: defaults.midiDevice
		})
		.onConflictDoNothing()
		.returning();
	if (created) return toAppSettings(created);

	const [existing] = await db.select().from(userPrefs).where(eq(userPrefs.userId, userId)).limit(1);
	return toAppSettings(existing);
}

/**
 * Patch one account. Only the fields present are touched, so the colour
 * editor and the wheel calibration screen can each save without clobbering the
 * other's work.
 */
export async function saveSettings(
	userId: string,
	patch: Partial<AppSettings>
): Promise<AppSettings> {
	await loadSettings(userId); // guarantees the row exists

	const update: Record<string, unknown> = { updatedAt: new Date() };
	if (patch.colorMap) update.colorMapJson = patch.colorMap;
	if (patch.wheelConfig) update.wheelConfigJson = patch.wheelConfig;
	if (patch.prefs) update.prefsJson = patch.prefs;
	if (patch.midiDevice !== undefined) update.midiDevice = patch.midiDevice;
	if (patch.tourSeen !== undefined) update.tourSeen = patch.tourSeen;

	const [row] = await db
		.update(userPrefs)
		.set(update)
		.where(eq(userPrefs.userId, userId))
		.returning();
	return toAppSettings(row);
}

function toAppSettings(
	row: typeof settings.$inferSelect | typeof userPrefs.$inferSelect
): AppSettings {
	return {
		colorMap: row.colorMapJson as ColorMap,
		wheelConfig: row.wheelConfigJson as WheelConfig,
		prefs: row.prefsJson as Prefs,
		midiDevice: row.midiDevice,
		// The singleton template has no opinion on this — it is not personal
		// data, and a new account has always seen nothing regardless of what
		// the operator's own row says.
		tourSeen: 'tourSeen' in row ? row.tourSeen : false
	};
}
