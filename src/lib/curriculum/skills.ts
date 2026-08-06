import type { SkillCategory } from '$lib/server/db/schema';

/**
 * The curriculum, as a directed graph of skills.
 *
 * Authored here and seeded into the database, never invented at runtime — the
 * brief is explicit about that, and it means the shape of the whole syllabus is
 * one readable file rather than something to be reverse-engineered from rows.
 *
 * Two things run in parallel. The levelled track (L0–L11) builds the theory in
 * order; the application track (A0–A3) gives it somewhere to go on the same
 * day it is learned, so the thing never becomes dry. Application skills depend
 * on the theory they use, which is what keeps the two in step.
 *
 * Every `description` is written as a *delta from something already owned*,
 * because that is how the brief wants new material introduced: not "here is a
 * tritone substitution" but "you already play Dm7–G7–C; move one root and
 * keep both guide tones".
 */

export type SkillSeed = {
	code: string;
	name: string;
	level: number;
	category: SkillCategory;
	description: string;
	prereqs: string[];
	/**
	 * How this skill generates cards. The generator reads this rather than
	 * switching on the code, so adding a skill does not mean editing a switch.
	 */
	generator: GeneratorSpec;
};

export type GeneratorSpec =
	/** One card per key: the scale itself. */
	| { kind: 'scale'; mode: 'ionian' | 'aeolian' | 'dorian' | 'mixolydian' | 'lydian' }
	/** One card per key per degree: the diatonic seventh chords. */
	| { kind: 'diatonic-sevenths'; triadsOnly?: boolean }
	/** One card per key per degree per inversion. */
	| { kind: 'inversions'; sevenths: boolean }
	/** Shell voicings on the ii, V and I of each key. */
	| { kind: 'shells'; orders: Array<'1-3-7' | '1-7-3'> }
	/** The ii–V–I itself, one card per key. */
	| { kind: 'two-five-one'; quality: 'major' | 'minor' }
	/** Rootless A and B forms over a ii–V–I. */
	| { kind: 'rootless'; forms: Array<'A' | 'B'> }
	/** One card per mode per key. */
	| { kind: 'modes' }
	/** Secondary dominants and their tritone substitutes. */
	| { kind: 'applied-dominants'; substitutes: boolean }
	/** Chords borrowed from the parallel key. */
	| { kind: 'borrowed'; degrees: string[] }
	/** Modulations at a given distance on the circle of fifths. */
	| { kind: 'modulation'; distances: number[] }
	/** Upper-structure triads and altered dominants. */
	| { kind: 'upper-structures' }
	/** Quartal voicings. */
	| { kind: 'quartal' }
	/** A chart the whole skill is played over. */
	| { kind: 'chart'; chart: string }
	/** Captured from your own playing rather than generated. */
	| { kind: 'inventory' }
	/** Constraint-driven writing; no drill cards. */
	| { kind: 'none' };

