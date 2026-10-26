import { keySignature, parseKey, relativeKey, scale } from '$lib/music/key';
import { formatPitch, parseNote, pitchClass } from '$lib/music/note';
import { ivl, transpose } from '$lib/music/interval';

export const GAME_IDS = ['circle', 'signatures', 'chords', 'numerals', 'relatives'] as const;
export type GameId = (typeof GAME_IDS)[number];
export type RoundSpec = {
	game: GameId;
	mode: 'guided' | 'recall';
	level: 'starter' | 'explorer';
	direction: 'clockwise' | 'counterclockwise';
	seed: number;
};

export const GAMES: {
	id: GameId;
	name: string;
	subtitle: string;
	description: string;
	lesson: string[];
	controls: string;
}[] = [
	{
		id: 'circle',
		name: 'Circle navigator',
		subtitle: 'Find your way around all twelve keys.',
		description:
			'Leave C, connect every station, and find your way home. Turn the map over in your memory and travel the other way.',
		lesson: [
			'Clockwise, each new tonic is a perfect fifth up: C → G → D → A. That is seven semitones, counting every piano key.',
			'Counter-clockwise, go a perfect fourth up (five semitones), or a fifth down: C → F → B♭ → E♭.',
			'There are twelve pitch classes. F♯ and G♭ share a piano key; we change spelling halfway around to keep the map readable.'
		],
		controls: 'Play the next tonic in any octave, or use the note buttons. Start and finish on C.'
	},
	{
		id: 'signatures',
		name: 'Signature lock',
		subtitle: 'Crack the code of sharps and flats.',
		description:
			'Find the number, then assemble the accidentals that unlock the key. A major has three sharps — can you name them too?',
		lesson: [
			'C major has no sharps or flats. Each clockwise step adds a sharp: G has 1, D has 2, A has 3.',
			'Sharps arrive in this order: F♯ C♯ G♯ D♯ A♯ E♯ B♯. Flats arrive in reverse letter order: B♭ E♭ A♭ D♭ G♭ C♭ F♭.',
			'The last sharp is a semitone below the major tonic. With two or more flats, the second-to-last flat names the major key. F major is the one-flat exception.'
		],
		controls:
			'Tap the code. For a number question, the piano keys shown under the choices act as answer buttons.'
	},
	{
		id: 'chords',
		name: 'Chord workshop',
		subtitle: 'Build the recipe. Find the missing ingredient.',
		description:
			'Assemble a chord from interval tiles, then find one of its notes. Learn why a minor seventh and a major seventh feel different.',
		lesson: [
			'Chord formulas measure every interval from the root, not from the previous note. A major triad is 1 · 3 · 5; a minor triad is 1 · ♭3 · 5.',
			'A major third is 4 semitones above the root; a minor third is 3. A perfect fifth is 7; a diminished fifth is 6.',
			'Major seventh: 1 · 3 · 5 · 7. Dominant seventh: 1 · 3 · 5 · ♭7. Minor seventh: 1 · ♭3 · 5 · ♭7. The sevenths are 11 and 10 semitones above the root.'
		],
		controls:
			'Tap interval tiles to build a recipe. For a missing note, play that note on the piano in any octave.'
	},
	{
		id: 'numerals',
		name: 'Numeral signal',
		subtitle: 'Give every chord its place in the key.',
		description:
			'A chord name changes when you change keys. Its job can stay the same. Route each chord to its Roman-numeral platform.',
		lesson: [
			'Number the notes of a major scale 1 to 7. A chord built on its first note is I; on the second, ii; on the fifth, V.',
			'Major-key triads follow I · ii · iii · IV · V · vi · vii°. Capitals mean major, lowercase means minor, and ° means diminished.',
			'In C major, D minor is ii and G major is V. In G major, A minor is ii and D major is V. The number describes the root’s place in the scale.'
		],
		controls:
			'Choose a numeral. The white piano keys C D E F G A B select I through vii°; they are controller buttons here.'
	},
	{
		id: 'relatives',
		name: 'Relative connections',
		subtitle: 'Two homes. One set of notes.',
		description:
			'Connect major and minor keys that share a signature. Same notes, different centre of gravity.',
		lesson: [
			'A major key and its relative natural minor share all seven notes and the same key signature.',
			'The sixth note of a major scale starts its relative minor: C major → A minor. You can also move three semitones down from the major tonic.',
			'From a minor tonic, move three semitones up to find its relative major: A minor → C major. Parallel keys, such as C major and C minor, share a tonic instead.'
		],
		controls: 'Play the relative key’s tonic in any octave, or choose its note name.'
	}
];

