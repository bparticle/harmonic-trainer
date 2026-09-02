import {
	chordPitchClasses,
	closeVoicing,
	diatonicSeventh,
	diatonicTriad,
	formatChord,
	type AbstractChord
} from '$lib/music/chord';
import { formatKey, key as makeKey, scale, type Key } from '$lib/music/key';
import { formatNote, midi, pitchClass } from '$lib/music/note';
import type { CardDirection } from '$lib/server/db/schema';

/**
 * The journey through the keys.
 *
 * One key at a time, in the order a musician actually meets them: C first, then
 * one accidental at a time, alternating sharp and flat sides of the circle.
 * Nothing is assumed — the first rung of the first key is "play these seven
 * notes", and everything else is built on top of that.
 *
 * This replaced a model that generated every card in every key at once and let
 * the scheduler choose. That produced sessions full of material nobody had ever
 * been shown, in keys nobody had ever played, which is a good way to make
 * someone feel stupid about an instrument they can already play.
 *
 * Progress is *suggested*, never enforced: the ladder says when a rung looks
 * solid, and you decide when to move on.
 */

export type Stage = {
	/** Major key, as stored. */
	key: string;
	/** Its relative minor. */
	relativeMinor: string;
	/** Signed: positive sharps, negative flats. */
	accidentals: number;
	/** How it is described the first time you meet it. */
	note: string;
};

/**
 * The circle of fifths, opened outwards from C.
 *
 * Each step adds exactly one accidental, alternating sides, which is how the
 * keys have been taught for about three hundred years and is a great deal
 * gentler than jumping to B because a scheduler noticed it was cold.
 */
export const STAGES: Stage[] = [
	{ key: 'C', relativeMinor: 'Am', accidentals: 0, note: 'No sharps, no flats. All white keys.' },
	{ key: 'G', relativeMinor: 'Em', accidentals: 1, note: 'One sharp: F♯.' },
	{ key: 'F', relativeMinor: 'Dm', accidentals: -1, note: 'One flat: B♭.' },
	{ key: 'D', relativeMinor: 'Bm', accidentals: 2, note: 'Two sharps: F♯ and C♯.' },
	{ key: 'Bb', relativeMinor: 'Gm', accidentals: -2, note: 'Two flats: B♭ and E♭.' },
	{ key: 'A', relativeMinor: 'F#m', accidentals: 3, note: 'Three sharps: F♯, C♯, G♯.' },
	{ key: 'Eb', relativeMinor: 'Cm', accidentals: -3, note: 'Three flats: B♭, E♭, A♭.' },
	{ key: 'E', relativeMinor: 'C#m', accidentals: 4, note: 'Four sharps: F♯, C♯, G♯, D♯.' },
	{ key: 'Ab', relativeMinor: 'Fm', accidentals: -4, note: 'Four flats: B♭, E♭, A♭, D♭.' },
	{
		key: 'B',
		relativeMinor: 'G#m',
		accidentals: 5,
		note: 'Five sharps. Only one white-key tonic left.'
	},
	{ key: 'Db', relativeMinor: 'Bbm', accidentals: -5, note: 'Five flats.' },
	{
		key: 'Gb',
		relativeMinor: 'Ebm',
		accidentals: -6,
		note: 'Six flats, and the far side of the wheel.'
	}
];

export type RungId =
	| 'scale'
	| 'tonic-triad'
	| 'primary-triads'
	| 'all-triads'
	| 'tonic-seventh'
	| 'all-sevenths'
	| 'relative-minor';

export type Rung = {
	id: RungId;
	label: string;
	/** What this is, in one line, written for someone meeting it for the first time. */
	teaches: string;
	/** What to do with your hands. */
	instruction: string;
	/** Roughly how many correct answers before it stops looking new. */
	suggestAfter: number;
};

/**
 * Seven small steps per key.
 *
 * Deliberately short and overlapping — each rung is mostly the previous one
 * plus one idea. Chord progressions used to live here and have moved to their
 * own section, because learning a key and learning a movement between chords
 * are different jobs and mixing them made both muddier.
 */
