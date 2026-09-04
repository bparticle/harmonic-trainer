import type { CardDirection } from '$lib/server/db/schema';
import type { CardPayload } from '$lib/curriculum/cards';
import { diatonicSeventh, diatonicTriad, formatChord } from '$lib/music/chord';
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
	/** How the answer is given. */
	answerWith: 'play' | 'name';
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
				answerWith: 'name',
				instruction: 'Listen. What is it?'
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
 */
export function nameNeighbours(correct: string, among: NameOption[], keyCenter?: string): string[] {
	const wanted = normalise(correct);
	const seen = new Set<string>([wanted]);
	const near: string[] = [];
	const far: string[] = [];

	for (const option of among) {
		const label = option.label;
		if (!label) continue;
		const key = normalise(label);
		if (seen.has(key)) continue;
		seen.add(key);
		if (keyCenter && option.keyCenter === keyCenter) near.push(label);
		else far.push(label);
	}

	return [...near, ...far];
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
