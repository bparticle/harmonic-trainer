import type { CardDirection } from '$lib/server/db/schema';
import type { CardPayload } from '$lib/curriculum/cards';
import { diatonicSeventh, diatonicTriad, formatChord } from '$lib/music/chord';
import { parseNote, pitchClass } from '$lib/music/note';
import { SHAPES, type Shape } from '$lib/curriculum/vocabulary';
import { formatKey, key as makeKey, keyTonic, parseKey } from '$lib/music/key';

/**
 * Posing a card and marking the answer.
 *
 * Pure, so the marking can be tested without a keyboard: given what was asked
 * and what was played, was it right? Everything about *how* it is asked —
 * whether the answer is heard, seen or played — comes from the direction.
 */

/**
 * One chord of a passage, carrying everything the room needs of it.
 *
 * The voicing is what sounds and the pitch classes are what is marked — the
 * same split every other card keeps between `answerVoicing` and
 * `answerPitchClasses`. The symbol and the numeral come along because a passage
 * is answered in order, so the screen has to be able to say which chord you are
 * on, and what it was once the answer is out.
 */
export type PromptChord = {
	/** What the chord is called: `Dm7`. */
	symbol: string;
	/** What it does in the key: `ii7`. */
	numeral: string;
	pitchClasses: number[];
	voicing: number[];
};

export type Prompt = {
	direction: CardDirection;
	/** What the screen shows. Empty when the question is purely aural. */
	visible: string | null;
	/** Notes to play through the speakers together, if any. */
	audible: number[] | null;
	/**
	 * The chords of a passage, in the order they move.
	 *
	 * Set where the answer is a *movement* rather than a shape, and never set
	 * alongside `audible`: that field means "these notes, together", which is the
	 * one thing a progression must not be asked as. A passage is sounded one
	 * chord after another and marked one chord after another — see `markPassage`.
	 *
	 * Whether it is sounded at all follows the rule `visible` already states. A
	 * question with nothing written down is a question for the ear, so it is
	 * played; one that shows the numerals is read, and playing it would be
	 * handing over the answer.
	 *
	 * A field of this name existed before and meant something narrower — the
	 * chords a cadence question sounded before asking for a single note back —
	 * and went when those two questions did. It comes back as the whole shape of
	 * the answer rather than as a preamble to one.
	 */
	sequence: PromptChord[] | null;
	/**
	 * Notes to sound *before* the question, as a reference rather than as part of
	 * it.
	 *
	 * Only `hear_name` has one, and without it that question was unanswerable by
	 * anyone lacking perfect pitch. A chord sounded into silence and asked to be
	 * named is two questions — which root, and which quality — and the root half
	 * has no answer unless something has established where the key is. The ear
	 * queue crosses keys by design, so there was not even a stable context to
	 * count from across a run.
	 *
	 * This is the rule `degree_play` already keeps and says out loud: *a workout's
	 * function task crosses keys, so the key travels beside the numeral.* The ear
	 * task crosses keys for the same reason and said nothing at all. So the tonic
	 * arrives first and the question becomes a relative one, which is a thing that
	 * can actually be practised.
	 *
	 * Never marked, never part of the answer, and never on `hear_quality` — see
	 * that case in `pose` for why the quality question refuses one.
	 */
	anchor: number[] | null;
	/** How the answer is given. */
	answerWith: 'play' | 'name' | 'quality';
	/** One line telling you what to do. */
	instruction: string;
};

/**
 * Turn a card into a question.
 *
 * `keyCenter` is the only thing a card row knows that its payload does not, and
 * one direction needs it: a degree means nothing without the key it is a degree
 * of. It is passed rather than folded into the payload because the card row
 * already owns the key, and a fact stored twice is a fact that can disagree
 * with itself — the one exception being an item whose numerals belong to some
 * other key than the one it is filed under, which says so itself in `degreeOf`.
 * Every other direction ignores all of this, which is why it comes last.
 */
