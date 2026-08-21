export type AvatarVariant = 0 | 1 | 2 | 3;

export type AvatarTraits = {
	field: number;
	orbit: number;
	mark: number;
	spark: number;
	variant: AvatarVariant;
	rotation: number;
	orbitX: number;
	orbitY: number;
	scale: number;
	flip: boolean;
};

/**
 * A small, stable PRNG seeded from the player's name.
 *
 * Avatars are presentation rather than account data: the same name always
 * produces the same chromatic portrait, with no file to upload or row to keep
 * in sync. Case and surrounding whitespace do not change somebody's portrait.
 */
function nameSeed(name: string): number {
	const normalized = name.trim().normalize('NFKC').toLocaleLowerCase('en-US') || 'player';
	let hash = 2_166_136_261;
	for (const symbol of normalized) {
		hash ^= symbol.codePointAt(0) ?? 0;
		hash = Math.imul(hash, 16_777_619);
	}
	return hash >>> 0;
}

function generator(seed: number): () => number {
	let state = seed || 0x6d2b79f5;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return state >>> 0;
	};
}

function nextUnused(start: number, used: number[]): number {
	let note = start % 12;
	while (used.includes(note)) note = (note + 1) % 12;
	return note;
}

/** Pick the note colours and geometric traits for one chromatic portrait. */
export function avatarTraits(name: string): AvatarTraits {
	const next = generator(nameSeed(name));
	const take = (limit: number) => next() % limit;

	const field = take(12);
	const orbit = nextUnused(field + 2 + take(9), [field]);
	const mark = nextUnused(orbit + 2 + take(9), [field, orbit]);
	const spark = nextUnused(mark + 2 + take(9), [field, orbit, mark]);

	return {
		field,
		orbit,
		mark,
		spark,
		variant: take(4) as AvatarVariant,
		rotation: -45 + take(7) * 15,
		orbitX: 13 + take(23),
		orbitY: 13 + take(23),
		scale: 0.84 + take(6) * 0.04,
		flip: take(2) === 1
	};
}
