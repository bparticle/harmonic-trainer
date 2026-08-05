import type { Oklch } from './color';
import { clampToGamut, contrastSafeInk, css, isInSrgbGamut } from './color';

/**
 * The twelve pitch-class colours.
 *
 * Pitch classes are indexed 0–11 from C. This module deals only in pitch-class
 * *index*; it knows nothing about spelling. A note's spelling (G# vs Ab) is the
 * music core's job — both spellings of one pitch class share a colour, exactly
 * as they share a key on the keyboard and a cell on the wheel.
 *
 * Only seven colours are authored. The five chromatic notes are *derived* by
 * interpolating between their diatonic neighbours, because that is the rule the
 * physical wheel was painted by. Expressing it as code rather than as twelve
 * magic hex values means editing "green" in the colour editor drags F# and its
 * neighbours along coherently.
 */

export type PitchClass = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

/** Chakra-derived anchors, keyed by the semitone offset of the natural note. */
export const DIATONIC_ANCHORS: Record<number, Oklch> = {
	0: { l: 0.66, c: 0.19, h: 27 }, // C  red
	2: { l: 0.76, c: 0.16, h: 58 }, // D  orange
	4: { l: 0.87, c: 0.15, h: 96 }, // E  yellow
	5: { l: 0.74, c: 0.16, h: 148 }, // F  green
	7: { l: 0.62, c: 0.15, h: 245 }, // G  blue
	9: { l: 0.56, c: 0.17, h: 285 }, // A  indigo
	11: { l: 0.62, c: 0.19, h: 325 } // B  violet
};

/** Which two anchors each chromatic pitch class sits between. */
const CHROMATIC_PARENTS: Record<number, [number, number]> = {
	1: [0, 2], // C#/Db  between red and orange
	3: [2, 4], // D#/Eb  between orange and yellow
	6: [5, 7], // F#/Gb  between green and blue
	8: [7, 9], // G#/Ab  between blue and indigo
	10: [9, 11] // A#/Bb  between indigo and violet
};

/** Interpolate hue along the shorter arc, so an edited palette cannot wrap the wrong way. */
function lerpHue(a: number, b: number, t: number): number {
	let delta = ((b - a + 540) % 360) - 180;
	return (a + delta * t + 360) % 360;
}

function lerp(a: Oklch, b: Oklch, t: number): Oklch {
	return {
		l: a.l + (b.l - a.l) * t,
		c: a.c + (b.c - a.c) * t,
		h: lerpHue(a.h, b.h, t)
	};
}

/**
 * Build all twelve colours from the seven anchors. Chromatics land exactly
 * halfway between their neighbours — which is also where they sit on the wheel.
 *
 * Every result is gamut-clamped. Interpolating two in-gamut colours does not
 * give an in-gamut colour: F#, midway between green and blue, lands on a cyan
 * that sRGB cannot reach at that lightness. Clamping chroma there preserves the
 * lightness and hue that make it read as "between F and G".
 */
export function derivePalette(anchors: Record<number, Oklch> = DIATONIC_ANCHORS): Oklch[] {
	const out: Oklch[] = [];
	for (let pc = 0; pc < 12; pc++) {
		const anchor = anchors[pc];
		if (anchor) {
			out.push(clampToGamut(anchor));
			continue;
		}
		const [lo, hi] = CHROMATIC_PARENTS[pc];
		out.push(clampToGamut(lerp(anchors[lo], anchors[hi], 0.5)));
	}
	return out;
}

export const DEFAULT_PALETTE: Oklch[] = derivePalette();

/** The neutral ground and ink. Deep and near-achromatic so the twelve hues carry all the chroma. */
export const GROUND = {
	base: { l: 0.16, c: 0.008, h: 265 },
	raised: { l: 0.2, c: 0.009, h: 265 },
	overlay: { l: 0.25, c: 0.01, h: 265 },
	line: { l: 0.31, c: 0.011, h: 265 }
} as const satisfies Record<string, Oklch>;

export const INK = {
	dim: { l: 0.58, c: 0.012, h: 265 },
	muted: { l: 0.74, c: 0.01, h: 265 },
	bright: { l: 0.97, c: 0.004, h: 265 }
} as const satisfies Record<string, Oklch>;

/**
 * Ink candidates for text sitting *on* a pitch swatch.
 *
 * Pushed close to the extremes on purpose. The mid-lightness swatches — A#/Bb
 * especially — sit where neither a soft dark nor a soft light ink clears 4.5:1,
 * so the candidates have to be near-black and near-white. Both keep a trace of
 * the ground's hue rather than being pure #000/#fff, which reads as cheap.
 */
export const SWATCH_INK_DARK: Oklch = { l: 0.1, c: 0.012, h: 265 };
export const SWATCH_INK_LIGHT: Oklch = { l: 0.99, c: 0.002, h: 265 };

/**
 * Emit the palette as CSS custom properties. The colour map lives in the
 * database, so these are injected at runtime rather than compiled into a
 * stylesheet — that is what makes the colour editor possible.
 */
export function paletteToCssVars(palette: Oklch[] = DEFAULT_PALETTE): Record<string, string> {
	const vars: Record<string, string> = {};
	palette.forEach((swatch, pc) => {
		const { ink } = contrastSafeInk(swatch, SWATCH_INK_DARK, SWATCH_INK_LIGHT);
		vars[`--pc-${pc}`] = css(swatch);
		vars[`--pc-${pc}-ink`] = css(ink);
	});
	return vars;
}

export function paletteToCssText(palette: Oklch[] = DEFAULT_PALETTE): string {
	return Object.entries(paletteToCssVars(palette))
		.map(([k, v]) => `${k}:${v};`)
		.join('');
}

/** Reports any swatch that clips when converted to sRGB. Used by the palette test and the editor. */
export function outOfGamut(palette: Oklch[] = DEFAULT_PALETTE): number[] {
	return palette.map((_, i) => i).filter((i) => !isInSrgbGamut(palette[i]));
}
