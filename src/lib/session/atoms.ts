import {
	chordPitchClasses,
	diatonicSeventh,
	formatChord,
	parseChord,
	type AbstractChord
} from '$lib/music/chord';
import { ivl, transpose } from '$lib/music/interval';
import { formatKey, key as makeKey, type Key } from '$lib/music/key';
import { formatNote, pitchClass } from '$lib/music/note';
import { spell } from '$lib/music/spell';

/**
 * The one new thing per session.
 *
 * Every atom is written as a *change to something already under the hands*.
 * Not "here is the tritone substitution" but "you already play Dm7–G7–C; move
 * one root by a tritone and both guide tones stay put". That framing is the
 * brief's central method and the reason the app exists — new material has to
 * grow out of old material or it arrives from nowhere and leaves the same way.
 *
 * Each atom names a `from` shape and a `to` shape so the wheel can animate
 * between them. Watching the shape move is the explanation; the words are the
 * caption.
 */

export type Atom = {
	id: string;
	/** The skill this belongs to, so mastery gating can pick it. */
	skillCode: string;
	title: string;
	/** The thing you already own. */
	from: (k: Key) => AbstractChord[];
	/** What it becomes. */
	to: (k: Key) => AbstractChord[];
	/** Written in the second person, as a change, transposed into today's key. */
	explain: (k: Key) => string;
	/** What to listen for while playing it. */
	listenFor: string;
};

const ii = (k: Key) => diatonicSeventh(k, 2);
const V = (k: Key) => diatonicSeventh(k, 5);
const I = (k: Key) => diatonicSeventh(k, 1);
const iv = (k: Key) => diatonicSeventh(makeKey(k.tonic, 'aeolian'), 4);

const dom = (root: AbstractChord['root']): AbstractChord => ({
	root,
	quality: 'dom',
	extensions: [],
	alterations: []
});

/**
 * A dominant on a chromatic degree, spelled the way it would actually be
 * written.
 *
 * Transposing by interval forces the letter, so the tritone substitute in E♭
 * came out as F♭7 — theoretically the flattened second, and a spelling nobody
 * has ever put on a chart. `spell` resolves the pitch class against the key and
 * gives E7.
 */
const chromaticDom = (k: Key, semitonesAboveTonic: number): AbstractChord =>
	dom(spell((pitchClass(k.tonic) + semitonesAboveTonic) % 12, k));

const name = (c: AbstractChord) => formatChord(c);

export const ATOMS: Atom[] = [
	{
		id: 'guide-tones',
		skillCode: 'L4',
		title: 'The two notes that do the work',
		from: (k) => [ii(k), V(k), I(k)],
		to: (k) => [ii(k), V(k), I(k)],
		explain: (k) => {
			const [two, five, one] = [ii(k), V(k), I(k)];
			const third = transpose(two.root, ivl('m3'));
			const seventh = transpose(two.root, ivl('m7'));
			return `You already play ${name(two)} – ${name(five)} – ${name(one)}. Keep the left hand still and move only two notes: ${formatNote(third)} and ${formatNote(seventh)}. They swap roles between the ${name(two)} and the ${name(five)} — the seventh drops a semitone to become the third, and the third stays where it is and becomes the seventh. That is the whole mechanism, and it is identical in all twelve keys.`;
		},
		listenFor: 'Two notes moving by a semitone or not at all, while everything else holds.'
	},
	{
		id: 'drop-the-fifth',
		skillCode: 'L3',
		title: 'Lose the fifth',
		from: (k) => [I(k)],
		to: (k) => [I(k)],
		explain: (k) =>
			`Play ${name(I(k))} the way you normally would, then take the fifth out and keep root, third and seventh. Nothing about the chord changes — the fifth was telling you nothing the other three were not — and your left hand now has a spare finger and a clearer sound.`,
		listenFor: 'The chord should not sound thinner. If it does, you dropped the wrong note.'
	},
	{
		id: 'drop-the-root',
		skillCode: 'L5',
		title: 'Lose the root as well',
		from: (k) => [ii(k), V(k)],
		to: (k) => [
			{ ...ii(k), extensions: [7, 9] },
			{ ...V(k), extensions: [7, 9] }
		],
		explain: (k) =>
			`You have the shell of ${name(ii(k))} – ${name(V(k))}. Now throw away the root too and add the ninth: play the 3rd, 5th, 7th and 9th. Alternate that with the 7th, 9th, 3rd and 5th on the next chord and your hand barely moves between them. The bass has the root; you do not need it.`,
		listenFor: 'The top note should move by a step at most as you change chord.'
	},
	{
		id: 'borrowed-four',
		skillCode: 'L8',
		title: 'Borrow the minor four',
		from: (k) => [diatonicSeventh(k, 4), I(k)],
		to: (k) => [iv(k), I(k)],
		explain: (k) =>
			`You play ${name(diatonicSeventh(k, 4))} going home to ${name(I(k))}. Flatten one note — the third of that chord — and it becomes ${name(iv(k))}. Same root, same function, borrowed from ${formatNote(k.tonic)} minor. One semitone, and the whole ending changes colour.`,
		listenFor: 'The moment of sweetness on the way home. One note is doing all of it.'
	},
	{
		id: 'tritone-sub',
		skillCode: 'L7',
		title: 'Move the V a tritone',
		from: (k) => [ii(k), V(k), I(k)],
		to: (k) => [ii(k), chromaticDom(k, 1), I(k)],
		explain: (k) => {
			const sub = chromaticDom(k, 1);
			return `You already play ${name(ii(k))} – ${name(V(k))} – ${name(I(k))}. Move only the V, straight across the wheel, to ${name(sub)}. Its third and seventh are the same two notes as ${name(V(k))}'s with their roles swapped — which is why your ear accepts it without argument. The bass now walks down by semitones into ${name(I(k))}.`;
		},
		listenFor: 'The guide tones do not move. Only the bass does.'
	},
	{
		id: 'backdoor',
		skillCode: 'L8',
		title: 'Come in the back door',
		from: (k) => [V(k), I(k)],
		to: (k) => [iv(k), chromaticDom(k, 10), I(k)],
		explain: (k) =>
			`Instead of arriving at ${name(I(k))} from ${name(V(k))} above, come from ${name(chromaticDom(k, 10))} below. Put ${name(iv(k))} in front of it and you have the whole gesture. It resolves upward, which is the opposite of everything else you do, and that is exactly why it sounds like it does.`,
		listenFor: 'The pull is upwards into the tonic instead of downwards.'
	},
	{
		id: 'secondary-dominant',
		skillCode: 'L7',
		title: 'Give a chord its own dominant',
		from: (k) => [I(k), diatonicSeventh(k, 6)],
		to: (k) => [I(k), dom(transpose(diatonicSeventh(k, 6).root, ivl('P5'))), diatonicSeventh(k, 6)],
		explain: (k) => {
			const six = diatonicSeventh(k, 6);
			const applied = dom(transpose(six.root, ivl('P5')));
			return `You go from ${name(I(k))} to ${name(six)}. Put ${name(applied)} between them — the dominant of ${name(six)}, one step round the wheel from it. Any chord can be approached this way, and it is a single new note: the third of ${name(applied)}, which is not in the key.`;
		},
		listenFor: 'One note from outside the key, and the arrival suddenly means more.'
	},
	{
		id: 'top-note',
		skillCode: 'L2',
		title: 'Choose the top note',
		from: (k) => [I(k)],
		to: (k) => [I(k)],
		explain: (k) =>
			`Play ${name(I(k))} four times, each with a different note on top: root, third, fifth, seventh. It is the same chord every time, and you will hear four different things — your ear follows the highest note. Choosing which one sits on top is most of what voicing actually means.`,
		listenFor: 'Sing the top note each time. That is the melody you are writing.'
	},
	{
		id: 'quartal',
		skillCode: 'L10b',
		title: 'Stack fourths instead of thirds',
		from: (k) => [I(k)],
		to: (k) => [parseChord(`${formatNote(k.tonic)}7sus4`)],
		explain: (k) =>
			`Everything you play is stacked in thirds. Build one from ${formatNote(k.tonic)} in fourths instead: up a fourth, up a fourth again. It belongs to no single chord, which is the point — one shape covers a whole modal area, and it does not tell the listener whether they are in major or minor.`,
		listenFor: 'Open and unresolved. It refuses to say which chord it is.'
	}
];