export const CIRCLE = ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'];
export const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11];
export const WHITE_NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARPS = ['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'];
const FLATS = ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭', 'F♭'];
const STARTER_KEYS = ['C', 'G', 'D', 'A', 'F', 'B♭', 'E♭'];
const ALL_KEYS = [...STARTER_KEYS, 'E', 'B', 'F♯', 'C♯', 'A♭', 'D♭', 'G♭', 'C♭'];
export const NUMERALS = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];

export type Choice = { value: string; label: string; pianoPc?: number };
export type Question = {
	id: string;
	game: GameId;
	kind: 'pitch' | 'single' | 'multiple';
	headline: string;
	prompt: string;
	context: string;
	answer: string[];
	choices: Choice[];
	hint: string;
	explanation: string;
	tonic: number;
	/** Visible teaching material, hidden until requested in Recall. */
	reference: string[];
	circleStep?: number;
};

/** Stable decks can be replayed and graded on the server, and embedded in future daily tasks. */
function shuffled<T>(values: readonly T[], seed: number): T[] {
	let state = seed >>> 0;
	const random = () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 4294967296;
	};
	const out = [...values];
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

// The core parser accepts bb/##; its display formatter uses the double-accidental glyphs.
const readPitch = (name: string) => parseNote(name.replaceAll('𝄫', 'bb').replaceAll('𝄪', '##'));
export const pcOf = (name: string): number => pitchClass(readPitch(name));
export const labelOf = (name: string): string => formatPitch(readPitch(name), true);

function noteChoices(answer: string, flats = false): Choice[] {
	const names = flats
		? ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B']
		: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
	// Preserve theoretically meaningful spellings such as E♯ and C♭.
	names[pcOf(answer)] = labelOf(answer);
	return names.map((label, pc) => ({ value: String(pc), label, pianoPc: pc }));
}