export function pose(
	direction: CardDirection,
	payload: CardPayload,
	midiRoot = 60,
	keyCenter?: string
): Prompt {
	const voicing =
		payload.kind === 'scale'
			? scaleVoicing(payload.answerPitchClasses, payload.answerVoicing?.[0], midiRoot)
			: (payload.answerVoicing ?? toVoicing(payload.answerPitchClasses, midiRoot));
	const passage = passageOf(payload);

	switch (direction) {
		case 'hear_name':
			return {
				direction,
				visible: null,
				audible: voicing,
				sequence: null,
				anchor: anchorFor(keyCenter),
				answerWith: 'name',
				instruction: 'Home first, then the chord. What is it?'
			};
		/*
		 * The other half of `hear_name`, and the half that should have come first.
		 *
		 * A chord sounds and the answer is what *kind* of chord it was — major,
		 * minor, diminished, and the four sevenths once the ladder has built them.
		 * No root, no symbol, no spelling. It is the only question in this app that
		 * is the same question in all twelve keys, which is exactly why it can be
		 * asked long before the one that is not.
		 *
		 * **No anchor, and that is the point rather than an omission.** `hear_name`
		 * needs a tonic because half of what it wants is a root, and a root has no
		 * name without somewhere to count from. A quality is not counted from
		 * anywhere: a minor seventh is a minor seventh played on any note by any
		 * instrument in any key, and sounding a tonic first would suggest the key
		 * bears on an answer it cannot bear on. The silence before it is the
		 * question saying so.
		 *
		 * The options are not built here. They are every shape the ladder has
		 * opened — three at `all-triads`, seven once the sevenths are up — which is
		 * a fact about the frontier and not about this card, so the room supplies
		 * them and `payload.shape` is only the answer. See `shapeChoices`.
		 */
		case 'hear_quality':
			return {
				direction,
				visible: null,
				audible: voicing,
				sequence: null,
				anchor: null,
				answerWith: 'quality',
				instruction: 'Listen. What kind of chord is that?'
			};
		/*
		 * Heard and played back — as one shape, or as a movement.
		 *
		 * A progression takes the second road, and until it did, this direction
		 * sounded `toVoicing` of every pitch class in the whole progression at
		 * once. The union of a ii–V–I is the whole major scale, so what arrived was
		 * a seven-note cluster and what was then demanded back was all seven of
		 * them together — which is not a chord, and not a hand.
		 */
		case 'hear_play':
			return {
				direction,
				visible: null,
				audible: passage ? null : voicing,
				sequence: passage,
				anchor: null,
				answerWith: 'play',
				instruction: passage
					? 'Listen, then play it back — one chord at a time.'
					: 'Listen, then play it back.'
			};
		/*
		 * Shown and played, which for a passage means shown as *numerals*.
		 *
		 * A progression's own name is its numerals — `ii7 – V7 – Imaj7` — so the
		 * function is what is written and the spelling is what is asked for, in
		 * order. That is the introduction a progression actually needs, and it is
		 * a different question from the same numerals one at a time.
		 */
		case 'see_play':
			return {
				direction,
				visible: payload.label,
				audible: null,
				sequence: passage,
				anchor: null,
				answerWith: 'play',
				instruction: passage ? 'Play it through, one chord at a time.' : 'Play it.'
			};
		/*
		 * Retired, and kept only for the rows that already carry it.
		 *
		 * Nothing generates `play_name` any more and no queue asks for it — see
		 * `directionsForRung`. A triad or a seventh has no `detail`, so this fell
		 * through to `payload.degree` and posed a bare numeral with no key beside
		 * it, which is `degree_play` with the half that makes it a question taken
		 * out. The case stays because the enum does and because a card left in
		 * somebody's bank must pose as something rather than throw.
		 */
		case 'play_name':
			return {
				direction,
				visible: payload.detail ?? payload.degree ?? payload.label,
				audible: null,
				sequence: null,
				anchor: null,
				answerWith: 'name',
				instruction: 'Play it, then name what you played.'
			};
		/*
		 * The number, and the key it is a number in.
		 *
		 * Two halves, both marked: `markPlayed` takes the notes as they arrive and
		 * `markNamed` closes it. `answerWith` names the half that *ends* the
		 * question, which is the naming — the same shape `play_name` already has,
		 * and the half that closes the loop between a function and a symbol.
		 *
		 * The key is in the prompt rather than in the surroundings because a
		 * workout's function task crosses keys by design. A block that never left
		 * today's key could leave it unsaid; eight questions in eight keys cannot.
		 */
		case 'degree_play': {
			const degree = payload.degree ?? payload.label;
			// The item's own key wins where it has one: the relative minor's triads
			// live on the C stage but their numerals are numerals of A minor, and
			// "i — C" would be a wrong question with a right answer behind it.
			// Spelled the way the rest of the app spells a key on screen, because
			// `Eb` is how a database writes it and not how a musician reads it.
			const home = payload.degreeOf ?? keyCenter;
			const key = home ? formatKey(parseKey(home), true) : null;
			return {
				direction,
				visible: key ? `${degree} — ${key}` : degree,
				audible: null,
				sequence: null,
				anchor: null,
				answerWith: 'name',
				instruction: 'Play the chord that degree asks for, then name what you played.'
			};
		}
		/*
		 * One chord, named by what it does in two keys at once.
		 *
		 * The only crossing question with something written down, and what is
		 * written is two numerals rather than a chord: `vi7 in C · ii7 in G`.
		 * Realising they point at the same place under the hands is the whole of
		 * what a pivot modulation is. Nothing is sounded — this one is a question
		 * for the hands, not the ear.
		 */
		case 'pivot_play':
			return {
				direction,
				visible: payload.detail ?? payload.label,
				audible: null,
				sequence: null,
				anchor: null,
				answerWith: 'play',
				instruction: 'One chord, two jobs. Play it.'
			};
	}
}

