/**
 * Colour conversion, gamut checking and contrast, for the twelve pitch-class
 * swatches.
 *
 * Colours are authored in OKLCH because the palette has to be *editable*: the
 * colour editor exists so the screen can be matched to a physical object — a
 * painted wheel, coloured stickers on the keys. In OKLCH, dragging lightness
 * does not change hue and dragging hue does not change perceived lightness,
 * which is the only sane basis for such an editor. sRGB hex would make it
 * guesswork.
 *
 * Everything here is pure and dependency-free so it can be unit tested and can
 * also run at build time.
 */

export type Oklch = { l: number; c: number; h: number };
export type Rgb = { r: number; g: number; b: number };

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** OKLCH → linear sRGB. Values may fall outside [0,1] when out of gamut. */
export function oklchToLinearSrgb({ l, c, h }: Oklch): Rgb {
	const hRad = (h * Math.PI) / 180;
	const a = c * Math.cos(hRad);
	const bb = c * Math.sin(hRad);

	// Oklab → LMS' (Björn Ottosson)
	const lp = l + 0.3963377774 * a + 0.2158037573 * bb;
	const mp = l - 0.1055613458 * a - 0.0638541728 * bb;
	const sp = l - 0.0894841775 * a - 1.291485548 * bb;

	const L = lp * lp * lp;
	const M = mp * mp * mp;
	const S = sp * sp * sp;

	return {
		r: 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
		g: -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
		b: -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S
	};
}

const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

/** OKLCH → 8-bit sRGB, clamped into gamut. */
export function oklchToRgb(color: Oklch): Rgb {
	const lin = oklchToLinearSrgb(color);
	return {
		r: Math.round(clamp01(gamma(clamp01(lin.r))) * 255),
		g: Math.round(clamp01(gamma(clamp01(lin.g))) * 255),
		b: Math.round(clamp01(gamma(clamp01(lin.b))) * 255)
	};
}

export function oklchToHex(color: Oklch): string {
	const { r, g, b } = oklchToRgb(color);
	return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/**
 * True when the colour survives the trip to sRGB without clipping. A clipped
 * colour still renders, but it no longer has the lightness or chroma it claims
 * to have, which quietly breaks the editor's perceptual guarantees.
 */
export function isInSrgbGamut(color: Oklch, epsilon = 0.001): boolean {
	const { r, g, b } = oklchToLinearSrgb(color);
	return [r, g, b].every((v) => v >= -epsilon && v <= 1 + epsilon);
}

/**
 * Reduce chroma until the colour fits in sRGB, keeping lightness and hue exactly.
 *
 * This is the only safe way to correct an out-of-gamut colour for this app:
 * letting the browser clip instead would silently shift both lightness and hue,
 * and the wheel depends on colours staying recognisable as the note they mean.
 * Applies to derived chromatics and to anything typed into the colour editor.
 */
export function clampToGamut(color: Oklch, steps = 24): Oklch {
	if (isInSrgbGamut(color)) return color;
	let lo = 0;
	let hi = color.c;
	for (let i = 0; i < steps; i++) {
		const mid = (lo + hi) / 2;
		if (isInSrgbGamut({ ...color, c: mid })) lo = mid;
		else hi = mid;
	}
	// Floor, never round: rounding up would nudge the chroma back over the
	// boundary we just searched for.
	return { ...color, c: Math.floor(lo * 10000) / 10000 };
}

/** WCAG 2.1 relative luminance. */
export function relativeLuminance(color: Oklch): number {
	const lin = oklchToLinearSrgb(color);
	return 0.2126 * clamp01(lin.r) + 0.7152 * clamp01(lin.g) + 0.0722 * clamp01(lin.b);
}

/** WCAG 2.1 contrast ratio between two colours, 1–21. */
export function contrastRatio(a: Oklch, b: Oklch): number {
	const la = relativeLuminance(a);
	const lb = relativeLuminance(b);
	const [hi, lo] = la > lb ? [la, lb] : [lb, la];
	return (hi + 0.05) / (lo + 0.05);
}

/**
 * Picks whichever of two candidate ink colours reads better on `swatch`, and
 * reports the ratio so a caller (or a test) can tell when a hand-edited colour
 * has become unreadable rather than silently shipping grey-on-grey.
 */
export function contrastSafeInk(
	swatch: Oklch,
	darkInk: Oklch,
	lightInk: Oklch
): { ink: Oklch; ratio: number } {
	const dark = contrastRatio(swatch, darkInk);
	const light = contrastRatio(swatch, lightInk);
	return dark >= light ? { ink: darkInk, ratio: dark } : { ink: lightInk, ratio: light };
}

const round = (x: number, dp: number) => Number(x.toFixed(dp));

export const css = ({ l, c, h }: Oklch) => `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)})`;