export const SKILLS: SkillSeed[] = [
	{
		code: 'L0',
		name: 'Inventory',
		level: 0,
		category: 'inventory',
		description:
			'Record the progressions your hands already know without being told. Everything below is ordered against what this finds, so it is worth doing honestly rather than impressively.',
		prereqs: [],
		generator: { kind: 'inventory' }
	},

	{
		code: 'L1',
		name: 'Key anchoring',
		level: 1,
		category: 'keys',
		description:
			'The major scale and its seven diatonic sevenths, one key at a time. This is the thing you already do — scale in the right hand, chords underneath — with the chords finally named.',
		prereqs: ['L0'],
		generator: { kind: 'diatonic-sevenths' }
	},
	{
		code: 'L1b',
		name: 'Degree numbers',
		level: 1,
		category: 'keys',
		description:
			'Name a chord by its number rather than its letter. Once a progression is ii–V–I instead of Dm7–G7–C, it is the same progression in all twelve keys.',
		prereqs: ['L1'],
		generator: { kind: 'scale', mode: 'ionian' }
	},

	{
		code: 'L2',
		name: 'Inversions',
		level: 2,
		category: 'voicings',
		description:
			'The same chord with a different note underneath. Nothing about the chord changes; what changes is which note is on top, and that is the note the ear follows.',
		prereqs: ['L1'],
		generator: { kind: 'inversions', sevenths: true }
	},

	{
		code: 'L3',
		name: 'Shell voicings',
		level: 3,
		category: 'voicings',
		description:
			'Root, third, seventh. Drop the fifth — it says nothing that the other three do not — and the left hand suddenly has a spare finger and a clearer sound.',
		prereqs: ['L2'],
		generator: { kind: 'shells', orders: ['1-3-7', '1-7-3'] }
	},

	{
		code: 'L4',
		name: 'ii–V–I, major',
		level: 4,
		category: 'progressions',
		description:
			'You already play this. Keep the left hand still and move only the third and seventh: those two notes swap roles between the ii and the V, and again between the V and the I. That is the whole mechanism, and it is identical in all twelve keys.',
		prereqs: ['L3'],
		generator: { kind: 'two-five-one', quality: 'major' }
	},
	{
		code: 'L4b',
		name: 'ii–V–i, minor',
		level: 4,
		category: 'progressions',
		description:
			'The same shape with two changes: the ii becomes half-diminished, and the V borrows a major third from harmonic minor so it still pulls.',
		prereqs: ['L4'],
		generator: { kind: 'two-five-one', quality: 'minor' }
	},

	{
		code: 'L5',
		name: 'Rootless voicings',
		level: 5,
		category: 'voicings',
		description:
			'Take the shell and throw away the root as well — the bass has it. Form A stacks 3–5–7–9, form B stacks 7–9–3–5, and alternating them down a ii–V–I means the hand barely moves.',
		prereqs: ['L4'],
		generator: { kind: 'rootless', forms: ['A', 'B'] }
	},

	{
		code: 'L6',
		name: 'Modes and chord-scales',
		level: 6,
		category: 'modes',
		description:
			'Seven scales that are all the same seven notes started in different places. On the wheel they are one block of seven sliding round: each step anticlockwise flattens exactly one more degree.',
		prereqs: ['L1b'],
		generator: { kind: 'modes' }
	},

	{
		code: 'L7',
		name: 'Secondary dominants and tritone subs',
		level: 7,
		category: 'reharm',
		description:
			'Any chord can be preceded by its own dominant — a jump of one step on the wheel. And any dominant can be swapped for the one a tritone away, straight across the wheel, because the two share a third and a seventh with the roles reversed.',
		prereqs: ['L4'],
		generator: { kind: 'applied-dominants', substitutes: true }
	},

	{
		code: 'L8',
		name: 'Modal interchange',
		level: 8,
		category: 'reharm',
		description:
			'Borrow a chord from the parallel key. The iv, the ♭VI and the ♭VII are the three that do the most work, and each one is a single note away from something already in the key.',
		prereqs: ['L6', 'L7'],
		generator: { kind: 'borrowed', degrees: ['iv', 'bVI', 'bVII', 'bIII'] }
	},

	{
		code: 'L9',
		name: 'Modulation',
		level: 9,
		category: 'reharm',
		description:
			'Changing key, measured as distance on the wheel. One or two steps and the keys share chords you can pivot on; three or more and they share nothing, so you go direct or through a dominant.',
		prereqs: ['L8'],
		generator: { kind: 'modulation', distances: [1, 2, 3, 6] }
	},

	{
		code: 'L10',
		name: 'Upper structures and altered dominants',
		level: 10,
		category: 'voicings',
		description:
			'A plain triad in the right hand over a dominant in the left. The triad is easy to grab and the combination is not — which is exactly why it is worth naming what the right hand is holding.',
		prereqs: ['L5', 'L7'],
		generator: { kind: 'upper-structures' }
	},
	{
		code: 'L10b',
		name: 'Quartal voicings',
		level: 10,
		category: 'voicings',
		description:
			'Stacked fourths instead of stacked thirds. They belong to no single chord, which is the point: one shape covers a whole modal area.',
		prereqs: ['L6'],
		generator: { kind: 'quartal' }
	},

	{
		code: 'L11',
		name: 'Reharmonisation',
		level: 11,
		category: 'reharm',
		description:
			'Everything above, applied backwards: take a progression you own and change one chord at a time to see what it can become.',
		prereqs: ['L9', 'L10'],
		generator: { kind: 'none' }
	},

	// The application track. Runs from L1 so the theory always has somewhere to
	// go the same day it is learned.
	{
		code: 'A0',
		name: 'Twelve-bar blues',
		level: 1,
		category: 'application',
		description:
			'Three chords, twelve bars, and every device above can be smuggled into it. The vehicle for everything until it is not enough.',
		prereqs: ['L1'],
		generator: { kind: 'chart', chart: 'blues-12' }
	},
	{
		code: 'A1',
		name: 'Minor blues',
		level: 4,
		category: 'application',
		description:
			'The same twelve bars in minor, which forces the half-diminished ii and the altered V to become automatic.',
		prereqs: ['A0', 'L4b'],
		generator: { kind: 'chart', chart: 'minor-blues-12' }
	},
	{
		code: 'A2',
		name: 'Rhythm changes',
		level: 5,
		category: 'application',
		description:
			'Thirty-two bars that are mostly ii–Vs moving fast, with a bridge that is nothing but a chain of dominants. The endurance test for everything in L4 and L5.',
		prereqs: ['A0', 'L5'],
		generator: { kind: 'chart', chart: 'rhythm-changes' }
	},
	{
		code: 'A3',
		name: 'Modal vamps',
		level: 6,
		category: 'application',
		description:
			'Two chords, or one, for a long time. Nowhere to hide behind harmonic motion, so the melodic and voicing choices have to carry it.',
		prereqs: ['L6'],
		generator: { kind: 'chart', chart: 'modal-vamp' }
	}
];