/**
 * Every note a card is made of, whether or not the question sounds it.
 *
 * `pose` decides what is *heard* and what is *written down*, and those are
 * deliberately different per direction — a scale asked as `see_play` prints its
 * name and plays nothing. Anything sizing a drawing of the material needs the
 * material itself, and reading it off the prompt meant a silent question
 * reported no notes at all: the keyboard fell back to its old hard-coded C3–E5
 * window and every scale above it climbed off the right-hand edge again, this
 * time only in the half of the directions that stay quiet.
 *
 * So this answers *what is this card about* rather than what this question
 * shows, out of the same two helpers `pose` builds its voicing from, so the two
 * cannot disagree about the octave.
 */
export function materialOf(payload: CardPayload, midiRoot = 60): number[] {
	const passage = passageOf(payload);
	if (passage) return passage.flatMap((chord) => chord.voicing);
	if (payload.kind === 'scale')
		return scaleVoicing(payload.answerPitchClasses, payload.answerVoicing?.[0], midiRoot);
	return payload.answerVoicing ?? toVoicing(payload.answerPitchClasses, midiRoot);
}

/**
 * The chords a card is a passage of, or nothing.
 *
 * Read off `payload.steps`, which progression cards have carried since the day
 * they were first generated — the material was always there, and only the two
 * functions that pose and mark it were looking at the union instead.
 *
 * Null for a progression whose payload has no steps. Cards are written once and
 * never rewritten, so a row from before the steps were stored falls back to the
 * old single-cluster question: a poor question rather than a crash, which is the
 * right failure for a row that predates the shape.
 */
function passageOf(payload: CardPayload): PromptChord[] | null {
	if (payload.kind !== 'progression') return null;
	const steps = payload.steps;
	if (!steps?.length) return null;
	return steps.map((step) => ({
		symbol: step.symbol,
		numeral: step.numeral,
		pitchClasses: step.pitchClasses,
		voicing: step.voicing
	}));
}

/**
 * A scale is heard as one uninterrupted octave, including the tonic it arrives
 * on. Rebuilding it here also repairs cards saved before scale voicings kept
 * their octave carries; their first note is still the intended tonic and range.
 */
function scaleVoicing(
	pitchClasses: number[],
	storedRoot: number | undefined,
	from: number
): number[] {
	if (pitchClasses.length === 0) return [];
	const root = storedRoot ?? toVoicing([pitchClasses[0]], from)[0];
	const degrees = toVoicing(pitchClasses, root);
	return [...degrees, root + 12];
}

