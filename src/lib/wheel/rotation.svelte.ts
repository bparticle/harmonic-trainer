/**
 * Drag rotation with momentum and detent snapping.
 *
 * The wheel is a physical object in this app, not a chart. Grabbing it should
 * feel like grabbing the real thing: it carries your speed when you let go, it
 * loses that speed to friction, and it settles into one of the twelve detents
 * with a little pull rather than jumping there.
 *
 * Kept out of the component so the physics can be reasoned about — and tested —
 * without a DOM.
 */

const DETENT = 30; // degrees per circle-of-fifths step
const FRICTION = 0.94;
const SNAP_STIFFNESS = 0.12;
const SNAP_DAMPING = 0.75;
/** Below this the wheel is considered stopped, in degrees per frame. */
const REST_VELOCITY = 0.02;
/** Above this it keeps coasting rather than snapping. */
const COAST_VELOCITY = 0.6;

export const normaliseAngle = (deg: number) => ((deg % 360) + 360) % 360;

/** Shortest signed distance from `from` to `to`, in -180..180. */
export function angleDelta(from: number, to: number): number {
	const raw = normaliseAngle(to - from);
	return raw > 180 ? raw - 360 : raw;
}

/** Nearest detent to an angle. */
export function nearestDetent(angle: number): number {
	return Math.round(angle / DETENT) * DETENT;
}

/** How many circle-of-fifths steps a rotation represents. */
export function stepsForAngle(angle: number): number {
	return Math.round(normaliseAngle(angle) / DETENT) % 12;
}

export type RotationState = {
	angle: number;
	velocity: number;
	dragging: boolean;
};

/**
 * Advance the rotation one frame.
 *
 * While dragging, the pointer owns the angle entirely. Once released, momentum
 * carries it until friction brings it slow enough to be captured by the nearest
 * detent, which then pulls it in as a damped spring.
 */
export function step(state: RotationState, reducedMotion = false): RotationState {
	if (state.dragging) return state;

	if (reducedMotion) {
		// No coasting, no spring: go straight to the detent.
		return { ...state, angle: nearestDetent(state.angle), velocity: 0 };
	}

	let { angle, velocity } = state;

	if (Math.abs(velocity) > COAST_VELOCITY) {
		velocity *= FRICTION;
		angle += velocity;
		return { ...state, angle: normaliseAngle(angle), velocity };
	}

	const target = nearestDetent(angle);
	const pull = angleDelta(angle, target) * SNAP_STIFFNESS;
	velocity = (velocity + pull) * SNAP_DAMPING;
	angle += velocity;

	if (Math.abs(velocity) < REST_VELOCITY && Math.abs(angleDelta(angle, target)) < 0.1) {
		return { ...state, angle: normaliseAngle(target), velocity: 0 };
	}

	return { ...state, angle: normaliseAngle(angle), velocity };
}

/**
 * Settled means stopped *on a detent*, not merely momentarily still. A wheel
 * released at rest between two detents still has to be pulled into one.
 */
export function isAtRest(state: RotationState): boolean {
	return (
		!state.dragging &&
		state.velocity === 0 &&
		Math.abs(angleDelta(state.angle, nearestDetent(state.angle))) < 1e-6
	);
}

/** Angle in degrees of a point around a centre, measured from twelve o'clock. */
export function pointerAngle(x: number, y: number, cx: number, cy: number): number {
	return normaliseAngle((Math.atan2(y - cy, x - cx) * 180) / Math.PI + 90);
}

/**
 * A small rolling average of recent pointer motion.
 *
 * Using the last single frame makes the throw feel twitchy, and using the whole
 * gesture makes it feel dead. Three samples is enough to smooth a jittery
 * trackpad without lagging behind an intentional flick.
 */
export class VelocityTracker {
	#samples: Array<{ angle: number; time: number }> = [];

	add(angle: number, time: number) {
		this.#samples.push({ angle, time });
		if (this.#samples.length > 4) this.#samples.shift();
	}

	clear() {
		this.#samples = [];
	}

	/** Degrees per frame at 60fps. */
	velocity(): number {
		if (this.#samples.length < 2) return 0;
		const first = this.#samples[0];
		const last = this.#samples[this.#samples.length - 1];
		const elapsed = last.time - first.time;
		if (elapsed <= 0) return 0;
		const degrees = angleDelta(first.angle, last.angle);
		return (degrees / elapsed) * (1000 / 60);
	}
}