export const RUNGS: Rung[] = [
	{
		id: 'scale',
		label: 'The scale',
		teaches: 'Seven notes. Everything else in this key is built from them.',
		instruction: 'Play it up and down, right hand, as slowly as you like.',
		suggestAfter: 6
	},
	{
		id: 'tonic-triad',
		label: 'The home chord',
		teaches:
			'Three notes from the scale — the first, third and fifth. This is where the key rests.',
		instruction: 'Play it, listen to it, and come back to it.',
		suggestAfter: 6
	},
	{
		id: 'primary-triads',
		label: 'The three main chords',
		teaches: 'I, IV and V. A very large amount of music is only these.',
		instruction: 'Play each one, then move between them.',
		suggestAfter: 9
	},
	{
		id: 'all-triads',
		label: 'All seven triads',
		teaches:
			'One chord on each note of the scale. Three are major, three are minor, one is diminished.',
		instruction: 'Play up the scale, building a chord on each note.',
		suggestAfter: 12
	},
	{
		id: 'tonic-seventh',
		label: 'Adding the seventh',
		teaches: 'One more note on top of the home chord. This is the sound of jazz rather than folk.',
		instruction: 'Play the triad, then add the seventh and hear what changes.',
		suggestAfter: 6
	},
	{
		id: 'all-sevenths',
		label: 'All seven sevenths',
		teaches:
			'The same seven chords, each with its seventh. Two are major sevenths, one is dominant.',
		instruction: 'Up the scale again, four notes at a time.',
		suggestAfter: 12
	},
	{
		id: 'relative-minor',
		label: 'The relative minor',
		teaches:
			'Exactly the same seven notes, starting from the sixth degree. A different feeling, no new notes.',
		instruction: 'Play the minor scale, then its first, fourth and fifth chords.',
		suggestAfter: 9
	}
];

export function rungById(id: string): Rung | undefined {
	return RUNGS.find((r) => r.id === id);
}

export function stageByKey(key: string): Stage | undefined {
	return STAGES.find((s) => s.key === key);
}

export function stageIndex(key: string): number {
	return STAGES.findIndex((s) => s.key === key);
}

/** A place on the ladder: which key, which rung. */
export type Position = { stage: Stage; rung: Rung; stageIndex: number; rungIndex: number };

export const FIRST_POSITION: Position = {
	stage: STAGES[0],
	rung: RUNGS[0],
	stageIndex: 0,
	rungIndex: 0
};

export function positionOf(key: string, rungId: string): Position | null {
	const si = stageIndex(key);
	const ri = RUNGS.findIndex((r) => r.id === rungId);
	if (si < 0 || ri < 0) return null;
	return { stage: STAGES[si], rung: RUNGS[ri], stageIndex: si, rungIndex: ri };
}

// ---------------------------------------------------------------------------
// The frontier
// ---------------------------------------------------------------------------

/**
 * Where you have got to: how many keys each rung is open in.
 *
 * **This replaced a single position, and the replacement is the whole of M17's
 * second pass.** A position was a point on one walk — rungs then keys — so
 * everything reached was a *prefix* of that walk. Three things followed from
 * that and none of them was a bug: the second key cost seven steps of the
 * first, cards outside the prefix did not exist so there was nothing in another
 * key to interleave with, and `spreadByKey` — which exists precisely so eight
 * questions touch eight keys — had one key to spread across on the second rung.
 * The app was at its most blocked exactly when the learner was newest.
 *
 * So depth and breadth stop being one ordering. `widths[r]` is the number of
 * keys rung `r` is open in, counted in `STAGES` order, and the array is
 * **non-increasing**: a rung is never open in more keys than the rung above it.
 * That is the staircase, and it is what makes the set a curriculum rather than
 * a scattering — you cannot be four rungs deep in a key whose scale you have
 * never played.
 *
 * Everything the old model guaranteed survives. The frontier is still a set the
 * app opened on purpose, so nothing is ever asked that has not been introduced,
 * which is the rule the note at the top of this file exists to keep.
 *
 * Widths only ever grow. Nothing here can take material away except `narrower`
 * below, which is a person pressing "step back" rather than the curriculum
 * revising itself.
 */
