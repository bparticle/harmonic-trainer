import {
	closeVoicing,
	degreeInterval,
	rootlessVoicing,
	type AbstractChord
} from '$lib/music/chord';
import { midi } from '$lib/music/note';
import type { BassStyle, BarChord } from './bass';

/**
 * Drums and comping.
 *
 * Both are written as plain event lists in beats, with no reference to Tone.js
 * or to a clock — the transport turns them into sound. That keeps the musical
 * decisions testable and means a pattern can be inspected, printed or drawn
 * without anything having to make a noise.
 */

/**
 * Where the eighth falls, and nothing else.
 *
 * This used to be the whole vocabulary — `swing` or `straight` was the only
 * choice the player had — and it was quietly doing two jobs. One was real: the
 * placement of the offbeat eighth. The other was pretending that a ride cymbal,
 * a walking bass and sparse rootless comping were the only rhythm section there
 * is, and that "straight" meant that same jazz trio playing even eighths.
 *
 * A rock tune played "straight" got the ride pattern and a walking bass, which
 * is not a rock tune. So the feel stayed what it always was — a subdivision —
 * and the thing the player actually picks became the groove below.
 */
export type Feel = 'swing' | 'straight';

/**
 * Two thirds of the way through the beat, which is the triplet feel written as
 * eighths. Straight feel puts it at a half. This single number is most of the
 * difference between a jazz drummer and a metronome.
 */
export const SWING_OFFSET = 2 / 3;
export const STRAIGHT_OFFSET = 1 / 2;

export function offsetFor(feel: Feel): number {
	return feel === 'swing' ? SWING_OFFSET : STRAIGHT_OFFSET;
}

export type DrumHit = {
	instrument: 'ride' | 'hihat' | 'kick' | 'snare';
	/** Beats from the start, fractional for offbeats. */
	beat: number;
	/** 0–1. */
	velocity: number;
};

export type CompHit = {
	/** MIDI notes sounding together. */
	notes: number[];
	beat: number;
	/** Beats to hold it. */
	duration: number;
	velocity: number;
};

/**
 * How the piano states the harmony. Rhythm only — the voicings are the same
 * whichever groove is playing, because the bass has the root in all of them and
 * what changes between a ballad and a funk tune is when the chord is struck,
 * not which notes are in it.
 */
export type CompStyle = 'sparse' | 'sustained' | 'driving' | 'bossa' | 'skank' | 'stabs';

/** One cycle of the kit, expressed in beats and repeated to fill the form. */
type Kit = {
	/** Length of the cycle in beats. Two bars where the pattern needs two. */
	cycle: number;
	/** The hits, given where the offbeat eighth falls. */
	hits: (offset: number) => DrumHit[];
};

const h = (instrument: DrumHit['instrument'], beat: number, velocity: number): DrumHit => ({
	instrument,
	beat,
	velocity
});

// ---------------------------------------------------------------------------
// The kits
// ---------------------------------------------------------------------------

/**
 * The ride pattern.
 *
 * Quarters throughout with an extra stroke after beats two and four — the
 * "spang-a-lang" that carries the time. Hi-hat closes on two and four, which is
 * where the pulse actually is in this music. Two bars long, because the feet
 * are sparse: the bass is already stating every beat.
 */
const jazz: Kit = {
	cycle: 8,
	hits: (offset) => {
		const hits: DrumHit[] = [];
		for (let beat = 0; beat < 8; beat++) {
			const inBar = beat % 4;
			hits.push(h('ride', beat, inBar === 0 ? 0.85 : 0.62));
			if (inBar === 1 || inBar === 3) {
				hits.push(h('ride', beat + offset, 0.5));
				hits.push(h('hihat', beat, 0.7));
			}
		}
		hits.push(h('kick', 0, 0.45));
		return hits;
	}
};

