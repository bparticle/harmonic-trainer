/**
 * The particles behind the play-along fireworks.
 *
 * Pure, so the physics can be tested without a canvas and without a frame
 * clock. Nothing here knows what a colour is: a particle carries the pitch
 * class it came from and the renderer looks that up in the palette, for the
 * same reason every other surface in this app does — hue means pitch, and a
 * spark that invented its own colour would be the first thing in the app to
 * lie about which note it belongs to.
 *
 * Randomness is injected rather than reached for, so a burst can be asserted
 * on exactly.
 */

export type ParticleKind =
	/** A fast bright dot with a trail. The bread and butter of a burst. */
	| 'spark'
	/** A four-pointed star, slower and spinning. Used where something landed. */
	| 'star'
	/** A tumbling rectangle, for the end of a good run. */
	| 'confetti'
	/** An expanding outline. Not an object — a shockwave, so gravity ignores it. */
	| 'ring';

export type Particle = {
	kind: ParticleKind;
	/** Viewport pixels, top-left origin — the coordinates a DOMRect already speaks. */
	x: number;
	y: number;
	/** Pixels per second. */
	vx: number;
	vy: number;
	/** Seconds left, and the number it started with, which is what fading reads. */
	life: number;
	ttl: number;
	/** Pixels. A ring reads it as a radius and grows it; everything else keeps it. */
	size: number;
	/** Pitch class 0–11. The renderer turns this into the note's colour. */
	pc: number;
	/** Radians, and radians per second. */
	spin: number;
	spinRate: number;
	/** How hard gravity pulls, as a multiple. Zero leaves a particle weightless. */
	weight: number;
	/** Pixels per second added to `size`. Only a ring uses it. */
	grow: number;
};

export type Random = () => number;

/** Pixels per second squared, at a scale where one burst is about a hand's width. */
const GRAVITY = 1500;

/**
 * Air resistance, applied exponentially.
 *
 * Exponential rather than a per-frame multiplier so a burst looks the same on
 * a 60Hz laptop and a 120Hz tablet. The transport already learned this lesson
 * the hard way; the decoration may as well get it right the first time.
 */
const DRAG = 1.7;

/** Longer than this and the tab was not painting, so no time has passed worth simulating. */
const MAX_STEP = 1 / 20;

/** Enough to absorb several bursts without retaining an entire long session. */
const POOL_LIMIT = 512;
const pool: Particle[] = [];

function recycleParticle(particle: Particle): void {
	if (pool.length < POOL_LIMIT) pool.push(particle);
}

/**
 * Advance every particle and drop the dead ones.
 *
 * Both fields and the array are updated in place. A write cursor compacts live
 * particles over dead ones, so the 60/120Hz hot path creates no garbage.
 */
export function step(particles: Particle[], dt: number): Particle[] {
	const t = Math.min(Math.max(dt, 0), MAX_STEP);
	const damp = Math.exp(-DRAG * t);
	let alive = 0;

	for (let read = 0; read < particles.length; read++) {
		const particle = particles[read];
		particle.life -= t;
		if (particle.life <= 0) {
			recycleParticle(particle);
			continue;
		}

		const vx = particle.vx;
		const vy = particle.vy;
		particle.vx = vx * damp;
		particle.vy = (vy + GRAVITY * particle.weight * t) * damp;
		// Moved by the average of the old and new velocity rather than the new
		// one. Under constant acceleration that is exact, which is what keeps a
		// burst the same shape at 60Hz and at 120Hz.
		particle.x += ((vx + particle.vx) / 2) * t;
		particle.y += ((vy + particle.vy) / 2) * t;
		particle.spin += particle.spinRate * t;
		particle.size += particle.grow * t;

		particles[alive++] = particle;
	}

	particles.length = alive;
	return particles;
}

/** Return a whole effect to the bounded pool, used when the layer is cleared. */
export function recycle(particles: Particle[]): void {
	for (const particle of particles) recycleParticle(particle);
	particles.length = 0;
}

/** Drop the oldest particles and compact without allocating a sliced array. */
export function trimOldest(particles: Particle[], ceiling: number): void {
	const remove = particles.length - Math.max(0, ceiling);
	if (remove <= 0) return;
	for (let index = 0; index < remove; index++) recycleParticle(particles[index]);
	particles.copyWithin(0, remove);
	particles.length -= remove;
}

/** 1 at birth, 0 at death. What opacity and trail length are drawn from. */
export const fade = (particle: Particle): number => Math.max(0, particle.life / particle.ttl);

const between = (random: Random, lo: number, hi: number) => lo + random() * (hi - lo);

