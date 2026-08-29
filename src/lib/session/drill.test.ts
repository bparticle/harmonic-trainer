import { describe, expect, it } from 'vitest';
import type { CardPayload } from '$lib/curriculum/cards';
import { STAGES, itemsForRung } from '$lib/curriculum/ladder';
import { cardsForKeyCentre, cardsForKeyMoved, cardsForPivots } from '$lib/curriculum/cards';
import {
	choicesFor,
	diatonicNames,
	markGathered,
	markNamed,
	markPlayed,
	nameNeighbours,
	pose,
	toVoicing
} from './drill';

const cmaj7: CardPayload = {
	kind: 'chord',
	label: 'Cmaj7',
	answerPitchClasses: [0, 4, 7, 11],
	answerVoicing: [48, 52, 55, 59],
	degree: 'I'
};

describe('posing a question', () => {
	it('says nothing on screen when the question is aural', () => {
		for (const direction of ['hear_name', 'hear_play'] as const) {
			const prompt = pose(direction, cmaj7);
			expect(prompt.visible, direction).toBeNull();
			expect(prompt.audible, direction).toEqual([48, 52, 55, 59]);
		}
	});

	it('shows the chord and stays silent when the answer is to play it', () => {
		const prompt = pose('see_play', cmaj7);
		expect(prompt.visible).toBe('Cmaj7');
		expect(prompt.audible).toBeNull();
		expect(prompt.answerWith).toBe('play');
	});

	it('asks for a name when naming is the point', () => {
		expect(pose('hear_name', cmaj7).answerWith).toBe('name');
		expect(pose('play_name', cmaj7).answerWith).toBe('name');
	});

	it('never leaves you without an instruction', () => {
		for (const direction of [
			'hear_name',
			'hear_play',
			'see_play',
			'play_name',
			'degree_play'
		] as const) {
			expect(pose(direction, cmaj7).instruction.length, direction).toBeGreaterThan(5);
		}
	});

	it('asks for a degree by its numeral rather than by its symbol', () => {
		const prompt = pose('degree_play', cmaj7, 60, 'C');
		expect(prompt.visible).toBe('I — C');
		expect(prompt.visible).not.toContain('Cmaj7');
		expect(prompt.audible).toBeNull();
	});

	it('carries the key in the degree question, because a numeral alone is not one', () => {
		const four: CardPayload = {
			kind: 'triad',
			label: 'Ab',
			answerPitchClasses: [8, 0, 3],
			degree: 'IV'
		};
		expect(pose('degree_play', four, 60, 'Eb').visible).toBe('IV — E♭');
	});

	it('counts a relative minor’s numerals from the minor, not from the stage it is filed under', () => {
		// The A minor triads are stored on the C stage, so the card's own key says
		// C and the numeral means A minor. "i — C" would be a wrong question with
		// the right answer sitting behind it.
		const [, tonic] = itemsForRung('relative-minor', STAGES[0]);
		const prompt = pose('degree_play', { ...tonic, degree: tonic.degree! }, 60, 'C');
		expect(prompt.visible).toBe('i — Am');
	});

	it('ends the degree question on the name, the way play-then-name always has', () => {
		expect(pose('degree_play', cmaj7, 60, 'C').answerWith).toBe('name');
		expect(pose('degree_play', cmaj7, 60, 'C').instruction).toContain('name');
	});

	it('builds a voicing when the card does not carry one', () => {
		const bare: CardPayload = { kind: 'chord', label: 'Dm', answerPitchClasses: [2, 5, 9] };
		const prompt = pose('hear_play', bare);
		expect(prompt.audible).toHaveLength(3);
		expect(prompt.audible!.every((n) => n >= 60 && n < 84)).toBe(true);
	});

	it('plays a scale continuously through the tonic in the next octave', () => {
		const scale: CardPayload = {
			kind: 'scale',
			label: 'D scale',
			answerPitchClasses: [2, 4, 6, 7, 9, 11, 1],
			answerVoicing: [62, 64, 66, 67, 69, 71, 61]
		};
		expect(pose('hear_play', scale).audible).toEqual([62, 64, 66, 67, 69, 71, 73, 74]);
	});
});