/**
 * The shuffle.
 *
 * Swung like the jazz kit and built like a rock kit: hi-hat on every swung
 * eighth, backbeat on two and four, kick on one and three. This is the one
 * every blues band plays, and it is what most people mean when they say a blues
 * "doesn't sound like the app".
 */
const shuffle: Kit = {
	cycle: 4,
	hits: (offset) => {
		const hits: DrumHit[] = [];
		for (let beat = 0; beat < 4; beat++) {
			hits.push(h('hihat', beat, beat === 0 ? 0.62 : 0.5));
			hits.push(h('hihat', beat + offset, 0.34));
		}
		hits.push(h('snare', 1, 0.8), h('snare', 3, 0.8));
		hits.push(h('kick', 0, 0.8), h('kick', 2, 0.7));
		return hits;
	}
};

/**
 * The backbeat.
 *
 * Kick on one and three with a push on the and of three, snare on two and four,
 * hi-hat on every eighth. Nothing about it is subtle and that is the point: the
 * snare tells you where two and four are from the other side of the room, which
 * is exactly what a jazz kit refuses to do.
 */
const rock: Kit = {
	cycle: 4,
	hits: (offset) => {
		const hits: DrumHit[] = [];
		for (let beat = 0; beat < 4; beat++) {
			hits.push(h('hihat', beat, 0.6));
			hits.push(h('hihat', beat + offset, 0.42));
		}
		hits.push(h('snare', 1, 0.85), h('snare', 3, 0.85));
		hits.push(h('kick', 0, 0.85), h('kick', 2, 0.7), h('kick', 2 + offset, 0.55));
		return hits;
	}
};

/**
 * The same backbeat with the volume down and the last kick pushed.
 *
 * The kick on the and of four leans into the next bar, which is the small thing
 * that makes a pop tune feel like it is going somewhere rather than restarting
 * every four beats.
 */
const pop: Kit = {
	cycle: 4,
	hits: (offset) => {
		const hits: DrumHit[] = [];
		for (let beat = 0; beat < 4; beat++) {
			hits.push(h('hihat', beat, 0.45));
			hits.push(h('hihat', beat + offset, 0.3));
		}
		hits.push(h('snare', 1, 0.7), h('snare', 3, 0.7));
		hits.push(h('kick', 0, 0.75), h('kick', 2, 0.6), h('kick', 3 + offset, 0.45));
		return hits;
	}
};

/**
 * Half time.
 *
 * One snare a bar, on three, and the hi-hat on quarters. Halving the backbeat
 * is what makes a slow tune feel slow — a ballad with the snare still on two
 * and four just sounds like a rock tune somebody has turned the tempo down on.
 */
const ballad: Kit = {
	cycle: 4,
	hits: () => [
		h('hihat', 0, 0.4),
		h('hihat', 1, 0.32),
		h('hihat', 2, 0.4),
		h('hihat', 3, 0.32),
		h('snare', 2, 0.6),
		h('kick', 0, 0.6)
	]
};

/**
 * Bossa nova.
 *
 * Two bars, because the clave is two bars — 3–2, the long half first. The snare
 * here is standing in for a rim click, which is a quiet dry tick rather than a
 * backbeat, so it is played well down. The kick is the surdo on one and three.
 */
const bossa: Kit = {
	cycle: 8,
	hits: (offset) => {
		const hits: DrumHit[] = [];
		for (let beat = 0; beat < 8; beat++) {
			hits.push(h('hihat', beat, 0.34));
			hits.push(h('hihat', beat + offset, 0.26));
			if (beat % 2 === 0) hits.push(h('kick', beat, 0.5));
		}
		// 1, & of 2, 4 | 2, 3.
		for (const beat of [0, 1.5, 3, 5, 6]) hits.push(h('snare', beat, 0.34));
		return hits;
	}
};

