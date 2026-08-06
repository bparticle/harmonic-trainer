import { describe, expect, it } from 'vitest';
import {
	VelocityTracker,
	angleDelta,
	isAtRest,
	nearestDetent,
	normaliseAngle,
	pointerAngle,
	step,
	stepsForAngle,
	type RotationState
} from './rotation.svelte';

const settle = (start: RotationState, frames = 400, reducedMotion = false) => {
	let state = start;
	for (let i = 0; i < frames && !isAtRest(state); i++) state = step(state, reducedMotion);
	return state;
};

describe('angles', () => {
	it('normalises into 0..360', () => {
		expect(normaliseAngle(370)).toBe(10);
		expect(normaliseAngle(-30)).toBe(330);
		expect(normaliseAngle(0)).toBe(0);
	});

	it('takes the shorter way round', () => {
		expect(angleDelta(350, 10)).toBe(20);
		expect(angleDelta(10, 350)).toBe(-20);
		expect(angleDelta(0, 180)).toBe(180);
	});

	it('snaps to thirty-degree detents', () => {
		expect(nearestDetent(14)).toBe(0);
		expect(nearestDetent(16)).toBe(30);
		expect(nearestDetent(179)).toBe(180);
	});

	it('converts a rotation into circle-of-fifths steps', () => {
		expect(stepsForAngle(0)).toBe(0);
		expect(stepsForAngle(30)).toBe(1);
		expect(stepsForAngle(180)).toBe(6);
		expect(stepsForAngle(360)).toBe(0);
		expect(stepsForAngle(-30)).toBe(11);
	});

	it('measures pointer angle from twelve o’clock', () => {
		expect(pointerAngle(0, -100, 0, 0)).toBeCloseTo(0, 5);
		expect(pointerAngle(100, 0, 0, 0)).toBeCloseTo(90, 5);
		expect(pointerAngle(0, 100, 0, 0)).toBeCloseTo(180, 5);
		expect(pointerAngle(-100, 0, 0, 0)).toBeCloseTo(270, 5);
	});
});

describe('rotation physics', () => {
	it('does nothing while the pointer owns the wheel', () => {
		const dragging: RotationState = { angle: 17, velocity: 5, dragging: true };
		expect(step(dragging)).toEqual(dragging);
	});

	it('always comes to rest on a detent', () => {
		for (const angle of [0, 7, 14, 16, 29, 45, 183, 359]) {
			const resting = settle({ angle, velocity: 0, dragging: false });
			expect(isAtRest(resting), `from ${angle}`).toBe(true);
			expect(normaliseAngle(resting.angle) % 30, `from ${angle}`).toBeCloseTo(0, 6);
		}
	});

	it('carries momentum before settling', () => {
		const thrown: RotationState = { angle: 0, velocity: 8, dragging: false };
		const after = step(thrown);
		expect(after.angle).toBeGreaterThan(0);
		expect(after.velocity).toBeLessThan(8);
		expect(isAtRest(settle(thrown))).toBe(true);
	});

	it('travels further for a harder throw', () => {
		const gentle = settle({ angle: 0, velocity: 3, dragging: false });
		const hard = settle({ angle: 0, velocity: 12, dragging: false });
		const travelled = (s: RotationState) => normaliseAngle(s.angle);
		// Both land on a detent; the hard throw should have passed more of them.
		expect(travelled(hard)).not.toBe(travelled(gentle));
	});

	it('loses speed to friction rather than stopping dead', () => {
		let state: RotationState = { angle: 0, velocity: 10, dragging: false };
		const speeds: number[] = [];
		for (let i = 0; i < 5; i++) {
			state = step(state);
			speeds.push(Math.abs(state.velocity));
		}
		for (let i = 1; i < speeds.length; i++) {
			expect(speeds[i]).toBeLessThan(speeds[i - 1]);
		}
	});

	it('settles in a reasonable number of frames', () => {
		let state: RotationState = { angle: 0, velocity: 15, dragging: false };
		let frames = 0;
		while (!isAtRest(state) && frames < 1000) {
			state = step(state);
			frames++;
		}
		expect(frames).toBeLessThan(400);
	});

	it('goes straight to the detent when motion is reduced', () => {
		const state = step({ angle: 17, velocity: 9, dragging: false }, true);
		expect(state.angle).toBe(30);
		expect(state.velocity).toBe(0);
		expect(isAtRest(state)).toBe(true);
	});

	it('snaps backwards when that is nearer', () => {
		const resting = settle({ angle: 14, velocity: 0, dragging: false });
		expect(normaliseAngle(resting.angle)).toBe(0);
	});
});

describe('velocity tracking', () => {
	it('reports nothing from a single sample', () => {
		const tracker = new VelocityTracker();
		tracker.add(10, 0);
		expect(tracker.velocity()).toBe(0);
	});

	it('measures a steady sweep', () => {
		const tracker = new VelocityTracker();
		// Six degrees every 16ms is one frame's worth per frame.
		tracker.add(0, 0);
		tracker.add(6, 16);
		expect(tracker.velocity()).toBeCloseTo(6.25, 1);
	});

	it('handles the wrap past zero without a huge spike', () => {
		const tracker = new VelocityTracker();
		tracker.add(350, 0);
		tracker.add(10, 16);
		expect(Math.abs(tracker.velocity())).toBeLessThan(100);
		expect(tracker.velocity()).toBeGreaterThan(0);
	});

	it('keeps only recent samples', () => {
		const tracker = new VelocityTracker();
		for (let i = 0; i < 20; i++) tracker.add(i * 2, i * 16);
		expect(tracker.velocity()).toBeGreaterThan(0);
	});

	it('resets', () => {
		const tracker = new VelocityTracker();
		tracker.add(0, 0);
		tracker.add(30, 16);
		tracker.clear();
		expect(tracker.velocity()).toBe(0);
	});
});