export type Frontier = {
	/** One count per rung, in `RUNGS` order. Non-increasing, each 0…STAGES.length. */
	widths: number[];
};

/** One rung, one key. The first morning of an account. */
export const FIRST_FRONTIER: Frontier = {
	widths: [1, ...RUNGS.slice(1).map(() => 0)]
};

/**
 * The frontier a stored position means, exactly.
 *
 * The migration, and it is not an approximation. A position at stage `s`, rung
 * `r` meant: every rung of every earlier key, plus rungs `0…r` of this one. As
 * widths that is `s + 1` keys for the rungs at or below `r` and `s` keys for
 * the rungs above it — which is non-increasing, and which enumerates the
 * identical set of cells. A test asserts that for all eighty-four positions.
 */
export function frontierFromPosition(key: string, rungId: string): Frontier | null {
	const position = positionOf(key, rungId);
	if (!position) return null;
	return {
		widths: RUNGS.map((_, r) =>
			r <= position.rungIndex ? position.stageIndex + 1 : position.stageIndex
		)
	};
}

/**
 * The smallest well-formed frontier that holds every one of these cells.
 *
 * The inverse of `cellsOf`, and it exists because the card bank is a better
 * record of what was opened than the settings row is. A card is only ever
 * created by a cell being open — `ensureLadderCards` is the one writer — so a
 * bank holding `rung:all-triads` in C is proof that C's first four rungs were
 * open, whatever `prefs_json` says today.
 *
 * The staircase is restored rather than assumed: a rung's width is raised to at
 * least the width of every rung below it, so a set of cells that has lost its
 * shallow rungs comes back as a frontier and not as a scattering. Unknown keys
 * and unknown rungs are ignored, because this reads rows written by older code.
 */
export function frontierCovering(cells: Array<{ key: string; rungId: string }>): Frontier {
	const widths = RUNGS.map(() => 0);

	for (const cell of cells) {
		const r = RUNGS.findIndex((rung) => rung.id === cell.rungId);
		const s = stageIndex(cell.key);
		if (r < 0 || s < 0) continue;
		widths[r] = Math.max(widths[r], s + 1);
	}

	// Non-increasing, from the bottom up: a rung open in four keys needs the rung
	// above it open in at least four.
	for (let r = widths.length - 2; r >= 0; r--) widths[r] = Math.max(widths[r], widths[r + 1]);

	// There is always somewhere to stand.
	widths[0] = Math.max(widths[0], 1);
	return { widths };
}

/** The wider of two frontiers, rung by rung. Ground is never given up by a merge. */
export function widest(a: Frontier, b: Frontier): Frontier {
	return { widths: RUNGS.map((_, r) => Math.max(a.widths[r] ?? 0, b.widths[r] ?? 0)) };
}

/**
 * The minor keys the ladder has actually opened, as bare tonics.
 *
 * **The ladder teaches exactly one minor key per stage, and it is the relative
 * one.** C's rung teaches A minor: the same seven notes read from the sixth
 * degree, which is the whole of what makes it the gentle next step. It has never
 * taught C minor, and C minor is not a small variation on C major — it is three
 * flats, a different key signature, and on this ladder it belongs to the E♭
 * stage as *its* relative minor.
 *
 * That distinction had nowhere to live, so nothing enforced it: a minor-mode
 * tune was handed the workout's key name and `realiseChart` resolves numerals
 * against the major scale, so "St. James Infirmary in C" came out as C minor —
 * Cm, Fm, G7 — offered to somebody whose entire minor vocabulary was A minor.
 *
 * Tonics rather than `Am`, because that is what every consumer of a key name in
 * this app already expects: the chart's own `mode` is what makes it minor, and a
 * key called `A` with a minor chart on it prints as *A minor* everywhere.
 */