/**
 * The one drop.
 *
 * Kick and snare land together on three, and beat one has nothing on it at all
 * — that silence is the whole idea, and it is what the name is about. The
 * hi-hat plays eighths with the *offbeat* louder than the beat, which is the
 * other half of why reggae leans backwards: everything marking the time is in
 * the gaps rather than on the pulse.
 *
 * Both halves of that are one number away from sounding wrong. A kick on one
 * makes it a slow rock tune; accenting the downbeat hi-hat makes it a ballad.
 */
const reggae: Kit = {
	cycle: 4,
	hits: (offset) => {
		const hits: DrumHit[] = [];
		for (let beat = 0; beat < 4; beat++) {
			hits.push(h('hihat', beat, 0.3));
			hits.push(h('hihat', beat + offset, 0.46));
		}
		hits.push(h('kick', 2, 0.8), h('snare', 2, 0.62));
		return hits;
	}
};

/**
 * Sixteenths.
 *
 * The hi-hat subdivides twice as fast as anywhere else here and the kick is
 * syncopated against it. Written in quarters of a beat rather than through the
 * swing offset, because a funk sixteenth is straight by definition — there is
 * nothing for the feel to move.
 */
const funk: Kit = {
	cycle: 4,
	hits: () => {
		const hits: DrumHit[] = [];
		for (let beat = 0; beat < 4; beat++) {
			hits.push(h('hihat', beat, 0.55));
			hits.push(h('hihat', beat + 0.25, 0.28));
			hits.push(h('hihat', beat + 0.5, 0.4));
			hits.push(h('hihat', beat + 0.75, 0.28));
		}
		hits.push(h('snare', 1, 0.85), h('snare', 3, 0.85));
		hits.push(h('kick', 0, 0.85), h('kick', 0.75, 0.5), h('kick', 2.5, 0.7));
		return hits;
	}
};

// ---------------------------------------------------------------------------
// The grooves
// ---------------------------------------------------------------------------

/**
 * What the player picks.
 *
 * A groove is a whole rhythm section: a kit, a bass style, a way of comping and
 * the feel that governs the eighths. The first two keep the names they had when
 * the feel was the only choice, because those names are still what a jazz
 * musician calls them — "play it swing", "play it straight" — and because a
 * preference and a logged run written before this existed still mean what they
 * said.
 */
export type Groove =
	'swing' | 'straight' | 'shuffle' | 'rock' | 'pop' | 'ballad' | 'bossa' | 'reggae' | 'funk';

export type GrooveSpec = {
	id: Groove;
	/** As it appears on the button. Lower case, like everything else there. */
	name: string;
	feel: Feel;
	bass: BassStyle;
	comp: CompStyle;
	/** One line saying what it is, for whoever has not met the word. */
	notes: string;
	kit: Kit;
};

export const GROOVES: GrooveSpec[] = [
	{
		id: 'swing',
		name: 'swing',
		feel: 'swing',
		bass: 'walking',
		comp: 'sparse',
		notes: 'Ride cymbal, walking bass, eighths played long-short. Jazz.',
		kit: jazz
	},
	{
		id: 'straight',
		name: 'straight',
		feel: 'straight',
		bass: 'walking',
		comp: 'sparse',
		notes: 'The same jazz trio with the eighths played even. Latin heads, modal tunes.',
		kit: jazz
	},
	{
		id: 'shuffle',
		name: 'shuffle',
		feel: 'swing',
		bass: 'boogie',
		comp: 'driving',
		notes: 'Swung eighths under a backbeat, over a boogie bass. The blues band shuffle.',
		kit: shuffle
	},
	{
		id: 'rock',
		name: 'rock',
		feel: 'straight',
		bass: 'driving',
		comp: 'driving',
		notes: 'Kick on one and three, snare on two and four, bass on every beat.',
		kit: rock
	},
	{
		id: 'pop',
		name: 'pop',
		feel: 'straight',
		bass: 'roots',
		comp: 'sustained',
		notes: 'The same backbeat, quieter, with the bass holding roots under held chords.',
		kit: pop
	},
	{
		id: 'ballad',
		name: 'ballad',
		feel: 'straight',
		bass: 'roots',
		comp: 'sustained',
		notes: 'Half time: one snare a bar, on three. For anything slow.',
		kit: ballad
	},
	{
		id: 'bossa',
		name: 'bossa',
		feel: 'straight',
		bass: 'root-fifth',
		comp: 'bossa',
		notes: 'Two-bar clave, rim click, bass in two. Straight eighths, never swung.',
		kit: bossa
	},
	{
		id: 'reggae',
		name: 'reggae',
		feel: 'straight',
		bass: 'reggae',
		comp: 'skank',
		notes: 'One drop: nothing on beat one, chords on every offbeat. Turn comping on.',
		kit: reggae
	},
	{
		id: 'funk',
		name: 'funk',
		feel: 'straight',
		bass: 'driving',
		comp: 'stabs',
		notes: 'Sixteenth hi-hats, syncopated kick, chords played as short stabs.',
		kit: funk
	}
];

