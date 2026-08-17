import { chordPitchClasses, degreeInterval, type AbstractChord } from '$lib/music/chord';
import { transpose } from '$lib/music/interval';
import { midi, pitchClass, type Note } from '$lib/music/note';
import { scalePitchClasses, type Key } from '$lib/music/key';

/**
 * Walking bass.
 *
 * Four notes to a bar, and the job of each one is different: the first says
 * which chord this is, the last says which chord is coming, and the middle two
 * get you from one to the other without leaping about. That is the whole trick,
 * and it is why a walking line sounds inevitable rather than arbitrary.
 *
 * Entirely deterministic — no randomness — so a line can be asserted in a test
 * and so the same chart sounds the same every time you loop it. A bass player
 * who improvised something different every four bars would be a menace to
 * practise against.
 */

export type BarChord = {
	chord: AbstractChord;
	/** How many beats it lasts. */
	beats: number;
};

export type BassNote = {
	midi: number;
	/** Beats from the start of the chart. */
	beat: number;
	role: 'root' | 'chord-tone' | 'approach' | 'scale';
};

export type BassOptions = {
	/** Lowest and highest notes the line will use. */
	low?: number;
	high?: number;
	key?: Key;
};

const DEFAULT_LOW = 33; // A1
const DEFAULT_HIGH = 57; // A3

/** The nearest octave of `pc` to `reference`, kept inside the range. */
function nearest(pc: number, reference: number, low: number, high: number): number {
	const target = ((pc % 12) + 12) % 12;
	let best = -1;
	let bestDistance = Infinity;

	for (let note = low; note <= high; note++) {
		if (((note % 12) + 12) % 12 !== target) continue;
		const distance = Math.abs(note - reference);
		if (distance < bestDistance) {
			bestDistance = distance;
			best = note;
		}
	}
	// Every pitch class appears in any range of an octave or more.
	return best >= 0 ? best : Math.max(low, Math.min(high, reference));
}

/**
 * The note this chord wants under it.
 *
 * A slash chord names its own bass, and it is the bass player who is being
 * told: `C/E` is a C triad with an E underneath, and if the line walks from C
 * anyway then the chart says one thing and the instrument plays another. The
 * inner beats still walk through the chord — the bass note is a downbeat
 * instruction, not a whole bar of one note.
 */
function bassNote(chord: AbstractChord): Note {
	return chord.bass ?? chord.root;
}

function noteOf(chord: AbstractChord, degree: number): Note | null {
	const interval = degreeInterval(chord, degree);
	return interval ? transpose(chord.root, interval) : null;
}

/**
 * The note that leads into the next chord.
 *
 * A semitone below is the strongest, and a semitone above works when the line
 * is coming down. Approaching from the fifth above is the other classic, used
 * here when a chromatic step would mean an awkward leap to reach it.
 */
function approachNote(
	targetPc: number,
	from: number,
	low: number,
	high: number
): { midi: number; role: BassNote['role'] } {
	const target = nearest(targetPc, from, low, high);
	const below = nearest((targetPc + 11) % 12, from, low, high);
	const above = nearest((targetPc + 1) % 12, from, low, high);
	const fifth = nearest((targetPc + 7) % 12, from, low, high);

	// Never the note already sounding: a repeat reads as the line stalling, and
	// on a bar of one chord the approach would otherwise land where it started.
	const candidates = [below, above, fifth].filter((c) => c !== from);
	if (candidates.length === 0) {
		const octaveAway = from + 12 <= high ? from + 12 : from - 12;
		return { midi: octaveAway, role: 'approach' };
	}

	// Whichever is the smallest move from where the line already is, so the
	// walk stays a walk.
	let best = candidates[0];
	let bestDistance = Infinity;
	for (const candidate of candidates) {
		const distance = Math.abs(candidate - from) + Math.abs(candidate - target) * 0.25;
		if (distance < bestDistance) {
			bestDistance = distance;
			best = candidate;
		}
	}

	return { midi: best, role: 'approach' };
}

/** Every note in range belonging to a set of pitch classes, ascending. */
function ladder(pitchClasses: number[], low: number, high: number): number[] {
	const wanted = new Set(pitchClasses.map((pc) => ((pc % 12) + 12) % 12));
	const out: number[] = [];
	for (let note = low; note <= high; note++) {
		if (wanted.has(((note % 12) + 12) % 12)) out.push(note);
	}
	return out;
}

/**
 * The next rung strictly above or below, reversing at the end of the range.
 *
 * Stepping through the chord this way is what makes a line *walk*. An earlier
 * version aimed each middle beat at the approach note by interpolation, which
 * on a bar of one chord produced C–B–C–B: the line rocking on the spot instead
 * of going anywhere.
 */
function stepThrough(rungs: number[], from: number, direction: 1 | -1): number | null {
	const forward =
		direction === 1 ? rungs.find((n) => n > from) : [...rungs].reverse().find((n) => n < from);
	if (forward !== undefined) return forward;

	const back =
		direction === 1 ? [...rungs].reverse().find((n) => n < from) : rungs.find((n) => n > from);
	return back ?? null;
}

/**
 * Build a line.
 *
 * Chords are consumed in order; each contributes as many notes as it has beats.
 * The last chord walks back towards the first, so a loop joins up.
 */
export function walkingBass(bars: BarChord[], options: BassOptions = {}): BassNote[] {
	if (bars.length === 0) return [];

	const low = options.low ?? DEFAULT_LOW;
	const high = options.high ?? DEFAULT_HIGH;

	const out: BassNote[] = [];
	let beat = 0;
	let previous = Math.round((low + high) / 2);

	for (let i = 0; i < bars.length; i++) {
		const { chord, beats } = bars[i];
		// Looping: after the last chord comes the first one again.
		const next = bars[(i + 1) % bars.length].chord;
		const targetPc = pitchClass(bassNote(next));

		const rootMidi = nearest(pitchClass(bassNote(chord)), previous, low, high);
		out.push({ midi: rootMidi, beat, role: 'root' });
		previous = rootMidi;

		if (beats <= 1) {
			beat += beats;
			continue;
		}

		/*
		 * Which way to walk. Provisionally aim at the approach note so the line
		 * heads towards where it has to arrive, but the direction is what matters
		 * — the notes in between come from the chord, not from interpolation.
		 */
		const provisional = approachNote(targetPc, rootMidi, low, high);
		const direction: 1 | -1 = provisional.midi >= rootMidi ? 1 : -1;

		const tones = chordPitchClasses(chord);
		const rungs = ladder(tones, low, high);
		const scaleRungs = options.key ? ladder([...scalePitchClasses(options.key)], low, high) : rungs;

		for (let m = 0; m < beats - 2; m++) {
			const next =
				stepThrough(rungs, previous, direction) ?? stepThrough(scaleRungs, previous, direction);
			if (next === null || next === previous) break;
			out.push({
				midi: next,
				beat: beat + 1 + m,
				role: tones.includes(((next % 12) + 12) % 12) ? 'chord-tone' : 'scale'
			});
			previous = next;
		}

		// Recomputed against where the line has actually reached: taking the
		// provisional note would sometimes repeat the beat before it.
		const lead = approachNote(targetPc, previous, low, high);
		out.push({ midi: lead.midi, beat: beat + beats - 1, role: lead.role });
		previous = lead.midi;
		beat += beats;
	}

	return out;
}

/** Total beats a set of bars lasts. */
export function totalBeats(bars: BarChord[]): number {
	return bars.reduce((sum, bar) => sum + bar.beats, 0);
}