/** Mastery gate: a skill unlocks only when every prerequisite has cleared this bar. */
export const MASTERY = {
	/** Proportion of reviews correct. */
	accuracy: 0.85,
	/** Below this many reviews, accuracy means nothing. */
	minimumReviews: 12,
	/**
	 * At least one unprompted appearance in free play.
	 *
	 * The brief's real success metric: a thing is not learned because it was
	 * answered correctly twelve times, it is learned when it turns up in playing
	 * nobody asked for.
	 */
	requiresTransfer: true
} as const;

export function skillByCode(code: string): SkillSeed | undefined {
	return SKILLS.find((s) => s.code === code);
}

/** Every skill that lists `code` as a prerequisite. */
export function dependents(code: string): SkillSeed[] {
	return SKILLS.filter((s) => s.prereqs.includes(code));
}

/**
 * Skills in an order where every prerequisite comes before what needs it.
 * Throws on a cycle, which is the only way a curriculum graph can be wrong in a
 * way that is not obvious by reading it.
 */
export function topologicalOrder(skills: SkillSeed[] = SKILLS): SkillSeed[] {
	const byCode = new Map(skills.map((s) => [s.code, s]));
	const visited = new Set<string>();
	const visiting = new Set<string>();
	const ordered: SkillSeed[] = [];

	const visit = (skill: SkillSeed, trail: string[]) => {
		if (visited.has(skill.code)) return;
		if (visiting.has(skill.code)) {
			throw new Error(`Cycle in the curriculum: ${[...trail, skill.code].join(' → ')}`);
		}
		visiting.add(skill.code);

		for (const code of skill.prereqs) {
			const prereq = byCode.get(code);
			if (!prereq) throw new Error(`${skill.code} needs ${code}, which does not exist`);
			visit(prereq, [...trail, skill.code]);
		}

		visiting.delete(skill.code);
		visited.add(skill.code);
		ordered.push(skill);
	};

	for (const skill of skills) visit(skill, []);
	return ordered;
}
