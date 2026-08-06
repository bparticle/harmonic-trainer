import {
	chordIntervals,
	formatChord,
	type Alteration,
	type AbstractChord,
	type ChordQuality,
	type Extension
} from './chord';
import { isDiatonic, type Key } from './key';
import { formatPitch, pitchClass, type Note } from './note';
import { spell } from './spell';

/**
 * Chord recognition.
 *
 * This never returns a single answer, because the question frequently does not
 * have one. D–F–A–C is genuinely both Dm7 and F6; which one it *is* depends on
 * the bass, the key and what came before it. Returning a ranked list with the
 * reasoning attached is honest; returning one name is a guess wearing a
 * confident face.
 */

export type Interpretation =
	| 'tertian'
	| 'shell'
	| 'rootless'
	| 'quartal'
	| 'upper-structure'
	| 'slash';

/** Which chord degree each alteration modifies. */
const ALTERATION_DEGREE: Record<Alteration, number> = {
	b5: 5,
	'#5': 5,
	b9: 9,
	'#9': 9,
	'#11': 11,
	b13: 13
};

export type Candidate = {
	chord: AbstractChord;
	/** 0–1. Ambiguous input should produce two similar, middling numbers. */
	confidence: number;
	interpretation: Interpretation;
	/** Which chord tone is in the bass. A fact about the voicing, not the chord. */
	inversion: 0 | 1 | 2 | 3;
	/** Chord degrees the player left out, e.g. [1, 5] for a rootless voicing. */
	omitted: number[];
	/** Why this candidate ranks where it does, in plain language. */
	reasoning: string[];
	symbol: string;
};

export type RecogniseContext = {
	key?: Key;
	previousChord?: AbstractChord;
	/** MIDI number of the bass note. Defaults to the lowest pitch given. */
	bass?: number;
};

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

type TemplateSpec = {
	quality: ChordQuality;
	extensions?: Extension[];
	alterations?: Alteration[];
	/**
	 * How often this chord actually turns up in this idiom, 0–1.
	 *
	 * This is the weight that makes E–G–B♭–D read as a rootless C9 rather than a
	 * root-position Em7♭5: both fit the notes exactly, but one of them is a chord
	 * jazz players reach for constantly and the other is comparatively rare.
	 */
	prior: number;
};

const TEMPLATE_SPECS: TemplateSpec[] = [
	{ quality: 'maj', prior: 0.95 },
	{ quality: 'min', prior: 0.95 },
	{ quality: 'dom', prior: 1.0 },
	{ quality: 'maj', extensions: [7], prior: 1.0 },
	{ quality: 'min', extensions: [7], prior: 1.0 },
	{ quality: 'maj6', prior: 0.8 },
	{ quality: 'min6', prior: 0.7 },
	{ quality: 'maj', extensions: [7, 9], prior: 0.85 },
	{ quality: 'min', extensions: [7, 9], prior: 0.85 },
	{ quality: 'dom', extensions: [9], prior: 0.9 },
	{ quality: 'dom', extensions: [13], prior: 0.8 },
	{ quality: 'min', extensions: [7, 11], prior: 0.6 },
	{ quality: 'maj', extensions: [7, 9, 13], prior: 0.55 },
	{ quality: 'sus4', prior: 0.6 },
	{ quality: 'sus2', prior: 0.5 },
	{ quality: 'sus4', extensions: [7], prior: 0.7 },
	{ quality: 'dom', alterations: ['b9'], prior: 0.75 },
	{ quality: 'dom', alterations: ['#9'], prior: 0.75 },
	{ quality: 'dom', alterations: ['#11'], prior: 0.6 },
	{ quality: 'dom', alterations: ['b13'], prior: 0.6 },
	{ quality: 'dom', alterations: ['#5'], prior: 0.5 },
	{ quality: 'dom', alterations: ['b5'], prior: 0.45 },
	// Comparatively rare, and that is the whole point of the number.
	{ quality: 'min7b5', extensions: [7], prior: 0.45 },
	{ quality: 'min7b5', prior: 0.3 },
	// Not actually rare — passing diminished chords are everywhere — and high
	// enough that a literal dim7 outranks the four rootless 7b9 readings of the
	// same four notes. Those readings still appear directly below it, which is
	// the useful part: a dim7 *is* the rootless b9 of four different dominants.
	{ quality: 'dim7', prior: 0.55 },
	{ quality: 'aug', prior: 0.3 }
];