export function atomById(id: string): Atom | undefined {
	return ATOMS.find((a) => a.id === id);
}

/** Atoms belonging to a skill, in the order they should be met. */
export function atomsForSkill(skillCode: string): Atom[] {
	return ATOMS.filter((a) => a.skillCode === skillCode);
}

/**
 * Pick the atom for today.
 *
 * The first one belonging to the current skill that has not been seen yet;
 * failing that, the least recently seen of that skill's atoms, so revisiting is
 * a spiral rather than a stall. Returns nothing when the skill has no atoms —
 * plenty of skills are pure drill.
 */
export function chooseAtom(skillCode: string | null, seen: Set<string>): Atom | null {
	if (!skillCode) return null;
	const candidates = atomsForSkill(skillCode);
	if (candidates.length === 0) return null;
	return candidates.find((a) => !seen.has(a.id)) ?? candidates[0];
}

/**
 * The atom for today, with a floor under it.
 *
 * The current skill is asked first. But plenty of skills are pure drill and
 * carry no atoms at all, and mastery needs a transfer event — which cannot
 * happen until there is transfer detection to see one. Left alone, that
 * combination means the curriculum sits on L0 forever and block 4, the single
 * new idea that the whole session is built around, is empty every day.
 *
 * So when the current skill has nothing to teach, the lowest-level skill with
 * an unseen atom is used instead. Ordering never runs ahead of the graph — it
 * only refuses to run out of things to say.
 */
export function chooseAtomWithFallback(
	skillCode: string | null,
	seen: Set<string>,
	levelOf: (code: string) => number
): Atom | null {
	const preferred = chooseAtom(skillCode, seen);
	if (preferred) return preferred;

	const byLevel = [...ATOMS].sort((a, b) => levelOf(a.skillCode) - levelOf(b.skillCode));
	return byLevel.find((a) => !seen.has(a.id)) ?? byLevel[0] ?? null;
}

/** Render an atom against today's key. */
export function realiseAtom(atom: Atom, k: Key) {
	const from = atom.from(k);
	const to = atom.to(k);
	return {
		id: atom.id,
		title: atom.title,
		explanation: atom.explain(k),
		listenFor: atom.listenFor,
		keyCenter: formatKey(k),
		from,
		to,
		fromSymbols: from.map(name),
		toSymbols: to.map(name),
		fromPitchClasses: [...new Set(from.flatMap(chordPitchClasses))],
		toPitchClasses: [...new Set(to.flatMap(chordPitchClasses))]
	};
}

export type RealisedAtom = ReturnType<typeof realiseAtom>;