const BY_ID = new Map(GROOVES.map((g) => [g.id, g]));

/** Unknown names fall back to swing rather than throwing: a stored preference
 * or a logged run is not a promise that the vocabulary never changed. */
export function grooveSpec(groove: Groove): GrooveSpec {
	return BY_ID.get(groove) ?? GROOVES[0];
}

export function isGroove(value: unknown): value is Groove {
	return typeof value === 'string' && BY_ID.has(value as Groove);
}

/** The feel a groove is played with, for anything that only needs the eighths. */
export function feelOf(groove: Groove): Feel {
	return grooveSpec(groove).feel;
}

// ---------------------------------------------------------------------------
// Realising a groove
// ---------------------------------------------------------------------------

/**
 * The kit, tiled across the form and clipped to it.
 *
 * Clipped rather than allowed to run over, because the form loops: a hit landing
 * a beat past the end would arrive on top of the downbeat coming round again.
 */
export function drumPattern(beats: number, groove: Groove = 'swing'): DrumHit[] {
	const spec = grooveSpec(groove);
	const hits = spec.kit.hits(offsetFor(spec.feel));

	const out: DrumHit[] = [];
	for (let start = 0; start < beats; start += spec.kit.cycle) {
		for (const hit of hits) {
			const beat = start + hit.beat;
			if (beat >= 0 && beat < beats) out.push({ ...hit, beat });
		}
	}
	return out;
}

/**
 * Comping.
 *
 * Deliberately sparse and off the beat in the jazz grooves: it is there to imply
 * the harmony, not to fill the bar. Muting it is a first-class option, because
 * the whole point of practising over a backing is often to comp for yourself —
 * and two people comping is one too many.
 *
 * Rootless voicings where the chord has a seventh to build them from, and the
 * triad without its root otherwise. Either way the bass has the root already.
 */
export function compPattern(bars: BarChord[], groove: Groove = 'swing'): CompHit[] {
	const spec = grooveSpec(groove);
	const offset = offsetFor(spec.feel);

	if (spec.comp === 'sparse') return sparseComp(bars, offset);

	const hits: CompHit[] = [];
	let beat = 0;
	let form: 'A' | 'B' = 'A';

	for (const bar of bars) {
		const notes = voicingFor(bar.chord, form);
		if (notes.length) {
			for (const placing of placings(spec.comp, bar.beats, offset)) {
				hits.push({
					notes,
					beat: beat + placing.at,
					duration: placing.hold,
					velocity: placing.velocity
				});
			}
			form = form === 'A' ? 'B' : 'A';
		}
		beat += bar.beats;
	}

	return hits;
}

/**
 * Where the chord is struck inside its own span, and for how long.
 *
 * Everything is expressed relative to the chord rather than to the bar, so a
 * bar of two chords gets half of each pattern instead of both chords being
 * played over the top of one another. Anything falling past the chord's last
 * beat is dropped by the caller of this in the same breath — see the filter.
 */