/**
 * One low note — the tonic of the key — as a place to hear the question from.
 *
 * **A note and not the tonic triad, and that is the whole of what makes it a
 * reference rather than a give-away.** A triad was the obvious thing to sound
 * and it is wrong for one card in seven: on the I chord the anchor *is* the
 * answer. Walking a real morning printed it plainly — home came out as C–E–G
 * and the chord to be named came out as C–E–G an octave up, so "listen, then
 * name it" was answered by noticing the two were the same. One note cannot do
 * that. You still have to hear that the thing above it is a major triad built
 * on that note, which is the question.
 *
 * It also removes the branch the relative minor would otherwise need. A single
 * pitch has no mode, so C is where A minor is counted from without anything
 * having to decide whether home is major or minor.
 *
 * A fixed low register rather than one derived from the chord. Both were tried:
 * hanging it an octave under whatever the card happened to sound put the same
 * key's tonic at C2 on one question and C3 on the next, because the stored
 * voicings sit where `closeVoicing(chord, 3)` put them. Home should be the same
 * note every time it is played, and octave 2 is below every voicing this app
 * builds, so it never blurs into the chord it is introducing.
 *
 * A key that cannot be parsed gives nothing rather than a guess, and a question
 * with no anchor is the question exactly as it was before this existed.
 */
const ANCHOR_FROM = 36;

function anchorFor(keyCenter: string | undefined): number[] | null {
	if (!keyCenter) return null;
	try {
		return toVoicing([pitchClass(parseNote(keyTonic(keyCenter)))], ANCHOR_FROM);
	} catch {
		return null;
	}
}

/** Spread pitch classes into a playable voicing above a root. */
export function toVoicing(pitchClasses: number[], from = 60): number[] {
	const out: number[] = [];
	let previous = from - 1;
	for (const pc of pitchClasses) {
		let note = from + ((((pc - (from % 12)) % 12) + 12) % 12);
		while (note <= previous) note += 12;
		previous = note;
		out.push(note);
	}
	return out;
}

export type Marking = {
	correct: boolean;
	/** Notes that should have been there and were not. */
	missing: number[];
	/** Notes played that do not belong. */
	extra: number[];
};

/** One chord of a passage marked, and how far through it that leaves you. */
export type PassageMarking = Marking & {
	/** How many chords are behind you now. */
	done: number;
	/** Whether the last one has landed. */
	complete: boolean;
};

/**
 * Mark a played answer.
 *
 * Compared as pitch classes, not as notes: playing the right chord an octave
 * out, or with the fifth doubled, is right. Which octave you chose is a
 * question about voicing, and the voicing drills ask it separately.
 */
export function markPlayed(expected: number[], played: number[]): Marking {
	const want = new Set(expected.map((n) => ((n % 12) + 12) % 12));
	const got = new Set(played.map((n) => ((n % 12) + 12) % 12));

	const missing = [...want].filter((pc) => !got.has(pc)).sort((a, b) => a - b);
	const extra = [...got].filter((pc) => !want.has(pc)).sort((a, b) => a - b);

	return { correct: missing.length === 0 && extra.length === 0, missing, extra };
}

/**
 * Mark something played a note at a time rather than all at once.
 *
 * A scale is not a chord. Comparing it as one demanded seven simultaneous
 * notes, which is unplayable — and reported "missing 4" at anything a person
 * could actually do. Notes are gathered as they arrive and the answer is
 * complete when every one has been played, in any order, in any octave.
 */
export function markGathered(expected: number[], gathered: number[]): Marking {
	const want = [...new Set(expected.map((n) => ((n % 12) + 12) % 12))];
	const got = new Set(gathered.map((n) => ((n % 12) + 12) % 12));

	const missing = want.filter((pc) => !got.has(pc));
	// Extra notes are not an error here: passing notes and repeats are how
	// scales are actually played.
	return { correct: missing.length === 0, missing, extra: [] };
}

/**
 * Mark a passage a chord at a time.
 *
 * The correction `markGathered` made for scales, one level up. A scale is not a
 * chord; a progression is not one either, and comparing it as one asked for the
 * union of every chord in it simultaneously — for a ii–V–I that is every note of
 * the key at once, which is not a hand shape and not the exercise.
 *
 * The unit here is the chord, so each is marked as a simultaneity by
 * `markPlayed`: a chord *is* notes held together, and a note that does not
 * belong in one is an error in a way a passing note in a scale is not. What
 * changes is only which chord is being asked for. A right one moves you on; a
 * wrong one leaves you exactly where you were rather than sending you back to
 * the top, because the movement between chords is the thing being practised and
 * you cannot practise a movement by restarting it every time a finger misses.
 */