type Template = {
	spec: TemplateSpec;
	/** Semitone offsets from the root, mod 12. */
	offsets: number[];
	/** Chord degree for each offset: 1, 3, 5, 7, 9, 11, 13. */
	degrees: number[];
	prior: number;
};

/** Diatonic step count to chord degree. */
function stepsToDegree(steps: number): number {
	return steps + 1;
}

const TEMPLATES: Template[] = TEMPLATE_SPECS.map((spec) => {
	const probe: AbstractChord = {
		root: { letter: 'C', alter: 0, octave: 4 },
		quality: spec.quality,
		extensions: spec.extensions ?? [],
		alterations: spec.alterations ?? []
	};
	const intervals = chordIntervals(probe);
	return {
		spec,
		offsets: intervals.map((i) => (((i.semitones % 12) + 12) % 12)),
		degrees: intervals.map((i) => stepsToDegree(i.steps)),
		prior: spec.prior
	};
});

/**
 * Shapes that are idiomatic *without* their root — the left-hand voicings a
 * jazz pianist plays thousands of times. Expressed as the set of degrees
 * remaining once the root is gone; the A and B forms differ in how they are
 * stacked, not in what they contain, so each set appears once.
 *
 * Every one of them carries a ninth or a thirteenth, and that is the point. A
 * bare 3–5–7 is not a rootless voicing, it is a triad: every minor triad is the
 * 3–5–7 of a major seventh a major third below it, so Dm would report as B♭∆
 * and Am as F∆. An extension is the evidence that the chord is genuinely bigger
 * than what is under the hand and the root has been dropped on purpose.
 */
const ROOTLESS_SHAPES: number[][] = [
	[3, 5, 7, 9],
	[3, 7, 9, 13],
	[3, 7, 9],
	[3, 7, 13]
];