describe('asking where we are', () => {
	const [card] = cardsForKeyCentre('Eb');
	const prompt = pose('key_hear', card.payload, 60, 'Eb');

	/*
	 * The whole exercise, asserted. Every other direction hands the key over in
	 * the prompt; this one must not, because naming it is the question. A single
	 * leak here — the label, the key, the tonic's name anywhere on screen —
	 * turns a listening test into a reading test.
	 */
	it('writes nothing down at all', () => {
		expect(prompt.visible).toBeNull();
	});

	it('sounds the cadence rather than a chord', () => {
		expect(prompt.audible).toBeNull();
		expect(prompt.sequence).toHaveLength(3);
		for (const chord of prompt.sequence ?? []) expect(chord).toHaveLength(3);
	});

	it('is answered by playing, and the answer is one note', () => {
		expect(prompt.answerWith).toBe('play');
		expect(card.payload.answerPitchClasses).toHaveLength(1);
	});

	it('accepts the tonic in any octave and refuses a second note', () => {
		const tonic = card.payload.answerPitchClasses;
		expect(markPlayed(tonic, [51]).correct).toBe(true);
		expect(markPlayed(tonic, [63]).correct).toBe(true);
		expect(markPlayed(tonic, [51, 55]).correct).toBe(false);
		expect(markPlayed(tonic, [52]).correct).toBe(false);
	});

	it('falls back to sounding the tonic when a stored card has lost its steps', () => {
		const stripped = { ...card.payload, steps: undefined };
		const fallback = pose('key_hear', stripped, 60, 'Eb');
		expect(fallback.sequence).toBeNull();
		expect(fallback.audible).not.toBeNull();
	});

	/*
	 * The leak this exercise has to be guarded against, asserted at the one place
	 * a test can see it. The page had a second way to say the key — a header line
	 * naming the card's key and skill, added for the other drills — and it printed
	 * "G · where are we?" above a cadence in G. That one is guarded in the page;
	 * this guards the prompt itself, which is where anybody adding a seventh
	 * direction will look.
	 */
	it('puts the key nowhere a reader could find it', () => {
		const written = [prompt.visible, prompt.instruction].filter(Boolean).join(' ');
		for (const spelling of ['Eb', 'E♭', 'E-flat']) {
			expect(written, spelling).not.toContain(spelling);
		}
		expect(written).not.toContain(card.payload.label);
	});

	it('gives every direction a sequence field, so the page never guesses', () => {
		for (const direction of ['hear_name', 'hear_play', 'see_play', 'play_name'] as const) {
			expect(pose(direction, cmaj7).sequence, direction).toBeNull();
		}
	});
});

describe('asking what changed', () => {
	const [, dominant] = cardsForKeyMoved('C');
	const prompt = pose('key_moved', dominant.payload, 60, 'C');

	it('writes nothing down, exactly as the key question does not', () => {
		expect(prompt.visible).toBeNull();
		const written = [prompt.visible, prompt.instruction].filter(Boolean).join(' ');
		expect(written).not.toContain('G');
		expect(written).not.toContain('dominant');
	});

	it('sounds six chords: one cadence, then another somewhere else', () => {
		expect(prompt.sequence).toHaveLength(6);
	});

	it('is answered by playing where it landed', () => {
		expect(prompt.answerWith).toBe('play');
		expect(markPlayed(dominant.payload.answerPitchClasses, [67]).correct).toBe(true);
		// The key it left is the obvious wrong answer, so it has to be wrong.
		expect(markPlayed(dominant.payload.answerPitchClasses, [60]).correct).toBe(false);
	});
});