export function circleRoute(direction: RoundSpec['direction']): string[] {
	return direction === 'clockwise'
		? [...CIRCLE, 'C']
		: ['C', 'F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'B', 'E', 'A', 'D', 'G', 'C'];
}

export function signatureNotes(key: string): string[] {
	const count = keySignature(parseKey(key));
	return (count >= 0 ? SHARPS : FLATS).slice(0, Math.abs(count));
}

const RECIPES = [
	{ name: 'major triad', suffix: '', formula: ['1', '3', '5'] },
	{ name: 'minor triad', suffix: 'm', formula: ['1', '♭3', '5'] },
	{ name: 'dominant seventh', suffix: '7', formula: ['1', '3', '5', '♭7'] },
	{ name: 'minor seventh', suffix: 'm7', formula: ['1', '♭3', '5', '♭7'] },
	{ name: 'major seventh', suffix: 'maj7', formula: ['1', '3', '5', '7'] },
	{ name: 'diminished triad', suffix: 'dim', formula: ['1', '♭3', '♭5'] },
	{ name: 'half-diminished seventh', suffix: 'm7♭5', formula: ['1', '♭3', '♭5', '♭7'] }
];
const INTERVALS: Record<string, { name: string; code: string }> = {
	'1': { name: 'root', code: 'P1' },
	'♭3': { name: 'minor third', code: 'm3' },
	'3': { name: 'major third', code: 'M3' },
	'4': { name: 'perfect fourth', code: 'P4' },
	'♭5': { name: 'diminished fifth', code: 'd5' },
	'5': { name: 'perfect fifth', code: 'P5' },
	'♭7': { name: 'minor seventh', code: 'm7' },
	'7': { name: 'major seventh', code: 'M7' }
};
const FORMULA_TILES = ['1', '♭3', '3', '4', '♭5', '5', '♭7', '7'];

export function makeDeck(spec: RoundSpec): Question[] {
	const keys = shuffled(spec.level === 'starter' ? STARTER_KEYS : ALL_KEYS, spec.seed);
	if (spec.game === 'circle') {
		const route = circleRoute(spec.direction);
		return route.map((note, i) => ({
			id: `circle:${spec.direction}:${i}`,
			game: 'circle',
			kind: 'pitch',
			headline: i === 0 ? 'Depart from C' : i === 12 ? 'Bring it home' : `From ${route[i - 1]}…`,
			prompt:
				i === 0
					? 'Play C to begin your journey.'
					: `Which tonic comes next ${spec.direction === 'clockwise' ? 'clockwise' : 'counter-clockwise'}?`,
			context:
				spec.direction === 'clockwise'
					? 'Perfect fifths · clockwise'
					: 'Perfect fourths · counter-clockwise',
			answer: [String(pcOf(note))],
			choices: noteChoices(note, spec.direction === 'counterclockwise' || i > 6),
			hint:
				i === 0
					? 'C is the white key just before a group of two black keys.'
					: `From ${route[i - 1]}, move up ${spec.direction === 'clockwise' ? '7' : '5'} semitones. Count moves, not the starting key.`,
			explanation:
				i === 0
					? 'C is home. Now start connecting the circle.'
				: i === 7
					? spec.direction === 'clockwise'
						? 'F♯ → C♯ is a perfect fifth up. We relabel C♯ as D♭ here: the same piano key, with a simpler signature for the rest of the journey.'
						: 'G♭ → C♭ is a perfect fourth up. We relabel C♭ as B here: the same piano key, with a simpler signature for the rest of the journey.'
					: `${route[i - 1]} → ${note}: ${spec.direction === 'clockwise' ? 'a fifth up (or a fourth down)' : 'a fourth up (or a fifth down)'}.`,
			tonic: pcOf(note),
			reference: route,
			circleStep: i
		}));
	}
	if (spec.game === 'signatures') {
		return keys.slice(0, 4).flatMap((key) => {
			const signed = keySignature(parseKey(key));
			const count = Math.abs(signed);
			const accidental = signed < 0 ? 'flats' : 'sharps';
			const notes = signatureNotes(key);
			const explanation = `${key} major has ${count === 0 ? 'no sharps or flats' : `${count} ${accidental}: ${notes.join(' · ')}`}.`;
			const base = {
				game: 'signatures' as const,
				headline: `${key} major`,
				context: 'Unlock the key signature',
				tonic: pcOf(key),
				reference: signed < 0 ? FLATS : SHARPS,
				explanation
			};
			return [
				{
					...base,
					id: `signature:${key}:count`,
					kind: 'single' as const,
					prompt: `How many ${accidental} are in this key signature?`,
					answer: [String(count)],
					choices: Array.from({ length: 8 }, (_, n) => ({
						value: String(n),
						label: String(n),
						pianoPc: n < 7 ? WHITE_PCS[n] : 1
					})),
					hint: 'C has zero. G, D, A, E, B, F♯, C♯ have 1–7 sharps. F, B♭, E♭, A♭, D♭, G♭, C♭ have 1–7 flats.'
				},
				{
					...base,
					id: `signature:${key}:notes`,
					kind: 'multiple' as const,
					prompt: `Select the ${accidental} in the signature, then unlock it. If there are none, leave it empty.`,
					answer: notes,
					choices: (signed < 0
						? [...FLATS].reverse()
						: ['C♯', 'D♯', 'E♯', 'F♯', 'G♯', 'A♯', 'B♯']
					).map((label) => ({ value: label, label })),
					hint: `Take the first ${count} from this order: ${(signed < 0 ? FLATS : SHARPS).join(' · ')}.`
				}
			];
		});
	}
	if (spec.game === 'chords') {
		const recipes = shuffled(
			spec.level === 'starter' ? RECIPES.slice(0, 4) : RECIPES,
			spec.seed + 11
		).slice(0, 4);
		return recipes.flatMap((recipe, i) => {
			const root = keys[i];
			const interval = recipe.formula[1 + ((spec.seed + i) % (recipe.formula.length - 1))];
			const detail = INTERVALS[interval];
			const note = formatPitch(transpose(parseNote(root), ivl(detail.code)), true);
			const notes = recipe.formula.map((part) =>
				formatPitch(transpose(parseNote(root), ivl(INTERVALS[part].code)), true)
			);
			return [
				{
					id: `chord:${root}:${recipe.suffix}:recipe`,
					game: 'chords' as const,
					kind: 'multiple' as const,
					headline: `${root}${recipe.suffix}`,
					context: recipe.name,
					prompt: 'Build this chord’s recipe. Select every interval measured from its root.',
					answer: recipe.formula,
					choices: FORMULA_TILES.map((label) => ({ value: label, label })),
					hint: `The recipe is ${recipe.formula.join(' · ')}. A ♭ lowers a major or perfect interval by one semitone.`,
					explanation: `${recipe.name}: ${recipe.formula.join(' · ')}. On ${root}, that spells ${notes.join(' · ')}.`,
					tonic: pcOf(root),
					reference: recipe.formula
				},
				{
					id: `chord:${root}:${recipe.suffix}:note`,
					game: 'chords' as const,
					kind: 'pitch' as const,
					headline: `${root}${recipe.suffix}`,
					context: `Find the ${detail.name}`,
					prompt: `Which note is the ${detail.name} (${interval}) above ${root}?`,
					answer: [String(pcOf(note))],
					choices: noteChoices(note, keySignature(parseKey(root)) < 0),
					hint: `Move ${ivl(detail.code).semitones} semitones up from ${root}. Every adjacent piano key is one semitone.`,
					explanation: `${root} → ${note} is a ${detail.name}: ${ivl(detail.code).semitones} semitones. In this chord, it is the ${interval}.`,
					tonic: pcOf(root),
					reference: notes
				}
			];
		});
	}
	if (spec.game === 'numerals') {
		const degrees = shuffled([0, 1, 2, 3, 4, 5, 6], spec.seed + 29);
		return degrees.map((degree, i) => {
			const key = keys[i % keys.length];
			const notes = scale(parseKey(key)).map((n) => formatPitch(n, true));
			const quality = [0, 3, 4].includes(degree) ? 'major' : degree === 6 ? 'diminished' : 'minor';
			return {
				id: `numeral:${key}:${degree}`,
				game: 'numerals',
				kind: 'single',
				headline: `${notes[degree]} ${quality}`,
				context: `In ${key} major`,
				prompt: 'Which Roman numeral belongs to this chord?',
				answer: [NUMERALS[degree]],
				choices: NUMERALS.map((label, j) => ({ value: label, label, pianoPc: WHITE_PCS[j] })),
				hint: `${key} major: ${notes.map((note, j) => `${j + 1} = ${note}`).join(' · ')}. Match the root, then its quality.`,
				explanation: `${notes[degree]} is scale degree ${degree + 1} in ${key} major. Its diatonic triad is ${quality}, so its numeral is ${NUMERALS[degree]}.`,
				tonic: pcOf(key),
				reference: notes.map((note, j) => `${NUMERALS[j]} ${note}`)
			};
		});
	}
	return keys.slice(0, 6).map((major, i) => {
		const majorKey = parseKey(major);
		const minor = formatPitch(relativeKey(majorKey).tonic, true);
		const reverse = i % 2 === 1;
		const source = reverse ? minor : major;
		const target = reverse ? major : minor;
		return {
			id: `relative:${major}:${reverse}`,
			game: 'relatives',
			kind: 'pitch',
			headline: `${source} ${reverse ? 'minor' : 'major'}`,
			context: 'Find the shared signature',
			prompt: `What is its relative ${reverse ? 'major' : 'minor'}? Play the tonic.`,
			answer: [String(pcOf(target))],
			choices: noteChoices(target, keySignature(majorKey) < 0),
			hint: reverse
				? `Move three semitones up from ${minor}.`
				: `Find the sixth note of ${major} major, or move three semitones down from ${major}.`,
			explanation: `${major} major and ${minor} natural minor share ${signatureNotes(major).length === 0 ? 'a signature with no sharps or flats' : signatureNotes(major).join(' · ')}. Their tonal centres are different.`,
			tonic: pcOf(source),
			reference: scale(majorKey).map((n) => formatPitch(n, true))
		};
	});
}

export function isCorrect(question: Question, values: string[]): boolean {
	return (
		new Set(values).size === values.length &&
		values.length === question.answer.length &&
		values.every((value) => question.answer.includes(value))
	);
}

/** Pitch answers use real note names; abstract answers explicitly use the piano as a controller. */
export function answerForMidi(question: Question, note: number): string | null {
	if (question.kind === 'multiple' || !Number.isInteger(note) || note < 0 || note > 127)
		return null;
	return question.choices.find((choice) => choice.pianoPc === note % 12)?.value ?? null;
}