function isRootlessShape(degrees: number[]): boolean {
	const present = new Set(degrees);
	return ROOTLESS_SHAPES.some(
		(shape) => shape.length === present.size && shape.every((d) => present.has(d))
	);
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const W = {
	/** How much the idiom prior counts. */
	prior: 0.42,
	/** Missing a degree that defines the chord's quality. */
	missingThird: 0.34,
	missingSeventh: 0.3,
	/** The fifth carries almost no information and is dropped constantly. */
	missingFifth: 0.04,
	/** Missing the root is a real cost — unless the remainder is a known shape. */
	missingRoot: 0.3,
	rootlessIdiom: 0.34,
	/** A colour tone the template claims but the player did not play. */
	missingColour: 0.16,
	bassIsRoot: 0.22,
	bassIsChordTone: 0.04,
	bassIsForeign: 0.3,
	allNotesDiatonic: 0.08,
	rootDiatonic: 0.05,
	fifthMotion: 0.1
} as const;

// ---------------------------------------------------------------------------
// Recognition
// ---------------------------------------------------------------------------

export function recognise(pitches: number[], context: RecogniseContext = {}): Candidate[] {
	if (pitches.length === 0) return [];

	const sorted = [...pitches].sort((a, b) => a - b);
	const bassMidi = context.bass ?? sorted[0];
	const bassPc = (((bassMidi % 12) + 12) % 12);
	const played = [...new Set(sorted.map((p) => (((p % 12) + 12) % 12)))];

	const candidates: Candidate[] = [];

	for (let root = 0; root < 12; root++) {
		for (const template of TEMPLATES) {
			const candidate = scoreTemplate(root, template, played, bassPc, context);
			if (candidate) candidates.push(candidate);
		}
	}

	const quartal = detectQuartal(sorted, context);
	if (quartal) candidates.push(quartal);

	const upper = detectUpperStructure(sorted, bassPc, context);
	if (upper) candidates.push(upper);

	// A candidate this weak is noise, not an alternative reading. Offering it
	// would only make the list harder to scan during a two-second reveal delay.
	const MINIMUM_CONFIDENCE = 0.15;

	candidates.sort((a, b) => b.confidence - a.confidence);

	// Collapse duplicates that describe the same chord by different templates,
	// keeping the highest-scoring reading of each.
	const seen = new Set<string>();
	const unique = candidates.filter((c) => {
		if (c.confidence < MINIMUM_CONFIDENCE) return false;
		const identity = `${c.symbol}|${c.interpretation}`;
		if (seen.has(identity)) return false;
		seen.add(identity);
		return true;
	});

	return unique.slice(0, 6);
}

function scoreTemplate(
	root: number,
	template: Template,
	played: number[],
	bassPc: number,
	context: RecogniseContext
): Candidate | null {
	const templatePcs = template.offsets.map((o) => (root + o) % 12);
	const byPc = new Map<number, number>();
	template.offsets.forEach((o, i) => byPc.set((root + o) % 12, template.degrees[i]));

	// Every note played has to be explained. An unexplained note means this is
	// simply the wrong template, not a slightly worse one.
	const unexplained = played.filter((pc) => !byPc.has(pc));
	if (unexplained.length > 0) return null;

	const playedSet = new Set(played);
	const missingDegrees = template.degrees.filter((_, i) => !playedSet.has(templatePcs[i]));

	// A chord needs at least three notes to be a chord.
	if (played.length < 3) return null;

	/*
	 * An alteration has to be audible.
	 *
	 * C–E–B♭ fits C7, C7♭5 and C7♯5 equally well, because the fifth is missing
	 * in all three — but you cannot hear a flattened fifth that was never
	 * played, and offering all three is inventing evidence. If the degree an
	 * alteration modifies is not in the notes, the reading is unsupported.
	 */
	const alterations = template.spec.alterations ?? [];
	if (alterations.some((a) => missingDegrees.includes(ALTERATION_DEGREE[a]))) return null;

	const reasoning: string[] = [];
	let score = W.prior * template.prior;

	const hasRoot = playedSet.has(root);
	const remaining = template.degrees.filter((_, i) => playedSet.has(templatePcs[i]));

	for (const degree of missingDegrees) {
		if (degree === 1) continue; // handled below
		if (degree === 3) score -= W.missingThird;
		else if (degree === 7) score -= W.missingSeventh;
		else if (degree === 5) score -= W.missingFifth;
		else score -= W.missingColour;
	}

	let interpretation: Interpretation = 'tertian';

	/*
	 * Root, third and seventh and nothing else is a shell voicing — the shape
	 * the curriculum teaches at L3, not merely "a chord missing its fifth".
	 * Naming the shape connects what is under the hand to something learnable.
	 */
	if (hasRoot && remaining.length === 3 && [1, 3, 7].every((d) => remaining.includes(d))) {
		interpretation = 'shell';
		reasoning.push('shell voicing: root, 3rd and 7th, with the fifth left out');
	}

	if (!hasRoot) {
		interpretation = 'rootless';
		score -= W.missingRoot;
		if (isRootlessShape(remaining)) {
			score += W.rootlessIdiom;
			reasoning.push(
				`rootless: the ${formatDegreeList(remaining)} with no root, a standard left-hand shape`
			);
		} else {
			reasoning.push('root not played');
		}
	}

	/*
	 * Bass and inversion.
	 *
	 * An inversion is not a slash chord. A first-inversion Cmaj7 is still Cmaj7 —
	 * the inversion is a fact about the voicing, recorded separately, exactly as
	 * the chord model keeps root and quality apart from the sounding pitches.
	 * `bass` is reserved for a bass note that is genuinely not a chord tone.
	 */
	const DEGREE_TO_INVERSION: Record<number, 0 | 1 | 2 | 3> = { 1: 0, 3: 1, 5: 2, 7: 3 };
	let inversion: 0 | 1 | 2 | 3 = 0;
	let slashBass: number | null = null;

	if (byPc.has(bassPc)) {
		const degree = byPc.get(bassPc)!;
		inversion = DEGREE_TO_INVERSION[degree] ?? 0;
		if (degree === 1) {
			score += W.bassIsRoot;
			reasoning.push('root in the bass');
		} else {
			score += W.bassIsChordTone;
			reasoning.push(`${ordinal(degree)} in the bass`);
		}
	} else {
		score -= W.bassIsForeign;
		slashBass = bassPc;
	}

	// Key context
	if (context.key) {
		const key = context.key;
		if (played.every((pc) => isDiatonic(key, pc))) {
			score += W.allNotesDiatonic;
			reasoning.push(`every note is diatonic to ${formatKeyShort(key)}`);
		}
		if (isDiatonic(key, root)) score += W.rootDiatonic;
	}

	// Previous chord: a root a fifth above this one is the ii–V or V–I motion
	// that drives most of this music.
	if (context.previousChord) {
		const previousRoot = pitchClass(context.previousChord.root);
		if ((previousRoot - root + 12) % 12 === 7) {
			score += W.fifthMotion;
			reasoning.push(`follows ${formatChord(context.previousChord)} down a fifth`);
		}
	}

	if (template.prior <= 0.45 && interpretation === 'tertian') {
		reasoning.push('an uncommon chord in this idiom');
	}

	const chord: AbstractChord = {
		root: spellRoot(root, context),
		quality: template.spec.quality,
		extensions: template.spec.extensions ?? [],
		alterations: template.spec.alterations ?? []
	};

	if (slashBass !== null) {
		chord.bass = spellRoot(slashBass, context);
		interpretation = 'slash';
		reasoning.push(`${formatPitch(chord.bass)} in the bass is not a chord tone`);
	}

	return {
		chord,
		confidence: clamp(score),
		interpretation,
		inversion,
		omitted: missingDegrees,
		reasoning,
		symbol: formatChord(chord)
	};
}

/**
 * Quartal voicings — the So What chord and its relatives. Labelled as what they
 * are rather than forced into a tertian name, because calling a stack of fourths
 * an inverted eleventh chord teaches the wrong thing about the shape.
 */
function detectQuartal(sorted: number[], context: RecogniseContext): Candidate | null {
	if (sorted.length < 4) return null;

	const gaps: number[] = [];
	for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);

	const fourths = gaps.filter((g) => g === 5).length;
	// The So What voicing is three stacked fourths with a major third on top.
	const isQuartal = fourths >= gaps.length - 1 && fourths >= 3;
	if (!isQuartal) return null;

	const bottom = (((sorted[0] % 12) + 12) % 12);
	const root = spellRoot(bottom, context);
	const topIsThird = gaps[gaps.length - 1] === 4;

	const chord: AbstractChord = {
		root,
		quality: 'sus4',
		extensions: [7],
		alterations: []
	};

	return {
		chord,
		confidence: 0.72,
		interpretation: 'quartal',
		// A quartal stack has no third, so it has no inversion in the tertian
		// sense; the bottom note is simply the bottom note.
		inversion: 0,
		omitted: [3],
		reasoning: [
			topIsThird
				? 'stacked fourths with a third on top — a So What voicing'
				: 'stacked fourths, a quartal voicing',
			'named by its shape rather than forced into a tertian label'
		],
		symbol: `${formatChord({ ...chord, quality: 'sus4', extensions: [] })} quartal`
	};
}

