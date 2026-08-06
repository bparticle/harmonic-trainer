import { eq } from 'drizzle-orm';
import { db } from './index';
import { settings } from './schema';
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
 * The settings row is a singleton pinned to id 1. It is created on first read
 * rather than by a migration, so the defaults stay in TypeScript next to the
 * types that describe them instead of being frozen into SQL.
 */
export async function loadSettings(): Promise<AppSettings> {
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

		if (created) return toAppSettings(created);

		// Lost a race with a concurrent first request; re-read.
		const [existing] = await db.select().from(settings).where(eq(settings.id, 1)).limit(1);
		return toAppSettings(existing);
	}

	return toAppSettings(row);
}

/**
 * Patch the singleton. Only the fields present are touched, so the colour
 * editor and the wheel calibration screen can each save without clobbering the
 * other's work.
 */
export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
	await loadSettings(); // guarantees the row exists

	const update: Record<string, unknown> = { updatedAt: new Date() };
	if (patch.colorMap) update.colorMapJson = patch.colorMap;
	if (patch.wheelConfig) update.wheelConfigJson = patch.wheelConfig;
	if (patch.prefs) update.prefsJson = patch.prefs;
	if (patch.midiDevice !== undefined) update.midiDevice = patch.midiDevice;

	const [row] = await db.update(settings).set(update).where(eq(settings.id, 1)).returning();
	return toAppSettings(row);
}

function toAppSettings(row: typeof settings.$inferSelect): AppSettings {
	return {
		colorMap: row.colorMapJson as ColorMap,
		wheelConfig: row.wheelConfigJson as WheelConfig,
		prefs: row.prefsJson as Prefs,
		midiDevice: row.midiDevice
	};
}