/** A base particle with the fields nothing usually overrides. */
function make(kind: ParticleKind, pc: number, x: number, y: number, ttl: number): Particle {
	const particle = pool.pop();
	if (!particle) {
		return {
			kind,
			x,
			y,
			vx: 0,
			vy: 0,
			life: ttl,
			ttl,
			size: 2,
			pc,
			spin: 0,
			spinRate: 0,
			weight: 1,
			grow: 0
		};
	}

	particle.kind = kind;
	particle.x = x;
	particle.y = y;
	particle.vx = 0;
	particle.vy = 0;
	particle.life = ttl;
	particle.ttl = ttl;
	particle.size = 2;
	particle.pc = pc;
	particle.spin = 0;
	particle.spinRate = 0;
	particle.weight = 1;
	particle.grow = 0;
	return particle;
}

export type BurstOptions = {
	x: number;
	y: number;
	pc: number;
	/** 0–1. Scales how many there are, how fast they leave and how long they last. */
	power?: number;
	/** Radians. Straight up is −π/2, which is where a burst goes when nothing says otherwise. */
	aim?: number;
	/** Radians of arc either side of `aim`. A full π is a fountain, 2π a firework. */
	arc?: number;
};

/**
 * The everyday burst: one chord tone found, one small shower of that note's
 * colour. Deliberately cheap, because at a fast tempo with both hands going
 * this fires several times a second.
 */
export function sparkBurst(
	options: BurstOptions,
	random: Random = Math.random,
	out: Particle[] = []
): Particle[] {
	const { x, y, pc, power = 1, aim = -Math.PI / 2, arc = Math.PI * 0.9 } = options;
	const count = Math.round(5 + 16 * power);

	for (let i = 0; i < count; i++) {
		const angle = aim + between(random, -arc / 2, arc / 2);
		const speed = between(random, 120, 260 + 320 * power);
		const particle = make('spark', pc, x, y, between(random, 0.42, 0.72 + 0.4 * power));
		particle.vx = Math.cos(angle) * speed;
		particle.vy = Math.sin(angle) * speed;
		particle.size = between(random, 1.4, 2.8 + 1.6 * power);
		particle.weight = between(random, 0.55, 1);
		out.push(particle);
	}

	return out;
}

/**
 * A chord landed: stars, a shockwave, and a shower under them.
 *
 * Bigger than a spark burst on purpose — this is the moment the whole feature
 * exists for, and it happens at most once per chord rather than once per note.
 */
export function landBurst(
	options: BurstOptions,
	random: Random = Math.random,
	out: Particle[] = []
): Particle[] {
	const { x, y, pc, power = 1 } = options;
	sparkBurst({ x, y, pc, power: 0.8 + 0.2 * power, arc: Math.PI * 2 }, random, out);

	const stars = Math.round(4 + 7 * power);
	for (let i = 0; i < stars; i++) {
		// Spread around the circle rather than scattered, so the shape reads as a
		// burst even when only a handful survive to the edge of the screen.
		const angle = (i / stars) * Math.PI * 2 + between(random, -0.25, 0.25);
		const speed = between(random, 180, 380 + 220 * power);
		const star = make('star', pc, x, y, between(random, 0.6, 1.05));
		star.vx = Math.cos(angle) * speed;
		star.vy = Math.sin(angle) * speed;
		star.size = between(random, 5, 9 + 5 * power);
		star.spin = between(random, 0, Math.PI * 2);
		star.spinRate = between(random, -7, 7);
		star.weight = between(random, 0.3, 0.7);
		out.push(star);
	}

	out.push(shockwave(x, y, pc, power));
	return out;
}

/** One expanding outline. Weightless, because a shockwave is not a thing that falls. */
export function shockwave(x: number, y: number, pc: number, power = 1): Particle {
	const ring = make('ring', pc, x, y, 0.5 + 0.25 * power);
	ring.size = 6;
	ring.weight = 0;
	ring.grow = 320 + 420 * power;
	return ring;
}

/**
 * The end of a good run, falling from above the fold.
 *
 * Every colour in the tune rather than one, since what is being celebrated is
 * the whole form and not any single chord in it.
 */
export function confettiFall(
	width: number,
	pitchClasses: number[],
	count = 90,
	random: Random = Math.random,
	out: Particle[] = []
): Particle[] {
	const palette = pitchClasses.length ? pitchClasses : [0];

	for (let i = 0; i < count; i++) {
		const pc = palette[Math.floor(random() * palette.length) % palette.length];
		// Started above the viewport so the first thing seen is a fall, not a
		// row of rectangles appearing along the top edge.
		const piece = make('confetti', pc, random() * width, between(random, -260, -20), 2.6);
		piece.vx = between(random, -90, 90);
		piece.vy = between(random, 120, 420);
		piece.size = between(random, 5, 11);
		piece.spin = between(random, 0, Math.PI * 2);
		piece.spinRate = between(random, -9, 9);
		piece.weight = between(random, 0.12, 0.3);
		out.push(piece);
	}

	return out;
}
