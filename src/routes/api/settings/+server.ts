import { json, error, type RequestHandler } from '@sveltejs/kit';
import { saveSettings } from '$lib/server/db/settings';
import { parseColorMap, parsePrefs, parseWheelConfig } from '$lib/settings-validate';

/**
 * Patch the singleton settings row.
 *
 * Both callers — wheel calibration and the colour editor — send only the part
 * they own, so neither can undo the other's work by saving a stale copy of the
 * whole object.
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

	try {
		const saved = await saveSettings({
			...(patch.wheelConfig !== undefined
				? { wheelConfig: parseWheelConfig(patch.wheelConfig) }
				: {}),
			...(patch.colorMap !== undefined ? { colorMap: parseColorMap(patch.colorMap) } : {}),
			...(patch.prefs !== undefined ? { prefs: parsePrefs(patch.prefs) } : {})
		});
		return json(saved);
	} catch (e) {
		error(400, e instanceof Error ? e.message : 'Invalid settings');
	}
};
