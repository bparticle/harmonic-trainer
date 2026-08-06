import type { BlockType, CardDirection } from '$lib/server/db/schema';
import { DIRECTION_WEIGHT, selectDue, type Schedulable } from '$lib/srs/scheduler';

/**
 * Planning a session.
 *
 * One button on the home screen and no menus, so everything below decides
 * itself: which key today is in, which cards are worth asking, and which single
 * new idea to introduce. All of it is pure — given the same due cards and the
 * same history it plans the same session — so it can be tested without a
 * database, a clock or a keyboard.
 */

export type SessionLength = 10 | 20 | 35;

export type BlockPlan = {
	type: BlockType;
	/** Seconds. */
	duration: number;
	title: string;
	/** One line explaining what this block is for, shown while it runs. */
	instruction: string;
	/** Cards to ask, for the blocks that ask questions. */
	cardIds: string[];
};

export type SessionPlan = {
	keyCenter: string;
	lengthMinutes: SessionLength;
	blocks: BlockPlan[];
	/** The single new idea for this session, if one is due. */
	atomId: string | null;
	/** Keys the blind-spot weighting is pushing forward. */
	coldKeys: string[];
	/** True when the key was asked for rather than chosen by weighting. */
	chosenKey?: boolean;
	/** Skills the drills were narrowed to, if any. */
	focusSkills?: string[] | null;
};

/**
 * How the minutes divide.
 *
 * The twenty-minute shape is the brief's, to the second. The other two lengths
 * keep the same proportions rather than dropping blocks, because a session that
 * silently loses its capture block stops producing the data the whole app runs
 * on.
 */
const SHAPE: Array<{ type: BlockType; share: number; title: string; instruction: string }> = [
	{
		type: 'wheel_warmup',
		share: 3 / 20,
		title: 'Warm up',
		// Deliberately generic: the real instruction comes from the rung you are
		// on, and promising "the seven diatonic sevenths" while you are still on
		// the scale is exactly the kind of thing that makes a session feel like it
		// is aimed at someone else.
		instruction: 'Hands on the keys, slowly. Nothing here is timed against you.'
	},
	{
		type: 'name_what_you_play',
		share: 3 / 20,
		title: 'Name what you play',
		instruction:
			'Play whatever you like. Each chord is held back for a moment before it is named — say it first.'
	},
	{
		type: 'ear_drill',
		share: 4 / 20,
		title: 'Ear drill',
		instruction: 'Listen, then play it back. No screen needed.'
	},
	{
		type: 'new_atom',
		share: 5 / 20,
		title: 'One new thing',
		instruction: 'A single change to something you already play.'
	},
	{
		type: 'apply',
		share: 5 / 20,
		title: 'Apply it',
		instruction: 'Improvise. Today’s idea is marked on the wheel. This is being recorded.'
	},
	{
		type: 'log',
		share: 0.5 / 20,
		title: 'Log',
		instruction: 'How did each one feel?'
	}
];

/**
 * How each question-asking block draws from the due pile.
 *
 * `skills` matters as much as `directions`. The warm-up says "scale in the
 * right hand, the seven diatonic sevenths underneath", so it has to be given
 * key-anchoring material — an earlier version handed it any `see_play` card and
 * cheerfully told you to warm up by playing a ii–V–i. A block that contradicts
 * its own instruction teaches you to stop reading them.
 */
const DRILL_BLOCKS: Partial<
	Record<BlockType, { directions: CardDirection[]; skills?: string[] }>
> = {
	// Everything now draws from wherever the ladder is. The warm-up used to be
	// pinned to the old key-anchoring skills, which no longer exist — and which
	// would have been wrong anyway, since the rung you are on *is* the thing to
	// warm up on.
	wheel_warmup: { directions: ['see_play'] },
	name_what_you_play: { directions: ['play_name'] },
	ear_drill: { directions: ['hear_name', 'hear_play'] }
};

/** Roughly how long one card takes, used to size each block's queue. */
const SECONDS_PER_CARD = 12;

export type PlanInput = {
	lengthMinutes: SessionLength;
	/** Everything with a schedule, due or not. */
	cards: Schedulable[];
	/** Reviews per key, for the cold-key weighting. */
	reviewsByKey: Map<string, number>;
	/** All keys the curriculum covers. */
	allKeys: string[];
	/** The next unmastered skill, if the graph has one open. */
	atomId?: string | null;
	/** A key you asked for. Overrides the cold-key weighting. */
	preferredKey?: string | null;
	/**
	 * Skills to concentrate the drills on.
	 *
	 * Applies only to blocks that have no material of their own — the warm-up
	 * stays the warm-up whatever you pick, because a warm-up that is not a
	 * warm-up is just another drill with a misleading name.
	 */
	focusSkills?: string[] | null;
	now?: Date;
};

