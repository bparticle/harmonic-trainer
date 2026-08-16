import { describe, expect, it } from 'vitest';
import {
	clampToGamut,
	contrastRatio,
	contrastSafeInk,
	isInSrgbGamut,
	oklchToHex,
	oklchToRgb,
	relativeLuminance
} from './color';
import {
	DEFAULT_PALETTE,
	GROUND,
	INK,
	SWATCH_INK_DARK,
	SWATCH_INK_LIGHT,
	deepen,
	derivePalette,
	outOfGamut,
	paletteToCssVars
} from './palette';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

describe('oklch conversion', () => {
	it('round-trips known sRGB primaries within a rounding step', () => {
		// Reference values from the Oklab specification.
		expect(oklchToHex({ l: 1, c: 0, h: 0 })).toBe('#ffffff');
		expect(oklchToHex({ l: 0, c: 0, h: 0 })).toBe('#000000');
		expect(oklchToRgb({ l: 0.627955, c: 0.257683, h: 29.2338 })).toEqual({ r: 255, g: 0, b: 0 });
		expect(oklchToRgb({ l: 0.86644, c: 0.294827, h: 142.4953 })).toEqual({ r: 0, g: 255, b: 0 });
		expect(oklchToRgb({ l: 0.452014, c: 0.313214, h: 264.052 })).toEqual({ r: 0, g: 0, b: 255 });
	});

	it('orders luminance the way the eye does', () => {
		const yellow = { l: 0.87, c: 0.15, h: 96 };
		const blue = { l: 0.62, c: 0.15, h: 245 };
		expect(relativeLuminance(yellow)).toBeGreaterThan(relativeLuminance(blue));
	});

	it('detects out-of-gamut colours', () => {
		expect(isInSrgbGamut({ l: 0.6, c: 0.1, h: 250 })).toBe(true);
		// No such thing as a chroma-0.5 blue in sRGB.
		expect(isInSrgbGamut({ l: 0.6, c: 0.5, h: 250 })).toBe(false);
	});

	it('clamps chroma into gamut while holding lightness and hue exactly', () => {
		const wild = { l: 0.6, c: 0.5, h: 250 };
		const fixed = clampToGamut(wild);
		expect(isInSrgbGamut(fixed)).toBe(true);
		expect(fixed.l).toBe(wild.l);
		expect(fixed.h).toBe(wild.h);
		expect(fixed.c).toBeLessThan(wild.c);
	});

	it('leaves an in-gamut colour untouched', () => {
		const fine = { l: 0.6, c: 0.1, h: 250 };
		expect(clampToGamut(fine)).toEqual(fine);
	});

	it('clamps to a value that survives being rounded for css', () => {
		// Rounding the clamped chroma up would put it straight back out of gamut.
		for (let h = 0; h < 360; h += 7) {
			const clamped = clampToGamut({ l: 0.7, c: 0.4, h });
			expect(isInSrgbGamut(clamped), `hue ${h}`).toBe(true);
		}
	});
});