export function minorKeysReached(reached: Array<{ key: string; rungId: string }>): string[] {
	const open = new Set(
		reached.filter((cell) => cell.rungId === 'relative-minor').map((cell) => cell.key)
	);
	return STAGES.filter((stage) => open.has(stage.key)).map((stage) =>
		stage.relativeMinor.replace(/m$/, '')
	);
}

/**
 * The minor key belonging to a major one, whether or not it is open.
 *
 * For putting a minor tune next to the key the workout is already in, which is
 * the answer somebody expects after a lesson called "the relative minor".
 */
export function relativeMinorOf(key: string): string | null {
	const stage = stageByKey(key);
	return stage ? stage.relativeMinor.replace(/m$/, '') : null;
}

/** Rungs that are open in at least one key. Depth, as opposed to breadth. */
export function depthOf(frontier: Frontier): number {
	return frontier.widths.filter((width) => width > 0).length;
}

/** Every cell the frontier holds, in the order the ladder introduced them. */
export function cellsOf(frontier: Frontier): Array<{ key: string; rungId: RungId }> {
	const out: Array<{ key: string; rungId: RungId }> = [];
	for (let r = 0; r < RUNGS.length; r++) {
		for (let s = 0; s < Math.min(frontier.widths[r] ?? 0, STAGES.length); s++) {
			out.push({ key: STAGES[s].key, rungId: RUNGS[r].id });
		}
	}
	return out;
}

/** Is this rung open in this key? The one question the card generator asks. */
export function isOpen(frontier: Frontier, key: string, rungId: string): boolean {
	const r = RUNGS.findIndex((rung) => rung.id === rungId);
	const s = stageIndex(key);
	if (r < 0 || s < 0) return false;
	return s < (frontier.widths[r] ?? 0);
}

/** How many rungs of one key are open. What a key swatch prints. */
export function rungsOpenIn(frontier: Frontier, key: string): number {
	const s = stageIndex(key);
	if (s < 0) return 0;
	return frontier.widths.filter((width) => s < width).length;
}

/**
 * Where you are standing: the deepest rung, in the last key it was opened in.
 *
 * A frontier is a set and a lesson is a place, so something has to answer "what
 * am I working on". This does, and it is the only thing `Position` is still for
 * — the hero, the rung's own review count, and the default the picker starts
 * on. Nothing gates on it any more.
 */
export function workingPosition(frontier: Frontier): Position {
	const rungIndex = Math.max(0, depthOf(frontier) - 1);
	const stage = Math.max(0, Math.min((frontier.widths[rungIndex] ?? 1) - 1, STAGES.length - 1));
	return { stage: STAGES[stage], rung: RUNGS[rungIndex], stageIndex: stage, rungIndex };
}

/**
 * Open the next rung — and one more key of every rung above it.
 *
 * The single most important function in this file, and the whole of "widen
 * before you deepen" expressed as one move. Going deeper is not free: it drags
 * every shallower rung one key wider, so the staircase builds itself and it is
 * impossible to be deep and narrow. Seven of these gives
 * `[7, 6, 5, 4, 3, 2, 1]` — the same seven rungs the old walk reached in seven
 * steps, with twenty-one cells of breadth underneath them that the old walk did
 * not have.
 *
 * Null when every rung is already open; widening is what is left after that.
 */
export function deepen(frontier: Frontier): Frontier | null {
	const depth = depthOf(frontier);
	if (depth >= RUNGS.length) return null;

	return {
		widths: frontier.widths.map((width, r) => {
			if (r === depth) return 1;
			if (r < depth) return Math.min(width + 1, STAGES.length);
			return width;
		})
	};
}

/**
 * Open one rung in one more key, without going deeper.
 *
 * For somebody who wants more ground before the next idea. Refused where it
 * would break the staircase — a rung may never be open in more keys than the
 * one above it — and refused at twelve, because there is no thirteenth key.
 */