/**
 * Choose the key for today.
 *
 * Weighted towards the least practised, but not purely — always drilling the
 * worst key would make every session a fight, and the brief wants the keys
 * cycled around the wheel rather than sorted by weakness. The coldest of the
 * four coldest is picked, which keeps it moving without ever settling into the
 * comfortable ones.
 */
export function chooseKey(
	reviewsByKey: Map<string, number>,
	allKeys: string[],
	now = new Date()
): string {
	if (allKeys.length === 0) return 'C';

	const ranked = [...allKeys].sort(
		(a, b) => (reviewsByKey.get(a) ?? 0) - (reviewsByKey.get(b) ?? 0)
	);
	const pool = ranked.slice(0, Math.max(1, Math.min(4, ranked.length)));

	// Rotate through the coldest few by day, so consecutive sessions differ
	// without needing randomness that would break resuming.
	const dayNumber = Math.floor(now.getTime() / 86_400_000);
	return pool[dayNumber % pool.length];
}

export function coldestKeys(
	reviewsByKey: Map<string, number>,
	allKeys: string[],
	count = 4
): string[] {
	return [...allKeys]
		.sort((a, b) => (reviewsByKey.get(a) ?? 0) - (reviewsByKey.get(b) ?? 0))
		.slice(0, count);
}

export function blockDurations(lengthMinutes: SessionLength): number[] {
	const total = lengthMinutes * 60;
	return SHAPE.map((block) => Math.max(20, Math.round(total * block.share)));
}

export function planSession(input: PlanInput): SessionPlan {
	const now = input.now ?? new Date();
	const cold = coldestKeys(input.reviewsByKey, input.allKeys);

	const pool = input.allKeys;
	// An asked-for key wins outright, as long as it exists at all.
	const honoured = Boolean(input.preferredKey && input.allKeys.includes(input.preferredKey));
	const keyCenter = honoured
		? input.preferredKey!
		: chooseKey(input.reviewsByKey, pool, now);

	const durations = blockDurations(input.lengthMinutes);
	const focus = input.focusSkills?.length ? input.focusSkills : null;

	// One ordered pool of due cards for the whole session, so no card is asked
	// twice in one sitting even when two blocks could both use it.
	const due = selectDue(input.cards, { now, coldKeys: cold });
	const taken = new Set<string>();

	const blocks: BlockPlan[] = SHAPE.map((block, index) => {
		const duration = durations[index];
		const source = DRILL_BLOCKS[block.type];
		let cardIds: string[] = [];

		if (source) {
			const wanted = Math.max(1, Math.round(duration / SECONDS_PER_CARD));
			// A block with its own material keeps it; the rest follow the focus.
			const wantedSkills = source.skills ?? focus;

			cardIds = due
				.filter(
					(c) =>
						source.directions.includes(c.direction) &&
						!taken.has(c.cardId) &&
						(!wantedSkills || (c.skillCode ? wantedSkills.includes(c.skillCode) : false))
				)
				// Today's key first; the rest of the due pile behind it.
				.sort((a, b) => Number(b.keyCenter === keyCenter) - Number(a.keyCenter === keyCenter))
				.slice(0, wanted)
				.map((c) => c.cardId);
			for (const id of cardIds) taken.add(id);
		}

		return {
			type: block.type,
			duration,
			title: block.title,
			instruction: block.instruction,
			cardIds
		};
	});

	return {
		keyCenter,
		lengthMinutes: input.lengthMinutes,
		blocks,
		atomId: input.atomId ?? null,
		coldKeys: cold,
		// Whether the key was actually honoured, not merely requested — asking for
		// a key that does not exist should not read as having chosen it.
		chosenKey: honoured,
		focusSkills: focus
	};
}

/** Total planned seconds, for showing before you start. */
export function plannedSeconds(plan: SessionPlan): number {
	return plan.blocks.reduce((total, block) => total + block.duration, 0);
}

/**
 * Where a partly-finished session should resume.
 *
 * Sessions can be abandoned without penalty, so picking one back up has to be
 * possible hours later: the first block with no recorded result is where you
 * left off.
 */
export function resumeIndex(plan: SessionPlan, completed: BlockType[]): number {
	const done = new Set(completed);
	const index = plan.blocks.findIndex((block) => !done.has(block.type));
	return index === -1 ? plan.blocks.length : index;
}

export function isFinished(plan: SessionPlan, completed: BlockType[]): boolean {
	return resumeIndex(plan, completed) >= plan.blocks.length;
}

/** Direction weights, re-exported so the UI can explain why a card came up. */
export { DIRECTION_WEIGHT };