describe('turning the corner', () => {
	const pivot = cardsForPivots('C').find((card) => card.identity.includes('|G|'))!;
	const prompt = pose('pivot_play', pivot.payload, 60, 'C');

	/*
	 * The one crossing question with something written down — and what is written
	 * is two numerals rather than a chord, because the realisation that they point
	 * at the same place is the exercise.
	 */
	it('shows the two functions and withholds the chord', () => {
		expect(prompt.visible).toBe('Imaj7 in C · IVmaj7 in G');
		expect(prompt.visible).not.toContain('Cmaj7');
	});

	it('sounds nothing: this one is for the hands', () => {
		expect(prompt.audible).toBeNull();
		expect(prompt.sequence).toBeNull();
	});

	it('is answered by playing the chord both numerals name', () => {
		expect(prompt.answerWith).toBe('play');
		expect(markPlayed(pivot.payload.answerPitchClasses, [60, 64, 67, 71]).correct).toBe(true);
		expect(markPlayed(pivot.payload.answerPitchClasses, [60, 64, 67]).correct).toBe(false);
	});
});

describe('spreading pitch classes into a voicing', () => {
	it('ascends', () => {
		const voicing = toVoicing([0, 4, 7, 11], 60);
		expect(voicing).toEqual([60, 64, 67, 71]);
		expect([...voicing].sort((a, b) => a - b)).toEqual(voicing);
	});

	it('wraps upward rather than descending', () => {
		const voicing = toVoicing([7, 11, 2, 5], 60);
		expect([...voicing].sort((a, b) => a - b)).toEqual(voicing);
	});

	it('keeps the pitch classes it was given', () => {
		const pcs = [2, 5, 9, 0];
		expect(toVoicing(pcs, 55).map((n) => n % 12)).toEqual(pcs);
	});
});

describe('marking a played answer', () => {
	it('accepts the right notes', () => {
		expect(markPlayed([60, 64, 67, 71], [60, 64, 67, 71]).correct).toBe(true);
	});

	it('accepts the right chord in another octave', () => {
		// Which octave you chose is a voicing question, asked separately.
		expect(markPlayed([60, 64, 67, 71], [48, 52, 55, 59]).correct).toBe(true);
	});

	it('accepts a doubled note', () => {
		expect(markPlayed([60, 64, 67], [60, 64, 67, 72]).correct).toBe(true);
	});

	it('accepts any inversion', () => {
		expect(markPlayed([60, 64, 67, 71], [64, 67, 71, 72]).correct).toBe(true);
	});

	it('reports what was missing', () => {
		const marking = markPlayed([60, 64, 67, 71], [60, 64, 67]);
		expect(marking.correct).toBe(false);
		expect(marking.missing).toEqual([11]);
		expect(marking.extra).toEqual([]);
	});

	it('reports what was extra', () => {
		const marking = markPlayed([60, 64, 67], [60, 64, 67, 70]);
		expect(marking.correct).toBe(false);
		expect(marking.extra).toEqual([10]);
	});

	it('fails an empty answer', () => {
		expect(markPlayed([60, 64, 67], []).correct).toBe(false);
	});
});

describe('marking something played over time', () => {
	const C_MAJOR = [0, 2, 4, 5, 7, 9, 11];

	it('accepts a scale played one note at a time', () => {
		// The bug this exists to prevent: comparing a scale as a chord demanded
		// all seven notes simultaneously, which nobody can play.
		expect(markGathered(C_MAJOR, [60, 62, 64, 65, 67, 69, 71]).correct).toBe(true);
	});

	it('accepts it in any octave and any order', () => {
		expect(markGathered(C_MAJOR, [71, 48, 62, 76, 65, 57, 55]).correct).toBe(true);
	});

	it('reports which notes are still needed, by pitch class', () => {
		const marking = markGathered(C_MAJOR, [60, 64, 67]);
		expect(marking.correct).toBe(false);
		expect(marking.missing).toEqual([2, 5, 9, 11]);
	});

	it('forgives repeats and passing notes', () => {
		// Scales get played with repeats and stray notes; that is not an error.
		const marking = markGathered(C_MAJOR, [60, 60, 62, 63, 64, 65, 67, 69, 71]);
		expect(marking.correct).toBe(true);
		expect(marking.extra).toEqual([]);
	});

	it('is not satisfied by nothing', () => {
		expect(markGathered(C_MAJOR, []).correct).toBe(false);
		expect(markGathered(C_MAJOR, []).missing).toHaveLength(7);
	});

	it('completes as the last note arrives', () => {
		let gathered: number[] = [];
		const order = [60, 62, 64, 65, 67, 69, 71];
		const results = order.map((note) => {
			gathered = [...gathered, note];
			return markGathered(C_MAJOR, gathered).correct;
		});
		expect(results).toEqual([false, false, false, false, false, false, true]);
	});
});

