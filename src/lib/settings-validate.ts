import { isInSrgbGamut, type Oklch } from './design/color';
import { rungById, stageByKey } from './curriculum/ladder';
import type { ColorMap, Prefs, WheelConfig } from './settings';

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
export function parsePrefs(input: unknown): Prefs {
	if (typeof input !== 'object' || input === null) throw new Error('Prefs must be an object');
	const value = input as Record<string, unknown>;

	const length = Number(value.sessionLengthMinutes);
	if (![10, 20, 35].includes(length)) {
		throw new Error('sessionLengthMinutes must be 10, 20 or 35');
	}

	const bounded = (name: string, min: number, max: number) => {
		const n = Number(value[name]);
		if (!Number.isFinite(n) || n < min || n > max) {
			throw new Error(`${name} must be between ${min} and ${max}`);
		}
		return Math.round(n);
	};

	// The ladder position has to name a real place, or the session planner would
	// be asked for material that does not exist.
	const ladderKey = String(value.ladderKey ?? 'C');
	const ladderRung = String(value.ladderRung ?? 'scale');
	if (!stageByKey(ladderKey)) throw new Error(`Unknown key on the ladder: ${ladderKey}`);
	if (!rungById(ladderRung)) throw new Error(`Unknown rung: ${ladderRung}`);

	return {
		sessionLengthMinutes: length as Prefs['sessionLengthMinutes'],
		revealDelayMs: bounded('revealDelayMs', 0, 30_000),
		chordClusterWindowMs: bounded('chordClusterWindowMs', 20, 500),
		midiLatencyOffsetMs: bounded('midiLatencyOffsetMs', -500, 500),
		ladderKey,
		ladderRung
	};
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
