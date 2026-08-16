import { describe, expect, it } from 'vitest';
import {
	confettiFall,
	fade,
	landBurst,
	shockwave,
	sparkBurst,
	step,
	type Particle,
	type Random
} from './sparkle';

/** A random that is not: walks 0, 0.1, … 0.9 and repeats, so a burst is assertable. */
const cycling = (): Random => {
	let n = 0;
	return () => (n++ % 10) / 10;
};

const at = (overrides: Partial<Particle> = {}): Particle => ({
	kind: 'spark',
	x: 0,
	y: 0,
	vx: 0,
	vy: 0,
	life: 1,
	ttl: 1,
	size: 2,
	pc: 0,
	spin: 0,
	spinRate: 0,
	weight: 1,
	grow: 0,
	...overrides
});

describe('stepping the simulation', () => {
	it('moves a particle by its velocity, less what the air took', () => {
		const [moved] = step([at({ vx: 100, vy: 0, weight: 0 })], 1 / 60);
		expect(moved.x).toBeGreaterThan(1.5);
		expect(moved.x).toBeLessThan(100 / 60);
		expect(moved.vx).toBeLessThan(100);
	});

	it('pulls things down', () => {
		const [falling] = step([at()], 0.1);
		expect(falling.vy).toBeGreaterThan(0);
		expect(falling.y).toBeGreaterThan(0);
	});

	it('leaves a weightless particle where gravity cannot reach it', () => {
		const [ring] = step([at({ weight: 0 })], 0.5);
		expect(ring.vy).toBe(0);
		expect(ring.y).toBe(0);
	});

	it('drops particles once their life runs out', () => {
		expect(step([at({ life: 0.05 })], 0.1)).toHaveLength(0);
	});

	it('grows a ring rather than moving it', () => {
		const [ring] = step([at({ kind: 'ring', weight: 0, grow: 400, size: 10 })], 0.05);
		expect(ring.size).toBe(30);
		expect(ring.x).toBe(0);
	});

	/*
	 * The physics has to be frame-rate independent, or a burst is a different
	 * shape on a 120Hz tablet than on a 60Hz laptop. Drag is the part that gets
	 * this wrong when written as a per-frame multiplier, so it is the part
	 * checked here.
	 */
	it('lands in the same place whether it was stepped often or seldom', () => {
		const coarse = [at({ vx: 300, vy: -400 })];
		const fine = [at({ vx: 300, vy: -400 })];

		for (let i = 0; i < 6; i++) step(coarse, 1 / 60);
		for (let i = 0; i < 12; i++) step(fine, 1 / 120);

		expect(coarse[0].x).toBeCloseTo(fine[0].x, 0);
		expect(coarse[0].y).toBeCloseTo(fine[0].y, 0);
	});

	it('ignores the enormous gap a backgrounded tab hands back', () => {
		// Tone's draw queue stops with the tab, and coming back to a burst that
		// has teleported off the bottom of the screen looks like a bug.
		const jumped = step([at({ vx: 0, vy: 0, life: 10, ttl: 10 })], 45);
		expect(jumped[0].y).toBeLessThan(10);
	});
});

describe('fading', () => {
	it('is full at birth and gone at death', () => {
		expect(fade(at({ life: 1, ttl: 1 }))).toBe(1);
		expect(fade(at({ life: 0, ttl: 1 }))).toBe(0);
		expect(fade(at({ life: 0.5, ttl: 2 }))).toBe(0.25);
	});
});

describe('bursts', () => {
	it('carries the note it came from, and only that note', () => {
		const sparks = sparkBurst({ x: 10, y: 20, pc: 7 }, cycling());
		expect(sparks.every((p) => p.pc === 7)).toBe(true);
	});

	it('starts every particle where it was fired from', () => {
		const sparks = sparkBurst({ x: 10, y: 20, pc: 3 }, cycling());
		expect(sparks.every((p) => p.x === 10 && p.y === 20)).toBe(true);
	});

	it('throws more of them the more power it is given', () => {
		const quiet = sparkBurst({ x: 0, y: 0, pc: 0, power: 0 }, cycling());
		const loud = sparkBurst({ x: 0, y: 0, pc: 0, power: 1 }, cycling());
		expect(loud.length).toBeGreaterThan(quiet.length);
	});

	it('aims where it is told', () => {
		// Fired straight down with no spread: everything should be heading down.
		const down = sparkBurst({ x: 0, y: 0, pc: 0, aim: Math.PI / 2, arc: 0 }, cycling());
		expect(down.every((p) => p.vy > 0)).toBe(true);
	});

	it('gives a landed chord stars and exactly one shockwave', () => {
		const landed = landBurst({ x: 0, y: 0, pc: 5 }, cycling());
		expect(landed.filter((p) => p.kind === 'star').length).toBeGreaterThan(0);
		expect(landed.filter((p) => p.kind === 'ring')).toHaveLength(1);
	});

	it('makes a shockwave weightless and growing', () => {
		const ring = shockwave(0, 0, 2);
		expect(ring.weight).toBe(0);
		expect(ring.grow).toBeGreaterThan(0);
	});
});

describe('the confetti at the end of a good run', () => {
	it('uses every colour in the tune', () => {
		const fall = confettiFall(800, [0, 4, 7], 60, cycling());
		expect(new Set(fall.map((p) => p.pc))).toEqual(new Set([0, 4, 7]));
	});

	it('starts above the fold, so what you see is a fall', () => {
		const fall = confettiFall(800, [0], 40, cycling());
		expect(fall.every((p) => p.y < 0)).toBe(true);
	});

	it('spreads across the width it is given', () => {
		const fall = confettiFall(800, [0], 40, cycling());
		expect(fall.every((p) => p.x >= 0 && p.x <= 800)).toBe(true);
		expect(Math.max(...fall.map((p) => p.x))).toBeGreaterThan(400);
	});

	it('copes with a chart whose colours it was never given', () => {
		expect(confettiFall(800, [], 5, cycling())).toHaveLength(5);
	});
});