describe('marking a named answer', () => {
	it('accepts the several ways of writing one chord', () => {
		for (const given of ['Cmaj7', 'CM7', 'C∆', 'cmaj7', ' Cmaj7 ']) {
			expect(markNamed('Cmaj7', given), given).toBe(true);
		}
	});

	it('accepts unicode accidentals', () => {
		expect(markNamed('Ebm7', 'E♭m7')).toBe(true);
		expect(markNamed('F#7', 'F♯7')).toBe(true);
	});

	it('accepts the half-diminished and diminished glyphs', () => {
		// ø carries its own seventh, so both spellings mean the same chord.
		expect(markNamed('Bm7b5', 'Bø7')).toBe(true);
		expect(markNamed('Bm7b5', 'Bø')).toBe(true);
		expect(markNamed('Bdim', 'B°')).toBe(true);
		expect(markNamed('Bdim7', 'B°7')).toBe(true);
	});

	it('handles an extension written after the triangle', () => {
		expect(markNamed('Cmaj9', 'C∆9')).toBe(true);
		expect(markNamed('Cmaj7', 'C∆7')).toBe(true);
	});

	it('accepts a dash for minor', () => {
		expect(markNamed('Dm7', 'D-7')).toBe(true);
	});

	it('rejects a different chord', () => {
		expect(markNamed('Cmaj7', 'C7')).toBe(false);
		expect(markNamed('Cmaj7', 'Cm7')).toBe(false);
		expect(markNamed('Cmaj7', 'Dmaj7')).toBe(false);
	});
});

describe('multiple choice', () => {
	const neighbours = ['Am7', 'C6', 'Em7', 'Cmaj9', 'Fmaj7'];

	it('always includes the right answer', () => {
		expect(choicesFor('Cmaj7', neighbours)).toContain('Cmaj7');
	});

	it('offers the requested number of options', () => {
		expect(choicesFor('Cmaj7', neighbours, 4)).toHaveLength(4);
		expect(choicesFor('Cmaj7', neighbours, 3)).toHaveLength(3);
	});

	it('draws the wrong answers from nearby chords, not at random', () => {
		// Guessing between four unrelated chords tests nothing.
		const options = choicesFor('Cmaj7', neighbours);
		for (const option of options) {
			if (option !== 'Cmaj7') expect(neighbours).toContain(option);
		}
	});

	it('never offers the same chord twice', () => {
		const options = choicesFor('Cmaj7', ['Cmaj7', 'C∆', 'Am7', 'Em7']);
		expect(new Set(options).size).toBe(options.length);
	});

	it('is stable, so resuming shows the same layout', () => {
		expect(choicesFor('Cmaj7', neighbours)).toEqual(choicesFor('Cmaj7', neighbours));
	});

	it('does not always put the answer first', () => {
		const positions = new Set(
			['Cmaj7', 'Dm7', 'G7', 'Am7', 'Fmaj7'].map((answer) =>
				choicesFor(answer, neighbours).indexOf(answer)
			)
		);
		expect(positions.size).toBeGreaterThan(1);
	});
});