/** Semitone shapes of the two triads that get stacked on top of a dominant. */
const TRIAD_SHAPES: Array<[number[], 'maj' | 'min']> = [
	[[0, 4, 7], 'maj'],
	[[0, 3, 7], 'min']
];

/** Find the root of a triad given three pitch classes, in any inversion. */
function triadRoot(pcs: number[]): { root: number; quality: 'maj' | 'min' } | null {
	if (pcs.length !== 3) return null;
	for (const root of pcs) {
		const offsets = pcs.map((pc) => (pc - root + 12) % 12).sort((a, b) => a - b);
		for (const [shape, quality] of TRIAD_SHAPES) {
			if (shape.every((s, i) => s === offsets[i])) return { root, quality };
		}
	}
	return null;
}

/**
 * Upper-structure triads: a plain triad sitting on top of a dominant whose root
 * is somewhere else. Naming it "D over C7" is far more useful than "C13♯11",
 * because the triad is what the right hand is actually holding.
 */
function detectUpperStructure(
	sorted: number[],
	bassPc: number,
	context: RecogniseContext
): Candidate | null {
	if (sorted.length < 5) return null;

	const top = [...new Set(sorted.slice(-3).map((p) => (((p % 12) + 12) % 12)))];
	const triad = triadRoot(top);
	if (!triad) return null;
	if (triad.root === bassPc) return null;

	// The lower notes must supply a third and a seventh above the bass, or this
	// is just a chord with a triad accidentally embedded in it.
	const lower = new Set(sorted.slice(0, -3).map((p) => (((p % 12) + 12) % 12)));
	const hasThird = lower.has((bassPc + 4) % 12) || lower.has((bassPc + 3) % 12);
	const hasSeventh = lower.has((bassPc + 10) % 12) || lower.has((bassPc + 11) % 12);
	if (!hasThird || !hasSeventh) return null;

	const upperRoot = spellRoot(triad.root, context);
	const lowerRoot = spellRoot(bassPc, context);
	const isMajorThird = lower.has((bassPc + 4) % 12);
	const isMinorSeventh = lower.has((bassPc + 10) % 12);

	const lowerChord: AbstractChord = {
		root: lowerRoot,
		quality: isMajorThird ? (isMinorSeventh ? 'dom' : 'maj') : 'min',
		extensions: isMajorThird && isMinorSeventh ? [] : [7],
		alterations: []
	};

	const upperSymbol = `${formatPitch(upperRoot)}${triad.quality === 'min' ? 'm' : ''}`;

	return {
		chord: { ...lowerChord, bass: lowerRoot },
		confidence: 0.68,
		interpretation: 'upper-structure',
		// The lower chord's own root is in the bass.
		inversion: 0,
		omitted: [],
		reasoning: [
			`a ${upperSymbol} triad over ${formatChord(lowerChord)}`,
			'the right hand is holding a plain triad; that is the shape worth knowing'
		],
		symbol: `${upperSymbol}/${formatChord(lowerChord)}`
	};
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function spellRoot(pc: number, context: RecogniseContext): Note {
	if (context.key) return spell(pc, context.key);
	return spell(pc, { tonic: { letter: 'C', alter: 0, octave: 4 }, mode: 'ionian' });
}

function clamp(x: number): number {
	return Math.max(0, Math.min(1, x));
}

function ordinal(degree: number): string {
	if (degree === 1) return 'root';
	if (degree === 3) return '3rd';
	if (degree === 5) return '5th';
	if (degree === 7) return '7th';
	return `${degree}th`;
}

function formatDegreeList(degrees: number[]): string {
	const names = [...degrees].sort((a, b) => a - b).map(ordinal);
	if (names.length <= 1) return names.join('');
	return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function formatKeyShort(k: Key): string {
	const tonic = formatPitch(k.tonic);
	if (k.mode === 'ionian') return `${tonic} major`;
	if (k.mode === 'aeolian') return `${tonic} minor`;
	return `${tonic} ${k.mode}`;
}
