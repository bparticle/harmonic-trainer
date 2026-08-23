import { describe, expect, it } from 'vitest';
import { parseChord } from '$lib/music/chord';
import { key as makeKey } from '$lib/music/key';
import {
	accuracy,
	add,
	classify,
	coverage,
	emptyTally,
	essentialTones,
	judge,
	judgeAccumulated,
	targetFor
} from './match';

const C = makeKey('C');
const at = (symbol: string, k = C) => targetFor(parseChord(symbol), k);

describe('the tones that define a chord', () => {
	it('is the third and the seventh, not the root and the fifth', () => {
		// C7 is E and B♭. The root is what the bass is playing and the fifth is
		// the note nobody misses.
		expect(essentialTones(parseChord('C7')).sort((a, b) => a - b)).toEqual([4, 10]);
		expect(essentialTones(parseChord('Dm7')).sort((a, b) => a - b)).toEqual([0, 5]);
		expect(essentialTones(parseChord('Cmaj7')).sort((a, b) => a - b)).toEqual([4, 11]);
	});

	it('uses the suspended note when there is no third', () => {
		expect(essentialTones(parseChord('G7sus4'))).toContain(0); // C, the 4th of G
		expect(essentialTones(parseChord('G7sus4'))).toContain(5); // F, the 7th
	});

	it('uses the sixth when there is no seventh', () => {
		// C6 is E and A.
		expect(essentialTones(parseChord('C6')).sort((a, b) => a - b)).toEqual([4, 9]);
	});

	it('falls back to the third alone on a plain triad', () => {
		expect(essentialTones(parseChord('C'))).toEqual([4]);
		expect(essentialTones(parseChord('Cm'))).toEqual([3]);
	});

	it('honours an alteration, because the altered note is the chord tone', () => {
		// The ♭9 of G7♭9 is A♭; the guide tones are still B and F.
		expect(essentialTones(parseChord('G7b9')).sort((a, b) => a - b)).toEqual([5, 11]);
	});
});

describe('where a note sits', () => {
	it('calls a chord tone a chord tone', () => {
		const target = at('Dm7');
		for (const pc of [2, 5, 9, 0]) expect(classify(pc, target), String(pc)).toBe('chord');
	});

	it('calls the rest of the key colour', () => {
		const target = at('Dm7');
		expect(classify(4, target)).toBe('colour'); // E, the 9th
		expect(classify(11, target)).toBe('colour'); // B, the 13th
	});

	it('calls everything else outside', () => {
		const target = at('Dm7');
		expect(classify(1, target)).toBe('outside'); // D♭
		expect(classify(6, target)).toBe('outside'); // F♯
	});

	it('does not call a secondary dominant’s own note outside its key', () => {
		// D7 in C is V7/V. Its F♯ is the chord, not an accident, even though the
		// C major scale has no F♯ in it.
		expect(classify(6, at('D7'))).toBe('chord');
	});

	it('reads a chord against the key it is actually heard in', () => {
		// The same A♭ is outside C major and inside C minor.
		expect(classify(8, at('C7'))).toBe('outside');
		expect(classify(8, at('C7', makeKey('C', 'aeolian')))).toBe('colour');
	});

	it('normalises notes from any octave', () => {
		const target = at('Dm7');
		expect(classify(62, target)).toBe('chord');
		expect(classify(-10, target)).toBe('chord'); // 2, a D
	});
});

describe('judging one chord', () => {
	it('lands when both guide tones were played', () => {
		const attempt = judge([2, 5, 9, 0], at('Dm7'));
		expect(attempt.landing).toBe('landed');
		expect(attempt.found).toBe(2);
		expect(attempt.absent).toEqual([]);
	});

	it('lands a rootless voicing, which is the point', () => {
		// F A C E over Dm7: no D anywhere, and completely correct.
		expect(judge([5, 9, 0, 4], at('Dm7')).landing).toBe('landed');
	});

	it('does not need the notes at once', () => {
		// A line running through the chord over a whole bar.
		expect(judge([2, 4, 5, 7, 9, 11, 0], at('Dm7')).landing).toBe('landed');
	});

	it('is partial when one guide tone is missing, and says which', () => {
		const attempt = judge([2, 5, 7], at('Dm7')); // no C
		expect(attempt.landing).toBe('partial');
		expect(attempt.found).toBe(1);
		expect(attempt.absent).toEqual([0]);
	});

	it('misses when the chord is simply not there', () => {
		const attempt = judge([1, 6], at('Dm7'));
		expect(attempt.landing).toBe('missed');
		expect(attempt.found).toBe(0);
	});

	it('counts every note played, including repeats', () => {
		const attempt = judge([2, 2, 5, 4, 1], at('Dm7'));
		expect(attempt.notes).toEqual({ chord: 3, colour: 1, outside: 1 });
	});

	it('judges the fixed accumulator exactly like the iterable path', () => {
		const target = at('Dm7');
		expect(judgeAccumulated((1 << 2) | (1 << 5) | (1 << 4) | (1 << 1), 3, 1, 1, target)).toEqual(
			judge([2, 2, 5, 4, 1], target)
		);
	});

	it('never penalises an outside note in the landing', () => {
		// A chromatic approach into the third does not stop the chord landing.
		expect(judge([5, 0, 4, 1], at('Dm7')).landing).toBe('landed');
	});
});

describe('a run', () => {
	const target = at('Dm7');

	it('ignores chords nothing was played over', () => {
		const tally = add(emptyTally(), judge([], target));
		expect(tally.voiced).toBe(0);
		expect(accuracy(tally)).toBeNull();
	});

	it('reports nothing rather than zero before a note is played', () => {
		expect(accuracy(emptyTally())).toBeNull();
		expect(coverage(emptyTally())).toBeNull();
	});

	it('counts landings against chords played over', () => {
		let tally = emptyTally();
		tally = add(tally, judge([5, 0], target)); // landed
		tally = add(tally, judge([5], target)); // partial
		tally = add(tally, judge([1], target)); // missed
		tally = add(tally, judge([], target)); // silent, not counted

		expect(tally.voiced).toBe(3);
		expect(tally).toMatchObject({ landed: 1, partial: 1, missed: 1 });
		expect(accuracy(tally)).toBe(33);
	});

	it('gives half credit for a partial in the gentler number', () => {
		let tally = emptyTally();
		tally = add(tally, judge([5, 0], target)); // landed
		tally = add(tally, judge([5], target)); // partial

		expect(accuracy(tally)).toBe(50);
		expect(coverage(tally)).toBe(75);
	});

	it('accumulates the note breakdown across the run', () => {
		let tally = emptyTally();
		tally = add(tally, judge([2, 4], target)); // 1 chord, 1 colour
		tally = add(tally, judge([5, 1], target)); // 1 chord, 1 outside
		expect(tally.notes).toEqual({ chord: 2, colour: 1, outside: 1 });
	});

	it('is a perfect run when every chord landed', () => {
		let tally = emptyTally();
		for (let i = 0; i < 12; i++) tally = add(tally, judge([5, 0], target));
		expect(accuracy(tally)).toBe(100);
		expect(coverage(tally)).toBe(100);
	});
});
