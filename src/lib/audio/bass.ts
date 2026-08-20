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

// ---------------------------------------------------------------------------
// The other bass players
// ---------------------------------------------------------------------------

/**
 * What the bass does with a bar.
 *
 * A walking line is a jazz idea and it was the only line there was, which is
 * why every groove used to sound like jazz however the drums were told to
 * behave. These are the four other things a bass player does over a chord
 * chart, and between them they cover everything the app now offers:
 *
 *   walking      Four to a bar, going somewhere. Jazz.
 *   roots        One note per chord, held. Ballads, and pop where the piano
 *                is holding the harmony anyway.
 *   root-fifth   Root and fifth, in two. Bossa, country, anything "in 2".
 *   boogie       Root–fifth–sixth–fifth, the blues bass line everybody knows.
 *   driving      Root on every beat with an eighth-note pickup into the next
 *                chord. Rock and funk.
 *   reggae       Syncopated and root-heavy, resting where the one drop lands.
 *
 * All four are as deterministic as the walking line, and for the same reason:
 * a bass player who improvised something different every four bars would be a
 * menace to practise against.
 */
export type BassStyle = 'walking' | 'roots' | 'root-fifth' | 'boogie' | 'driving' | 'reggae';

/** Root, fifth, sixth — as scale degrees above the chord, not chord degrees.
 * The sixth of a boogie line is a major sixth over a dominant chord, which is
 * not a chord tone and is not supposed to be. */
type Degree = 1 | 5 | 6;

type Step = { at: number; degree: Degree; role: BassNote['role'] };

/**
 * Where the notes fall inside one chord's span.
 *
 * Expressed relative to the chord rather than to the bar, so a bar holding two
 * chords gets half a figure each instead of the second chord arriving on top of
 * the first one's fifth.
 */
function figure(style: Exclude<BassStyle, 'walking'>, beats: number): Step[] {
	const whole = Math.max(1, Math.floor(beats));

	switch (style) {
		case 'roots':
			return [{ at: 0, degree: 1, role: 'root' }];

		case 'root-fifth': {
			const root: Step = { at: 0, degree: 1, role: 'root' };
			// Under three beats there is no room for the fifth without it becoming
			// the next chord's problem.
			if (whole < 3) return [root];
			return [root, { at: Math.floor(whole / 2), degree: 5, role: 'chord-tone' }];
		}

		case 'boogie': {
			const shape: Array<[Degree, BassNote['role']]> = [
				[1, 'root'],
				[5, 'chord-tone'],
				[6, 'scale'],
				[5, 'chord-tone']
			];
			return Array.from({ length: whole }, (_, i) => ({
				at: i,
				degree: shape[i % 4][0],
				role: shape[i % 4][1]
			}));
		}

		/*
		 * One, the and of two, four.
		 *
		 * The bass rests on three, which is exactly where the one drop puts the
		 * kick and the snare — the two parts interlock rather than doubling each
		 * other, and that space is most of what makes the drum hit land.
		 *
		 * Plenty of real reggae lines rest on beat one as well. This one does not,
		 * because a backing track has a job a record does not: the chord has
		 * changed and you have to be able to hear what it changed to.
		 */
		case 'reggae':
			return (
				[
					{ at: 0, degree: 1, role: 'root' },
					{ at: 1.5, degree: 1, role: 'root' },
					{ at: 3, degree: 5, role: 'chord-tone' }
				] as Step[]
			).filter((step) => step.at < whole);

		case 'driving': {
			const steps: Step[] = Array.from({ length: whole }, (_, i) => ({
				at: i,
				degree: 1 as Degree,
				role: (i === 0 ? 'root' : 'chord-tone') as BassNote['role']
			}));
			// The eighth before the change, which is what stops a bar of roots
			// sounding like a stuck key.
			if (whole >= 4) steps.push({ at: whole - 0.5, degree: 5, role: 'approach' });
			return steps;
		}
	}
}

/** The pitch class a degree names over this chord. */
function degreePc(chord: AbstractChord, degree: Degree): number {
	if (degree === 1) return pitchClass(bassNote(chord));
	// The fifth comes from the chord where it has one, so a ♭5 is honoured
	// rather than overruled. The sixth never does — see `Degree`.
	if (degree === 5) {
		const fifth = noteOf(chord, 5);
		return fifth ? pitchClass(fifth) : (pitchClass(chord.root) + 7) % 12;
	}
	return (pitchClass(chord.root) + 9) % 12;
}

/**
 * Build a line in any style.
 *
 * `walking` is handed straight to `walkingBass`, unchanged and untouched — it
 * is the one line here with somewhere to get to, and the only one that needs to
 * know what chord is coming next.
 */
export function bassLine(
	bars: BarChord[],
	style: BassStyle = 'walking',
	options: BassOptions = {}
): BassNote[] {
	if (style === 'walking') return walkingBass(bars, options);
	if (bars.length === 0) return [];

	const low = options.low ?? DEFAULT_LOW;
	const high = options.high ?? DEFAULT_HIGH;

	const out: BassNote[] = [];
	let beat = 0;
	let previous = Math.round((low + high) / 2);

	for (const { chord, beats } of bars) {
		// The root is placed relative to where the line already is, and everything
		// else relative to the root, so the line stays in one register instead of
		// leaping an octave whenever the fifth happens to be nearer the other way.
		const root = nearest(degreePc(chord, 1), previous, low, high);
		previous = root;

		for (const step of figure(style, beats)) {
			if (step.at >= beats) continue;
			out.push({
				midi: step.degree === 1 ? root : nearest(degreePc(chord, step.degree), root, low, high),
				beat: beat + step.at,
				role: step.role
			});
		}
		beat += beats;
	}

	return out;
}