describe('the wrong answers a naming question offers', () => {
	/*
	 * There were none. `hear_name` and the naming half of a degree had no control
	 * but "Reveal the name", which recorded a correct answer for being pressed —
	 * so the app's one number, the accuracy on the end screen, was partly a count
	 * of button presses. Four buttons is the smallest honest replacement, and they
	 * are only worth anything if the three wrong ones are confusable.
	 */
	const among = [
		{ label: 'Dm', kind: 'triad', keyCenter: 'C' },
		{ label: 'Em', kind: 'triad', keyCenter: 'C' },
		{ label: 'F', kind: 'triad', keyCenter: 'C' },
		{ label: 'D', kind: 'triad', keyCenter: 'G' },
		{ label: 'C', kind: 'triad', keyCenter: 'C' }
	];

	it('never offers the answer as one of the wrong ones', () => {
		expect(nameNeighbours('C', among, 'C')).not.toContain('C');
	});

	it('prefers chords from the key the question is in', () => {
		// The mistake runs along the key: a C major is confused with the other
		// chords of C, not with a D major from somewhere else.
		expect(nameNeighbours('C', among, 'C').slice(0, 3)).toEqual(['Dm', 'Em', 'F']);
	});

	it('still fills the buttons from elsewhere when the key is thin', () => {
		const thin = [
			{ label: 'Dm', kind: 'triad', keyCenter: 'C' },
			{ label: 'D', kind: 'triad', keyCenter: 'G' },
			{ label: 'A', kind: 'triad', keyCenter: 'G' }
		];
		expect(choicesFor('C', nameNeighbours('C', thin, 'C'))).toHaveLength(4);
	});

	it('does not offer the same name twice, however it is spelled', () => {
		const spellings = [
			{ label: 'Cmaj7', kind: 'seventh', keyCenter: 'C' },
			{ label: 'CM7', kind: 'seventh', keyCenter: 'C' },
			{ label: 'Dm7', kind: 'seventh', keyCenter: 'C' }
		];
		expect(nameNeighbours('C∆7', spellings, 'C')).toEqual(['Dm7']);
	});

	it('holds the right answer exactly once, wherever it lands', () => {
		const options = choicesFor('C', nameNeighbours('C', among, 'C'));
		expect(options.filter((option) => markNamed('C', option))).toHaveLength(1);
	});
});

describe('filling the buttons on an account that owns one chord', () => {
	/*
	 * The degenerate case, and it is the original bug wearing a different hat: two
	 * rungs up the bank holds exactly one triad, so wrong answers drawn only from
	 * the material leave a single button — press it, be right. The key the chord
	 * came from always has six more in it.
	 */
	it('offers the other six chords of the key', () => {
		// Spelled exactly as `ladder.ts` spells a card label — both go through
		// `formatChord`, so a derived name and a stored one are the same string and
		// `nameNeighbours` folds the duplicate away rather than offering it twice.
		expect(diatonicNames('C', 'triad').map((option) => option.label)).toEqual([
			'C',
			'Dm',
			'Em',
			'F',
			'G',
			'Am',
			'Bdim'
		]);
	});

	it('builds four choices from one card and the key around it', () => {
		const onlyCard = [{ label: 'C', kind: 'triad', keyCenter: 'C' }];
		const among = [...onlyCard, ...diatonicNames('C', 'triad')];
		const options = choicesFor('C', nameNeighbours('C', among, 'C'));
		expect(options).toHaveLength(4);
		expect(options.filter((option) => markNamed('C', option))).toHaveLength(1);
	});

	it('reads a mode label as the key it is in', () => {
		expect(diatonicNames('Eb mixolydian', 'triad')[0].label).toBe('Eb');
	});

	it('says nothing about a scale, which has no name to confuse', () => {
		expect(diatonicNames('C', 'scale')).toEqual([]);
	});

	it('says nothing about a key it cannot read', () => {
		expect(diatonicNames('not a key', 'triad')).toEqual([]);
	});
});
