import { isInSrgbGamut, type Oklch } from './design/color';
import type { ColorMap, WheelConfig } from './settings';

/**
 * Validation for the two settings the UI can write.
 *
 * Both come from screens the user drags sliders on, so they are checked rather
 * than trusted: an out-of-gamut colour or a zero-ring wheel would not crash
 * anything, it would just quietly render wrong, which is worse.
 */

export function parseWheelConfig(input: unknown): WheelConfig {
	if (typeof input !== 'object' || input === null) throw new Error('Wheel config must be an object');
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