describe('pitch-class palette', () => {
	it('has exactly twelve colours', () => {
		expect(DEFAULT_PALETTE).toHaveLength(12);
	});

	it('renders every swatch inside sRGB', () => {
		const bad = outOfGamut().map((i) => `${NOTE_NAMES[i]} (${JSON.stringify(DEFAULT_PALETTE[i])})`);
		expect(bad).toEqual([]);
	});

	it('gives every swatch a readable ink at WCAG AA for large text', () => {
		const failures = DEFAULT_PALETTE.map((swatch, i) => {
			const { ratio } = contrastSafeInk(swatch, SWATCH_INK_DARK, SWATCH_INK_LIGHT);
			return { note: NOTE_NAMES[i], ratio: Number(ratio.toFixed(2)) };
		}).filter((r) => r.ratio < 4.5);
		expect(failures).toEqual([]);
	});

	it('keeps every swatch legible against the app ground', () => {
		const failures = DEFAULT_PALETTE.map((swatch, i) => ({
			note: NOTE_NAMES[i],
			ratio: Number(contrastRatio(swatch, GROUND.base).toFixed(2))
		})).filter((r) => r.ratio < 3);
		expect(failures).toEqual([]);
	});

	it('makes neighbouring pitch classes visually distinct', () => {
		// Adjacent semitones must not collapse into the same colour, or the wheel
		// and the keyboard diagrams stop teaching anything.
		const tooClose: string[] = [];
		for (let i = 0; i < 12; i++) {
			const a = DEFAULT_PALETTE[i];
			const b = DEFAULT_PALETTE[(i + 1) % 12];
			const hueGap = Math.abs(((b.h - a.h + 540) % 360) - 180);
			const lightGap = Math.abs(b.l - a.l);
			if (hueGap < 12 && lightGap < 0.08) {
				tooClose.push(`${NOTE_NAMES[i]}/${NOTE_NAMES[(i + 1) % 12]}`);
			}
		}
		expect(tooClose).toEqual([]);
	});

	it('places each chromatic between its two diatonic neighbours', () => {
		// C# sits between C and D, and so on — the rule the physical wheel was painted by.
		const chromatics: Array<[number, number, number]> = [
			[1, 0, 2],
			[3, 2, 4],
			[6, 5, 7],
			[8, 7, 9],
			[10, 9, 11]
		];
		for (const [pc, lo, hi] of chromatics) {
			const l = DEFAULT_PALETTE[pc].l;
			const bounds = [DEFAULT_PALETTE[lo].l, DEFAULT_PALETTE[hi].l].sort((x, y) => x - y);
			expect(l).toBeGreaterThanOrEqual(bounds[0] - 1e-9);
			expect(l).toBeLessThanOrEqual(bounds[1] + 1e-9);
		}
	});

	it('interpolates hue across the shorter arc', () => {
		// A palette whose anchors straddle 0° must not send the midpoint the long way round.
		const wrapped = derivePalette({
			...{ 0: { l: 0.6, c: 0.1, h: 350 }, 2: { l: 0.6, c: 0.1, h: 10 } },
			4: { l: 0.6, c: 0.1, h: 96 },
			5: { l: 0.6, c: 0.1, h: 148 },
			7: { l: 0.6, c: 0.1, h: 245 },
			9: { l: 0.6, c: 0.1, h: 285 },
			11: { l: 0.6, c: 0.1, h: 325 }
		});
		expect(wrapped[1].h).toBeCloseTo(0, 5);
	});

	it('emits a colour, an ink and a deepened variable per pitch class', () => {
		const vars = paletteToCssVars();
		expect(Object.keys(vars)).toHaveLength(36);
		expect(vars['--pc-0']).toMatch(/^oklch\(/);
		expect(vars['--pc-11-ink']).toMatch(/^oklch\(/);
		expect(vars['--pc-11-deep']).toMatch(/^oklch\(/);
	});
});

/*
 * The dimmed companion to each swatch, used wherever a surface needs the same
 * note turned down rather than a different colour — the scale diagrams, so far.
 */
describe('deepened swatches', () => {
	it('holds the hue exactly, which is the whole point', () => {
		for (const [i, swatch] of DEFAULT_PALETTE.entries()) {
			expect(deepen(swatch).h, NOTE_NAMES[i]).toBe(swatch.h);
		}
	});

	it('is darker than the swatch it came from', () => {
		for (const [i, swatch] of DEFAULT_PALETTE.entries()) {
			expect(deepen(swatch).l, NOTE_NAMES[i]).toBeLessThan(swatch.l);
		}
	});

	it('stays inside sRGB, so no browser has to guess', () => {
		const bad = DEFAULT_PALETTE.map((swatch, i) => ({ note: NOTE_NAMES[i], deep: deepen(swatch) }))
			.filter((entry) => !isInSrgbGamut(entry.deep))
			.map((entry) => entry.note);
		expect(bad).toEqual([]);
	});

	/*
	 * The failure this exists to prevent. Mixing a swatch towards the ground —
	 * the old way of dimming one — roughly halves its chroma, and a palette at
	 * half chroma is what "muddy" means. Giving up a little chroma at the gamut
	 * boundary is fine; giving up half of it is not.
	 */
	it('keeps most of the chroma, unlike mixing towards the ground', () => {
		// Seven of the twelve lose nothing at all. The tightest is F♯ at about
		// 0.70 — the cyan that sRGB already could not reach at full lightness,
		// and which has even less room once darkened. Mixing towards the ground
		// leaves roughly 0.5 across the board, which is what looked muddy.
		for (const [i, swatch] of DEFAULT_PALETTE.entries()) {
			expect(deepen(swatch).c, NOTE_NAMES[i]).toBeGreaterThan(swatch.c * 0.65);
		}
	});

	it('never adds chroma a swatch did not have', () => {
		for (const [i, swatch] of DEFAULT_PALETTE.entries()) {
			expect(deepen(swatch).c, NOTE_NAMES[i]).toBeLessThanOrEqual(swatch.c);
		}
	});

	it('stays distinct from the ground it is drawn on', () => {
		for (const [i, swatch] of DEFAULT_PALETTE.entries()) {
			expect(contrastRatio(deepen(swatch), GROUND.base), NOTE_NAMES[i]).toBeGreaterThan(1.4);
		}
	});
});

describe('ground and ink', () => {
	it('keeps body text well clear of AA on the base ground', () => {
		expect(contrastRatio(INK.bright, GROUND.base)).toBeGreaterThan(12);
		expect(contrastRatio(INK.muted, GROUND.base)).toBeGreaterThan(7);
	});

	it('keeps dim text usable for secondary labels', () => {
		expect(contrastRatio(INK.dim, GROUND.base)).toBeGreaterThan(4.5);
	});

	it('keeps the ground near-achromatic so the pitch colours carry the chroma', () => {
		for (const g of Object.values(GROUND)) expect(g.c).toBeLessThan(0.02);
	});

	it('separates the ground layers enough to read as surfaces', () => {
		expect(GROUND.raised.l - GROUND.base.l).toBeGreaterThan(0.02);
		expect(GROUND.line.l).toBeGreaterThan(GROUND.overlay.l);
	});
});