export function widen(frontier: Frontier, rungIndex: number): Frontier | null {
	const width = frontier.widths[rungIndex];
	if (width === undefined || width === 0) return null;
	if (width >= STAGES.length) return null;
	if (rungIndex > 0 && width >= (frontier.widths[rungIndex - 1] ?? 0)) return null;

	return { widths: frontier.widths.map((w, r) => (r === rungIndex ? w + 1 : w)) };
}

/**
 * The rung a plain "wider" means, and the key it would add.
 *
 * The **deepest rung that can take another key**, which is not always the
 * deepest rung. A frontier like `[2, 2, 2, 1, 1, 1, 1]` — which is what an
 * account standing at G's third rung migrates to — has its last four rungs
 * level with each other, so none of them can widen without breaking the
 * staircase. Asking only the deepest one gives "no", and the page then offers
 * nothing at all: every rung open, no deepening left, and a widening that was
 * refused. A dead end, found by opening the page rather than by a test.
 *
 * Deepest-that-can is the right answer rather than a patch. Breadth is most
 * useful where the staircase is thinnest relative to what sits above it, and
 * that is exactly the deepest rung with room.
 */
export function nextWidening(
	frontier: Frontier
): { rungIndex: number; rung: Rung; stage: Stage } | null {
	for (let r = frontier.widths.length - 1; r >= 0; r--) {
		if (widen(frontier, r)) {
			return { rungIndex: r, rung: RUNGS[r], stage: STAGES[frontier.widths[r]] };
		}
	}
	return null;
}

/** Open one more key on whichever rung `nextWidening` names. */
export function widenNext(frontier: Frontier): Frontier | null {
	const target = nextWidening(frontier);
	return target ? widen(frontier, target.rungIndex) : null;
}

/**
 * Undo the last opening, for when going on turned out to be optimistic.
 *
 * Deliberately not the inverse of `deepen`: it closes the deepest rung and
 * leaves the widths above it alone, because taking keys back off rungs somebody
 * has been practising for a week would be the app deciding they had forgotten
 * them. Never closes the last cell — there is always somewhere to stand.
 */
export function narrower(frontier: Frontier): Frontier | null {
	const depth = depthOf(frontier);
	if (depth === 0) return null;
	const last = depth - 1;
	const width = frontier.widths[last];

	if (width > 1) {
		return { widths: frontier.widths.map((w, r) => (r === last ? w - 1 : w)) };
	}
	// The deepest rung holds one key. Closing it is only allowed if it is not
	// the only thing open.
	if (depth === 1) return null;
	return { widths: frontier.widths.map((w, r) => (r === last ? 0 : w)) };
}

/**
 * Non-increasing, in range, and at least one cell open.
 *
 * Takes `unknown` because its whole job is to be asked about a value that came
 * out of a JSON column and may be anything at all — including, on the first
 * request after this shipped, `undefined`.
 */
export function isWellFormed(frontier: { widths?: unknown } | null | undefined): boolean {
	const widths = frontier?.widths;
	if (!Array.isArray(widths)) return false;
	if (widths.length !== RUNGS.length) return false;
	if (widths.some((w) => !Number.isInteger(w) || w < 0 || w > STAGES.length)) return false;
	for (let r = 1; r < widths.length; r++) if (widths[r] > widths[r - 1]) return false;
	return widths[0] > 0;
}

/**
 * The next cell the frontier would open, for the slot that offers a new thing.
 *
 * Deepening rather than widening, because the new *thing* is a new idea and a
 * rung met in one more key is the same idea somewhere else. Null at the bottom
 * of the ladder, where there is no new rung left to meet.
 */
export function nextCell(frontier: Frontier): { key: string; rungId: RungId } | null {
	const depth = depthOf(frontier);
	if (depth >= RUNGS.length) return null;
	return { key: STAGES[0].key, rungId: RUNGS[depth].id };
}

