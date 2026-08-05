import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { css } from './color';
import { GROUND, INK } from './palette';

/**
 * The ground and ink values exist twice: as OKLCH objects in palette.ts (used
 * by the contrast maths) and as literals in layout.css (used by Tailwind to
 * generate utilities). Tailwind cannot read them from TypeScript at build time,
 * so this test is what stops the two drifting apart.
 */
const CSS = readFileSync('src/routes/layout.css', 'utf8');

function declaredValue(name: string): string | null {
	const match = CSS.match(new RegExp(`${name}:\\s*([^;]+);`));
	return match ? match[1].trim() : null;
}

describe('css tokens match the design module', () => {
	const cases: Array<[string, ReturnType<typeof css>]> = [
		['--color-ground', css(GROUND.base)],
		['--color-ground-raised', css(GROUND.raised)],
		['--color-ground-overlay', css(GROUND.overlay)],
		['--color-ground-line', css(GROUND.line)],
		['--color-ink-dim', css(INK.dim)],
		['--color-ink-muted', css(INK.muted)],
		['--color-ink', css(INK.bright)]
	];

	it.each(cases)('%s', (name, expected) => {
		expect(declaredValue(name)).toBe(expected);
	});

	it('defines no pitch-class colours in css — those come from the database', () => {
		expect(CSS).not.toMatch(/--pc-\d+\s*:/);
	});
});
