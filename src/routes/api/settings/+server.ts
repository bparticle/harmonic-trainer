import { json, error, type RequestHandler } from '@sveltejs/kit';
import { loadSettings, saveSettings } from '$lib/server/db/settings';
import {
	parseColorMap,
	parseDeviceName,
	parseTourSeen,
	parseWheelConfig,
	prefsFromRequest
} from '$lib/settings-validate';
import { currentUserId } from '$lib/server/db/user';

/**
 * Patch the signed-in account's settings row.
 *
 * Both callers — wheel calibration and the colour editor — send only the part
 * they own, so neither can undo the other's work by saving a stale copy of the
 * whole object.
 *
 * The frontier is the exception, and it is not written here at all. `ladderWidths`
 * is curriculum progress, moved only by the deepen / widen / step-back actions on
 * the home page. The settings menu lives in the root layout and seeds its draft
 * once, so the copy of the frontier it posts alongside a slider change can be many
 * moves stale — and `parsePrefs` would take any well-formed staircase at face
 * value. So whatever a request carries for it is dropped, and the stored value is
 * kept: a reveal-delay change must never be able to reset somebody's ladder.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.authed) error(401, 'Not signed in');

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Expected JSON');
	}

	if (typeof body !== 'object' || body === null) error(400, 'Expected an object');
	const patch = body as Record<string, unknown>;

	const userId = currentUserId(locals.userId);

	try {
		const prefs =
			patch.prefs !== undefined
				? prefsFromRequest(patch.prefs, (await loadSettings(userId)).prefs)
				: undefined;

		const saved = await saveSettings(userId, {
			...(patch.wheelConfig !== undefined
				? { wheelConfig: parseWheelConfig(patch.wheelConfig) }
				: {}),
			...(patch.colorMap !== undefined ? { colorMap: parseColorMap(patch.colorMap) } : {}),
			...(prefs !== undefined ? { prefs } : {}),
			...(patch.midiDevice !== undefined ? { midiDevice: parseDeviceName(patch.midiDevice) } : {}),
			...(patch.tourSeen !== undefined ? { tourSeen: parseTourSeen(patch.tourSeen) } : {})
		});
		return json(saved);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Invalid settings');
	}
};