/** Which way the ladder would move: a new idea, or the same idea in a new key. */
export type Move = 'deeper' | 'wider';

/**
 * The next cell the ladder would open, whichever direction is left.
 *
 * `nextCell` answers only for deepening and returns null once every rung is open
 * in at least one key — which is exactly where somebody who has worked through
 * one key ends up. From there the whole of the remaining ladder is breadth, and
 * a function that says *nothing* there takes the offer to move on off the screen
 * at the moment it becomes most useful: seven rungs of C finished, eleven keys
 * untouched, and the app with no opinion about what to do next.
 *
 * So this asks for depth first and falls back to breadth, and says which it got.
 * Deeper leads because a new rung is a new idea and a rung met in one more key is
 * the same idea somewhere else. Null only when there is genuinely nowhere left.
 */
export function nextOpening(
	frontier: Frontier
): { move: Move; key: string; rungId: RungId } | null {
	const deeper = nextCell(frontier);
	if (deeper) return { move: 'deeper', ...deeper };

	const wider = nextWidening(frontier);
	return wider ? { move: 'wider', key: wider.stage.key, rungId: wider.rung.id } : null;
}

// ---------------------------------------------------------------------------
// What each rung asks
// ---------------------------------------------------------------------------

export type LadderItem = {
	kind: string;
	label: string;
	answerPitchClasses: number[];
	answerVoicing?: number[];
	degree?: string;
	/**
	 * The key the degree is counted from, when that is not the stage's own key.
	 *
	 * Only the relative minor needs it, and it needs it badly: its triads are
	 * stored on the C stage but their numerals are numerals of A minor. Asking
	 * for "the i chord of C" would be a wrong question with a right answer
	 * recorded against it, which is the worst shape a drill can take.
	 */
	degreeOf?: string;
	detail?: string;
	/**
	 * The chord this item is, where it is one.
	 *
	 * Carried so that `vocabulary.ts` can ask a rung which *shapes* it teaches
	 * without re-deriving which degrees each rung covers — that knowledge lives
	 * in `itemsForRung` below and must not be written down twice. The scale items
	 * have no chord and say so with an absence rather than a placeholder.
	 *
	 * Never copied into a card payload: `toPayload` names the fields it takes,
	 * so this stays a fact about the rung rather than a fact about the question.
	 */
	chord?: AbstractChord;
};

const MAJOR_DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
const MINOR_DEGREES = ['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII'];

const voicingOf = (chord: Parameters<typeof closeVoicing>[0]) => closeVoicing(chord, 3).map(midi);

function triadItem(k: Key, degree: number, degrees: string[]): LadderItem {
	const chord = diatonicTriad(k, degree);
	return {
		kind: 'triad',
		label: formatChord(chord),
		answerPitchClasses: chordPitchClasses(chord),
		answerVoicing: voicingOf(chord),
		degree: degrees[degree - 1],
		chord
	};
}

function seventhItem(k: Key, degree: number, degrees: string[]): LadderItem {
	const chord = diatonicSeventh(k, degree);
	return {
		kind: 'seventh',
		label: formatChord(chord),
		answerPitchClasses: chordPitchClasses(chord),
		answerVoicing: voicingOf(chord),
		degree: degrees[degree - 1],
		chord
	};
}

function scaleItem(k: Key): LadderItem {
	const notes = scale(k);

	/*
	 * Ascending, with the octave carried where the letters wrap.
	 *
	 * `scale` transposes intervals from the tonic and `midi` reads the octave off
	 * the note, and between them they do *not* carry: G major comes back as
	 * G4 A4 B4 C4 D4 E4 F♯4, which climbs three notes and then falls back an
	 * octave. This comment used to claim the carries were already there, which is
	 * why nothing caught it — `drill.ts` rebuilds the voicing from the stored root
	 * before anything is heard, so the wrong array never reached the ears and only
	 * showed up when the session tried to size the keyboard from it.
	 *
	 * The repeated tonic on the end is the arrival that makes this a complete
	 * one-octave scale.
	 */
	const ascending: number[] = [];
	let previous = -1;
	for (const note of notes.map(midi)) {
		let carried = note;
		while (carried <= previous) carried += 12;
		previous = carried;
		ascending.push(carried);
	}

	return {
		kind: 'scale',
		label: `${formatKey(k)} scale`,
		answerPitchClasses: notes.map(pitchClass),
		answerVoicing: [...ascending, ascending[0] + 12],
		detail: notes.map((n) => formatNote(n, { unicode: true })).join(' ')
	};
}

