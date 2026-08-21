import type { CardDirection } from '$lib/server/db/schema';
import type { CardPayload } from '$lib/curriculum/cards';
import { formatKey, parseKey } from '$lib/music/key';

/**
 * Posing a card and marking the answer.
 *
 * Pure, so the marking can be tested without a keyboard: given what was asked
 * and what was played, was it right? Everything about *how* it is asked —
 * whether the answer is heard, seen or played — comes from the direction.
 */

export type Prompt = {
	direction: CardDirection;
	/** What the screen shows. Empty when the question is purely aural. */
	visible: string | null;
	/** Notes to play through the speakers, if any. */
	audible: number[] | null;
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
	const voicing = payload.answerVoicing ?? toVoicing(payload.answerPitchClasses, midiRoot);

	switch (direction) {
		case 'hear_name':
			return {
				direction,
				visible: null,
				audible: voicing,
				answerWith: 'name',
				instruction: 'Listen. What is it?'
			};
		case 'hear_play':
			return {
				direction,
				visible: null,
				audible: voicing,
				answerWith: 'play',
				instruction: 'Listen, then play it back.'
			};
		case 'see_play':
			return {
				direction,
				visible: payload.label,
				audible: null,
				answerWith: 'play',
				instruction: 'Play it.'
			};
		case 'play_name':
			return {
				direction,
				visible: payload.detail ?? payload.degree ?? payload.label,
				audible: null,
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
				answerWith: 'name',
				instruction: 'Play the chord that degree asks for, then name what you played.'
			};
		}
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