export function markPassage(passage: number[][], done: number, played: number[]): PassageMarking {
	const chord = passage[done];
	if (!chord) return { correct: true, missing: [], extra: [], done, complete: true };

	const marking = markPlayed(chord, played);
	const next = marking.correct ? done + 1 : done;
	return { ...marking, done: next, complete: next >= passage.length };
}

/**
 * Mark a named answer against a set of acceptable spellings.
 *
 * Forgiving about how it is written — `Cmaj7`, `CM7` and `C∆` are the same
 * answer — because this is testing whether you know the chord, not whether you
 * type it the way the database does.
 */
export function markNamed(expected: string, given: string): boolean {
	return normalise(expected) === normalise(given);
}

function normalise(symbol: string): string {
	return (
		symbol
			.trim()
			.replace(/♭/g, 'b')
			.replace(/♯/g, '#')
			// These glyphs carry their own seventh, so a trailing 7 is absorbed
			// rather than appended — otherwise Bø7 expands to Bm7b5-7.
			.replace(/∆7|Δ7/g, 'maj7')
			.replace(/(∆|Δ)(?=\d)/g, 'maj')
			.replace(/∆|Δ/g, 'maj7')
			.replace(/ø7?/g, 'm7b5')
			.replace(/°/g, 'dim')
			.replace(/\s+/g, '')
			.replace(/^([A-Ga-g][b#]?)M(?![a-z])/, '$1maj')
			.replace(/^([A-Ga-g][b#]?)-/, '$1m')
			.toLowerCase()
	);
}

/** A card the neighbour search may draw a wrong answer from. */
export type NameOption = { label?: string; kind?: string; keyCenter?: string };

/**
 * The seven chords of a key, as names, for when the card bank cannot fill four
 * buttons on its own.
 *
 * It often cannot, and the case it fails in is the worst one: an account two
 * rungs up owns exactly one triad, so a naming question drawn only from the
 * material would offer a single button — which is the button that graded itself
 * correct, wearing a different hat. The key a chord came from always has six
 * more chords in it, they are the things it is genuinely confused with, and they
 * can be derived rather than waited for.
 *
 * An unknown key gives nothing rather than a guess. A question with three
 * choices is worse than one with four and far better than one with a wrong
 * answer in it.
 */
export function diatonicNames(keyCenter: string, kind: string | undefined): NameOption[] {
	if (kind !== 'triad' && kind !== 'seventh') return [];

	let key;
	try {
		key = makeKey(keyTonic(keyCenter));
	} catch {
		return [];
	}

	const build = kind === 'triad' ? diatonicTriad : diatonicSeventh;
	return [1, 2, 3, 4, 5, 6, 7].map((degree) => ({
		label: formatChord(build(key, degree)),
		kind,
		keyCenter
	}));
}

/**
 * Wrong answers worth offering, nearest first.
 *
 * Drawn from the material the workout is actually made of rather than invented,
 * which is what makes them confusable: the other six triads of the key you are
 * in are the things a C major might be mistaken for, and a list of four
 * unrelated chords tests nothing but reading.
 *
 * Same kind first and same key first, because those are the two axes a mistake
 * runs along — a triad is mistaken for a triad, and a chord in this key for
 * another chord in this key. Anything of the same kind from elsewhere follows,
 * so a task spread across keys still fills four buttons.
 *
 * **Same root goes in front of both, and that is a fault being fixed.** A chord
 * symbol carries two facts and this question asks for both, but every wrong
 * answer it used to offer differed in the *root*: on the sevenths rung the
 * buttons beside `G7` were `Dm7`, `Em7` and `Cmaj7`, and beside `Bm7b5` they
 * were `Cmaj7`, `Em7` and `Dm7`. G is the only G on that rung and B is the only
 * B, so **the two most distinctive sounds in the key — the dominant and the
 * half-diminished — were the two you could get right without listening at
 * all.** Read the letter, press the letter.
 *
 * A same-root option makes the quality the thing that separates them: `G7`
 * against `Gmaj7` and `Gm7`, `Bm7b5` against `Bm7`. These are not invented —
 * they are drawn from the bank like every other neighbour, and they appear as
 * soon as the frontier is two keys wide, because `Gm7` is the ii of F and `C7`
 * is the V of F. On an account one key wide there are none and the ordering
 * falls through to what it always was.
 */
export function nameNeighbours(correct: string, among: NameOption[], keyCenter?: string): string[] {
	const wanted = normalise(correct);
	const root = rootOf(correct);
	const seen = new Set<string>([wanted]);
	const sameRoot: string[] = [];
	const near: string[] = [];
	const far: string[] = [];

	for (const option of among) {
		const label = option.label;
		if (!label) continue;
		const key = normalise(label);
		if (seen.has(key)) continue;
		seen.add(key);
		if (root && rootOf(label) === root) sameRoot.push(label);
		else if (keyCenter && option.keyCenter === keyCenter) near.push(label);
		else far.push(label);
	}

	return [...sameRoot, ...near, ...far];
}

/**
 * The note a chord symbol is built on, spelled as `normalise` spells things.
 *
 * Read off the normalised symbol so that `B♭m7` and `Bbm7` come back as the
 * same root, and so a trailing accidental in the *quality* cannot be mistaken
 * for one in the root: `Cm7b5` normalises to `cm7b5`, where the character after
 * the letter is `m` and the root is therefore `c`.
 */
function rootOf(symbol: string): string | null {
	return normalise(symbol).match(/^[a-g][b#]?/)?.[0] ?? null;
}

/**
 * The buttons for a quality question: every shape the ladder has opened.
 *
 * **Not a sample of four, and this is the one place this app does not sample.**
 * `choicesFor` takes three wrong answers out of a bank of hundreds because a
 * naming question cannot show you every chord in every key. The shapes are a
 * closed vocabulary of seven, and the whole of what `hear_quality` teaches is
 * that vocabulary — so the row is the same row every time, in the same order,
 * and you come to know it the way you know the names of the fingers. A row that
 * reshuffled its contents each question would be teaching you to read the
 * buttons instead of to hear the chord.
 *
 * It also means the question gets honestly harder as the ladder opens: three
 * buttons at `all-triads`, seven once the sevenths are up. Nothing sets that —
 * it falls out of what has been opened, which is the only rule the frontier has.
 *
 * The correct answer is folded in whether or not the vocabulary claims it, so a
 * card can never be posed with its own answer missing from the row. That cannot
 * happen from `ensureLadderCards` — a card exists because its rung is open, and
 * an open rung is in the vocabulary — but a question you cannot answer is bad
 * enough to be worth one `Set` insertion to make impossible.
 */
export function shapeChoices(correct: Shape, open: Iterable<Shape>): Shape[] {
	const offered = new Set<Shape>([...open, correct]);
	return SHAPES.filter((shape) => shape !== 'unknown' && offered.has(shape));
}

/** Mark a chosen quality. Exact, because the buttons emit the shapes themselves. */
export function markShape(expected: Shape | undefined, given: Shape): boolean {
	return expected === given;
}

/**
 * Multiple-choice options for a naming question, when there is no keyboard to
 * answer on.
 *
 * The wrong answers are drawn from chords a note or two away rather than at
 * random, because guessing between four unrelated chords tests nothing.
 */
export function choicesFor(correct: string, neighbours: string[], count = 4): string[] {
	const wrong = neighbours.filter((n) => normalise(n) !== normalise(correct)).slice(0, count - 1);
	const options = [correct, ...wrong];

	// Deterministic shuffle keyed on the answer, so the right one is not always
	// in the same place but resuming a session shows the same layout.
	const seed = [...correct].reduce((total, ch) => total + ch.charCodeAt(0), 0);
	return options
		.map((option, i) => ({ option, order: (seed * (i + 7)) % 101 }))
		.sort((a, b) => a.order - b.order)
		.map((entry) => entry.option);
}
