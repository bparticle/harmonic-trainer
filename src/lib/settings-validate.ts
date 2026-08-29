import { isInSrgbGamut, type Oklch } from './design/color';
import {
	FIRST_FRONTIER,
	frontierFromPosition,
	isWellFormed,
	RUNGS,
	STAGES
} from './curriculum/ladder';
import { DEFAULT_PREFS, type ColorMap, type Prefs, type WheelConfig } from './settings';

/**
 * Validation for the two settings the UI can write.
 *
 * Both come from screens the user drags sliders on, so they are checked rather
 * than trusted: an out-of-gamut colour or a zero-ring wheel would not crash
 * anything, it would just quietly render wrong, which is worse.
 */

export function parseWheelConfig(input: unknown): WheelConfig {
	if (typeof input !== 'object' || input === null)
		throw new Error('Wheel config must be an object');
	const value = input as Record<string, unknown>;

	const rings = Number(value.rings);
	const ringOffsetSteps = Number(value.ringOffsetSteps);
	const offsetDirection = Number(value.offsetDirection);
	const startNote = value.startNote;

	if (!Number.isInteger(rings) || rings < 1 || rings > 12) {
		throw new Error('rings must be a whole number between 1 and 12');
	}
	if (!Number.isInteger(ringOffsetSteps) || ringOffsetSteps < 0 || ringOffsetSteps > 11) {
		throw new Error('ringOffsetSteps must be a whole number between 0 and 11');
	}
	if (offsetDirection !== 1 && offsetDirection !== -1) {
		throw new Error('offsetDirection must be 1 or -1');
	}
	if (typeof startNote !== 'string' || !/^[A-G](bb|##|[b#])?$/.test(startNote)) {
		throw new Error('startNote must be a note name such as C or Eb');
	}

	return { rings, ringOffsetSteps, offsetDirection, startNote };
}

/**
 * Bounds rather than free numbers.
 *
 * These come from sliders, so the ranges are already constrained in the UI —
 * but the endpoint is reachable without it, and a chord window of zero would
 * quietly break note clustering in a way that looks like broken MIDI.
 */
/** The three lengths the picker offers. Written once, read by both readers. */
const SESSION_LENGTHS: Array<Prefs['sessionLengthMinutes']> = [10, 20, 35];

export function parsePrefs(input: unknown): Prefs {
	if (typeof input !== 'object' || input === null) throw new Error('Prefs must be an object');
	const value = input as Record<string, unknown>;

	const length = Number(value.sessionLengthMinutes);
	if (!SESSION_LENGTHS.includes(length as Prefs['sessionLengthMinutes'])) {
		throw new Error('sessionLengthMinutes must be 10, 20 or 35');
	}

	const bounded = (name: string, min: number, max: number) => {
		const n = Number(value[name]);
		if (!Number.isFinite(n) || n < min || n > max) {
			throw new Error(`${name} must be between ${min} and ${max}`);
		}
		return Math.round(n);
	};

	return {
		sessionLengthMinutes: length as Prefs['sessionLengthMinutes'],
		revealDelayMs: bounded('revealDelayMs', 0, 30_000),
		chordClusterWindowMs: bounded('chordClusterWindowMs', 20, 500),
		midiLatencyOffsetMs: bounded('midiLatencyOffsetMs', -500, 500),
		ladderWidths: readFrontier(value)
	};
}

/**
 * The frontier, from a row that may predate it.
 *
 * Three cases, in this order, and the order is the migration:
 *
 *   1. A well-formed `ladderWidths` is taken as it stands.
 *   2. Otherwise a stored `ladderKey` and `ladderRung` are converted to the
 *      frontier they always meant — the same set of cells, expressed the new
 *      way. This is what upgrades an existing account without it losing ground.
 *   3. Otherwise the beginning.
 *
 * Anything malformed falls through rather than throwing. The old code threw on
 * an unknown key, which was right when the value named a single place the
 * planner had to find; a widths array that has been fiddled with is better read
 * as "start again" than as a five-hundred, because the practice record it
 * belongs to is still perfectly good.
 */
function readFrontier(value: Record<string, unknown>): number[] {
	const stored = value.ladderWidths;
	if (Array.isArray(stored)) {
		const widths = stored.map((w) => Number(w));
		if (isWellFormed({ widths })) return widths;
	}

	const key = value.ladderKey;
	const rung = value.ladderRung;
	if (typeof key === 'string' && typeof rung === 'string') {
		const migrated = frontierFromPosition(key, rung);
		if (migrated) return migrated.widths;
	}

	return [...FIRST_FRONTIER.widths];
}

/** Kept honest by a test: the two constants describe the same ladder. */
export const LADDER_SHAPE = { rungs: RUNGS.length, keys: STAGES.length };

/**
 * Prefs as stored, read forgivingly, for the path that loads rather than saves.
 *
 * **`parsePrefs` was only ever on the write path, and that was the bug.**
 * `toAppSettings` cast `prefs_json` straight to `Prefs`, so a row written before
 * a field existed came back missing it and nothing noticed until something read
 * it — which for the frontier meant every existing account 500ing on its first
 * request after the upgrade. Found by running the app against a row shaped like
 * a real one; no unit test was ever going to catch it, because every test built
 * its prefs in TypeScript where the field is not optional.
 *
 * So there are two readers now and the difference between them is the point.
 * `parsePrefs` is strict and is what an API request goes through: somebody
 * posting a session length of seven should be refused. This one is tolerant and
 * is what a stored row goes through: a field that is missing or has been
 * fiddled with falls back to its default, because refusing to load the settings
 * would lock somebody out of an account whose practice record is perfectly good.
 */
export function readPrefs(stored: unknown): Prefs {
	const value =
		typeof stored === 'object' && stored !== null ? (stored as Record<string, unknown>) : {};

	const number = (name: keyof Prefs, fallback: number, min: number, max: number) => {
		const n = Number(value[name]);
		return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : fallback;
	};

	const length = Number(value.sessionLengthMinutes);
	const sessionLength = SESSION_LENGTHS.includes(length as Prefs['sessionLengthMinutes'])
		? (length as Prefs['sessionLengthMinutes'])
		: DEFAULT_PREFS.sessionLengthMinutes;

	return {
		sessionLengthMinutes: sessionLength,
		revealDelayMs: number('revealDelayMs', DEFAULT_PREFS.revealDelayMs, 0, 30_000),
		chordClusterWindowMs: number(
			'chordClusterWindowMs',
			DEFAULT_PREFS.chordClusterWindowMs,
			20,
			500
		),
		midiLatencyOffsetMs: number(
			'midiLatencyOffsetMs',
			DEFAULT_PREFS.midiLatencyOffsetMs,
			-500,
			500
		),
		ladderWidths: readFrontier(value)
	};
}

/**
 * Prefs from a settings request, with the frontier left exactly as it was.
 *
 * `/api/settings` is the one write path that takes prefs from the browser, and
 * the only thing on that screen is four sliders. The frontier rides along in the
 * same object because the settings menu is a layout component that copies the
 * whole `Prefs` once when it mounts — so by the time somebody drags the reveal
 * delay, its `ladderWidths` can be several deepen/widen moves behind the row.
 * `parsePrefs` would take that stale staircase as authoritative and quietly roll
 * the ladder back. The frontier moves through the deepen / widen / step-back
 * actions and nowhere else, so this keeps whatever is stored and ignores what
 * the request said about it.
 */
export function prefsFromRequest(input: unknown, stored: Prefs): Prefs {
	return { ...parsePrefs(input), ladderWidths: stored.ladderWidths };
}

/**
 * The remembered MIDI device, by name.
 *
 * Names come from the driver, so they are trusted only as far as being a
 * reasonable length string; `null` clears the preference.
 */
export function parseDeviceName(input: unknown): string | null {
	if (input === null) return null;
	if (typeof input !== 'string') throw new Error('midiDevice must be a string or null');
	const name = input.trim();
	if (name.length === 0) return null;
	if (name.length > 200) throw new Error('midiDevice name is implausibly long');
	return name;
}

export function parseTourSeen(input: unknown): boolean {
	if (typeof input !== 'boolean') throw new Error('tourSeen must be a boolean');
	return input;
}

export function parseColorMap(input: unknown): ColorMap {
	if (!Array.isArray(input) || input.length !== 12) {
		throw new Error('Colour map must be twelve colours');
	}

	return input.map((entry, index) => {
		if (typeof entry !== 'object' || entry === null) {
			throw new Error(`Colour ${index} must be an object`);
		}
		const value = entry as Record<string, unknown>;
		const colour: Oklch = { l: Number(value.l), c: Number(value.c), h: Number(value.h) };

		if (!Number.isFinite(colour.l) || colour.l < 0 || colour.l > 1) {
			throw new Error(`Colour ${index}: lightness must be between 0 and 1`);
		}
		if (!Number.isFinite(colour.c) || colour.c < 0 || colour.c > 0.5) {
			throw new Error(`Colour ${index}: chroma must be between 0 and 0.5`);
		}
		if (!Number.isFinite(colour.h)) {
			throw new Error(`Colour ${index}: hue must be a number`);
		}
		colour.h = ((colour.h % 360) + 360) % 360;

		if (!isInSrgbGamut(colour)) {
			throw new Error(`Colour ${index} is outside sRGB and would not render as chosen`);
		}
		return colour;
	});
}