/** The items a rung asks for, in a given key. */
export function itemsForRung(rungId: RungId, stage: Stage): LadderItem[] {
	const major = makeKey(stage.key);
	const minor = makeKey(stage.relativeMinor.replace(/m$/, ''), 'aeolian');

	switch (rungId) {
		case 'scale':
			return [scaleItem(major)];
		case 'tonic-triad':
			return [triadItem(major, 1, MAJOR_DEGREES)];
		case 'primary-triads':
			return [1, 4, 5].map((d) => triadItem(major, d, MAJOR_DEGREES));
		case 'all-triads':
			return [1, 2, 3, 4, 5, 6, 7].map((d) => triadItem(major, d, MAJOR_DEGREES));
		case 'tonic-seventh':
			return [seventhItem(major, 1, MAJOR_DEGREES)];
		case 'all-sevenths':
			return [1, 2, 3, 4, 5, 6, 7].map((d) => seventhItem(major, d, MAJOR_DEGREES));
		case 'relative-minor':
			return [
				scaleItem(minor),
				...[1, 4, 5].map((d) => ({
					...triadItem(minor, d, MINOR_DEGREES),
					degreeOf: stage.relativeMinor
				}))
			];
	}
}

/**
 * Which directions a rung can honestly ask.
 *
 * A scale has no chord shape to name, so asking you to name one would be a
 * question with no answer — and a wrong answer to an impossible question still
 * counts against you.
 *
 * `degree_play` joins every rung built on numbered chords, which is every rung
 * except the scale. It is on the relative minor too: `i`, `iv` and `v` are
 * degrees like any other, and the minor numerals are the ones least likely to
 * be met anywhere else.
 *
 * **`play_name` is not made any more, and there is no rung it would be honest
 * on.** `pose` shows it `detail ?? degree ?? label`, and a triad or a seventh
 * carries no `detail` — so on the only items that ever had it, the whole
 * question was a bare numeral with no key attached. `degree_play` is that
 * question asked properly, with the key travelling beside the numeral, and this
 * list has been two questions with one answer since the day that arrived. The
 * relative minor was the rung that noticed first: it dropped `play_name` and
 * kept `degree_play`, because its numerals belong to A minor and a bare `iv`
 * would have been a wrong question with a right answer behind it. That was true
 * of every other rung as well the moment a workout began crossing keys.
 */
export function directionsForRung(rungId: RungId): CardDirection[] {
	if (rungId === 'scale') return ['see_play', 'hear_play'];
	return ['see_play', 'hear_play', 'hear_name', 'degree_play'];
}

/**
 * Which directions *this item* can honestly answer.
 *
 * The same refusal one level down, because a rung is not always uniform. The
 * relative minor holds a scale and three triads in one rung, and only the
 * triads carry a degree — so asking the A minor scale which numeral it is would
 * be exactly the unanswerable question `directionsForRung` exists to prevent,
 * smuggled in by the rung next door.
 */
export function directionsForItem(rungId: RungId, item: LadderItem): CardDirection[] {
	return directionsForRung(rungId).filter(
		(direction) => direction !== 'degree_play' || Boolean(item.degree)
	);
}

/** Stable identity, so re-generating a rung matches its existing cards. */
export function ladderIdentity(
	key: string,
	rungId: string,
	item: LadderItem,
	direction: CardDirection
): string {
	return `ladder|${key}|${rungId}|${item.kind}|${item.label}|${direction}`;
}
