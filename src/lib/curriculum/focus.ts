import { SKILLS, type SkillSeed } from './skills';

/**
 * Choosing what to work on.
 *
 * The brief asks for one button and no menus, and that is right for the days
 * when you just want to sit down and play. But it is wrong on the days when you
 * know perfectly well what you want to practise, and being told otherwise by a
 * scheduler is how good tools get abandoned.
 *
 * So: the app still decides by default. Picking a focus overrides the drill
 * blocks only — the warm-up stays the warm-up — and everything is recorded
 * either way, so steering it costs nothing in what gets remembered.
 */

export type FocusArea = {
	id: string;
	label: string;
	/** One line, so the choice is obvious without knowing the curriculum codes. */
	description: string;
	/** Skills this draws from. Empty means "whatever is due". */
	skills: string[];
};

export const FOCUS_AREAS: FocusArea[] = [
	{
		id: 'due',
		label: 'Whatever’s due',
		description: 'Let the scheduler pick. Weighted towards the keys you avoid.',
		skills: []
	},
	{
		id: 'keys',
		label: 'Keys and scales',
		description: 'The major scale and its seven diatonic sevenths, one key at a time.',
		skills: ['L1', 'L1b']
	},
	{
		id: 'inversions',
		label: 'Inversions',
		description: 'The same chord with a different note underneath, and on top.',
		skills: ['L2']
	},
	{
		id: 'shells',
		label: 'Shell voicings',
		description: 'Root, third, seventh. The fifth left out.',
		skills: ['L3']
	},
	{
		id: 'twofive',
		label: 'ii–V–I',
		description: 'Major and minor, with the guide tones doing the work.',
		skills: ['L4', 'L4b']
	},
	{
		id: 'rootless',
		label: 'Rootless voicings',
		description: 'A and B forms, alternating so the hand barely moves.',
		skills: ['L5']
	},
	{
		id: 'modes',
		label: 'Modes',
		description: 'Seven scales that are the same seven notes started elsewhere.',
		skills: ['L6']
	},
	{
		id: 'dominants',
		label: 'Secondary dominants and subs',
		description: 'Approaching any chord by its own dominant, or the tritone away.',
		skills: ['L7']
	},
	{
		id: 'borrowed',
		label: 'Borrowed chords',
		description: 'The iv, ♭VI and ♭VII, taken from the parallel minor.',
		skills: ['L8']
	},
	{
		id: 'modulation',
		label: 'Modulation',
		description: 'Changing key, measured as distance round the wheel.',
		skills: ['L9']
	},
	{
		id: 'upper',
		label: 'Upper structures and quartal',
		description: 'Triads over dominants, and stacks of fourths.',
		skills: ['L10', 'L10b']
	}
];

export function focusById(id: string | null | undefined): FocusArea | null {
	if (!id) return null;
	return FOCUS_AREAS.find((f) => f.id === id) ?? null;
}

/** The skills a focus covers, as seeds. */
export function skillsInFocus(id: string | null | undefined): SkillSeed[] {
	const focus = focusById(id);
	if (!focus || focus.skills.length === 0) return [];
	return SKILLS.filter((s) => focus.skills.includes(s.code));
}

/**
 * Which focus a skill belongs to, for describing what a session ended up
 * being about when nobody chose.
 */
export function focusForSkill(skillCode: string): FocusArea | null {
	return FOCUS_AREAS.find((f) => f.skills.includes(skillCode)) ?? null;
}
