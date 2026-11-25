import { circleOfFifthsIndex, formatKey, key, keySignature } from '$lib/music/key';
import { pitchClass } from '$lib/music/note';

export type MajorKey = { name: string; signature: number; position: number; pc: number };

function major(name: string): MajorKey {
	const scale = key(name);
	const pc = pitchClass(scale.tonic);
	return {
		name: formatKey(scale, true),
		signature: keySignature(scale),
		position: circleOfFifthsIndex(pc),
		pc
	};
}

export const FIFTHS_WAVES = [
	{
		name: 'Home base',
		brief:
			'C sits at twelve o’clock. One step clockwise takes you to G. One step counterclockwise takes you to F.',
		keys: ['C', 'G', 'F'].map(major)
	},
	{
		name: 'Outward',
		brief:
			'Keep moving out from C. The sharp side adds one sharp per step. The flat side adds one flat per step.',
		keys: ['D', 'Bb', 'A', 'Eb'].map(major)
	},
	{
		name: 'Far side',
		brief:
			'The two sides meet at six o’clock. F♯ and G♭ share that spot and have different signatures.',
		keys: ['E', 'Ab', 'B', 'Db', 'F#', 'Gb'].map(major)
	},
	{
		name: 'Shared stations',
		brief:
			'One step past F♯ on the sharp side gives C♯, at D♭’s spot. One step past G♭ on the flat side gives C♭, at B’s spot.',
		keys: ['C#', 'Cb'].map(major)
	},
	{
		name: 'Mixed circuit',
		brief:
			'Every major key is in play. Directions change from shot to shot. A first-try hit within three seconds earns a speed bonus.',
		keys: []
	}
];

export const MIXED_WAVE = FIFTHS_WAVES.length - 1;

export type Shot = { target: MajorKey } & (
	| { kind: 'position' | 'signature-position' }
	| { kind: 'name' | 'signature'; choices: MajorKey[] }
	| { kind: 'neighbor'; from: MajorKey; direction: 1 | -1; choices: MajorKey[] }
);

export function signatureLabel(signature: number): string {
	if (signature === 0) return 'No sharps or flats';
	const count = Math.abs(signature);
	return `${count} ${signature > 0 ? 'sharp' : 'flat'}${count === 1 ? '' : 's'}`;
}

function shuffle<T>(values: readonly T[], random: () => number): T[] {
	const copy = [...values];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}

const MAJOR_KEYS = FIFTHS_WAVES.flatMap((wave) => wave.keys);

export function sharesPosition(target: MajorKey): boolean {
	return MAJOR_KEYS.some((key) => key.position === target.position && key !== target);
}

export function buildRound(wave: number, random = Math.random): Shot[] {
	const introduced = FIFTHS_WAVES[wave].keys;
	const known = FIFTHS_WAVES.slice(0, wave + 1).flatMap((wave) => wave.keys);
	const at = (signature: number) => known.find((key) => key.signature === signature)!;

	function choices(target: MajorKey, kind: 'name' | 'signature'): MajorKey[] {
		const spellBySide = kind === 'name' && sharesPosition(target);
		const other = shuffle(
			known.filter(
				(key) =>
					key !== target &&
					(!spellBySide || Math.sign(key.signature) === Math.sign(target.signature))
			),
			random
		);
		if (kind === 'signature') {
			// Nearby counts and the opposite sign make useful signature distractors.
			const distance = (key: MajorKey) =>
				Math.abs(Math.abs(key.signature) - Math.abs(target.signature));
			other.sort((a, b) => distance(a) - distance(b));
		}
		return shuffle([target, ...other.slice(0, 3)], random);
	}
	const pick = (kind: 'name' | 'signature', target: MajorKey): Shot => ({
		kind,
		target,
		choices: choices(target, kind)
	});
	const aim = (target: MajorKey): Shot => ({ kind: 'position', target });
	const aimBySignature = (target: MajorKey): Shot => ({ kind: 'signature-position', target });

	function neighbor(from: MajorKey, direction: 1 | -1): Shot {
		const target = at(from.signature + direction);
		return { kind: 'neighbor', from, direction, target, choices: choices(target, 'name') };
	}

	if (wave === MIXED_WAVE) {
		const byKey = shuffle(known, random).map((key, i) => {
			if (i % 3 === 0) return aim(key);
			return pick(i % 3 === 1 ? 'name' : 'signature', key);
		});
		const sharps = shuffle(
			known.filter((key) => key.signature > 0),
			random
		).slice(0, 2);
		const flats = shuffle(
			known.filter((key) => key.signature < 0),
			random
		).slice(0, 2);
		const bySignature = [at(0), ...sharps, ...flats].map(aimBySignature);
		const clockwise = shuffle(
			known.filter((key) => key.signature < 7),
			random
		).slice(0, 3);
		const counterclockwise = shuffle(
			known.filter((key) => key.signature > -7 && !clockwise.includes(key)),
			random
		).slice(0, 3);
		const turns = [
			...clockwise.map((key) => neighbor(key, 1)),
			...counterclockwise.map((key) => neighbor(key, -1))
		];
		return shuffle([...byKey, ...bySignature, ...turns], random);
	}

	const practice = introduced.map((key) => pick('signature', key));
	if (wave === 1) {
		practice.push(
			pick('name', at(1)),
			pick('name', at(-2)),
			neighbor(at(1), 1),
			neighbor(at(-1), -1)
		);
	} else if (wave === 2) {
		practice.push(
			pick('name', at(6)),
			pick('name', at(-6)),
			neighbor(at(4), 1),
			neighbor(at(-4), -1),
			aimBySignature(at(3)),
			aimBySignature(at(-3))
		);
	} else if (wave === 3) {
		practice.push(
			pick('name', at(7)),
			pick('name', at(-7)),
			neighbor(at(6), 1),
			neighbor(at(-6), -1),
			aimBySignature(at(7)),
			aimBySignature(at(-7))
		);
	}
	return [...introduced.map(aim), ...shuffle(practice, random)];
}