function placings(
	style: CompStyle,
	beats: number,
	offset: number
): Array<{ at: number; hold: number; velocity: number }> {
	const within = (at: number) => at < beats;

	switch (style) {
		// Held for as long as the chord lasts, struck once. A pad.
		case 'sustained':
			return [{ at: 0, hold: beats, velocity: 0.32 }];

		// On the downbeat and again halfway, so a whole bar of one chord does not
		// go four beats without the piano in it.
		case 'driving':
			return [
				{ at: 0, hold: Math.min(2, beats), velocity: 0.45 },
				...(beats >= 4 ? [{ at: 2, hold: 2, velocity: 0.36 }] : [])
			];

		// One, the and of two, four — the comping rhythm that goes with the clave.
		case 'bossa':
			return [
				{ at: 0, hold: 1.4, velocity: 0.36 },
				{ at: 1 + offset, hold: 1.2, velocity: 0.3 },
				{ at: 3, hold: 1, velocity: 0.33 }
			].filter((p) => within(p.at));

		/*
		 * The skank: a short chord on every offbeat and nothing anywhere else.
		 *
		 * The most recognisable single gesture in any groove here — four clipped
		 * chords a bar, all of them in the gaps. It is also the one comp worth
		 * turning on rather than muting, because with the comping off a reggae
		 * backing is a bass and a drummer and no reggae.
		 */
		case 'skank':
			return [
				{ at: offset, hold: 0.22, velocity: 0.36 },
				{ at: 1 + offset, hold: 0.22, velocity: 0.44 },
				{ at: 2 + offset, hold: 0.22, velocity: 0.36 },
				{ at: 3 + offset, hold: 0.22, velocity: 0.44 }
			].filter((p) => within(p.at));

		// Short, and off the beat where possible: the gaps are the groove.
		case 'stabs':
			return [
				{ at: 0, hold: 0.3, velocity: 0.42 },
				{ at: offset, hold: 0.25, velocity: 0.3 },
				{ at: 2 + offset, hold: 0.25, velocity: 0.36 }
			].filter((p) => within(p.at));

		default:
			return [{ at: 0, hold: beats, velocity: 0.32 }];
	}
}

/**
 * The jazz comp: one voicing per chord, alternating between landing on the beat
 * and being pushed just before the next bar. Landing in the same place every
 * time turns into a tic.
 */
function sparseComp(bars: BarChord[], offset: number): CompHit[] {
	const hits: CompHit[] = [];
	let beat = 0;
	let form: 'A' | 'B' = 'A';

	for (const [index, bar] of bars.entries()) {
		const notes = voicingFor(bar.chord, form);
		if (notes.length) {
			const onBeat = index % 2 === 0;
			hits.push({
				notes,
				beat: onBeat ? beat : beat + Math.max(0, bar.beats - 1) + offset,
				duration: Math.min(2, bar.beats),
				velocity: 0.42
			});
			// Alternating the form keeps the hand still between chords.
			form = form === 'A' ? 'B' : 'A';
		}
		beat += bar.beats;
	}

	return hits;
}

function voicingFor(chord: AbstractChord, form: 'A' | 'B'): number[] {
	// A triad has no seventh, so there is no rootless voicing to build. Its third
	// and fifth still say everything the bass is not already saying.
	if (!degreeInterval(chord, 7)) return closeVoicing(chord, 4).map(midi).slice(1);
	return rootlessVoicing(chord, form, 4).map(midi);
}

/** Four beats of clicks before the first bar. */
export function countInHits(beats = 4): DrumHit[] {
	return Array.from({ length: beats }, (_, i) => ({
		instrument: 'hihat' as const,
		beat: i - beats,
		velocity: i === 0 ? 0.9 : 0.6
	}));
}
