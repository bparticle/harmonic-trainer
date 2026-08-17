import { describe, expect, it } from 'vitest';
import { parseChord } from '$lib/music/chord';
import { key as makeKey } from '$lib/music/key';
import { pitchClass } from '$lib/music/note';
import { totalBeats, walkingBass, type BarChord } from './bass';

const bars = (symbols: string[], beats = 4): BarChord[] =>
	symbols.map((s) => ({ chord: parseChord(s), beats }));

const iiVI = bars(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
const blues = bars(['C7', 'F7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7']);

const pcOf = (n: number) => ((n % 12) + 12) % 12;

describe('shape of the line', () => {
	it('gives one note per beat', () => {
		const line = walkingBass(iiVI);
		expect(line).toHaveLength(totalBeats(iiVI));
		expect(line.map((n) => n.beat)).toEqual([...Array(16).keys()]);
	});

	it('starts every bar on the root of its chord', () => {
		const line = walkingBass(iiVI);
		for (const [i, bar] of iiVI.entries()) {
			const downbeat = line.find((n) => n.beat === i * 4)!;
			expect(pcOf(downbeat.midi), `bar ${i + 1}`).toBe(pitchClass(bar.chord.root));
			expect(downbeat.role).toBe('root');
		}
	});

	it('starts a slash chord on the bass note it names, not on its root', () => {
		// The chart saying C/E while the bass plays a C is the same lie the
		// importer used to tell by dropping the bass note altogether.
		const slashes = bars(['C/E', 'F', 'G/B', 'C']);
		const line = walkingBass(slashes);
		const downbeats = [0, 4, 8, 12].map((beat) => pcOf(line.find((n) => n.beat === beat)!.midi));
		expect(downbeats).toEqual([pitchClass(parseChord('E').root), 5, 11, 0]);
	});

	it('walks towards the next chord’s bass note, not its root', () => {
		const slashes = bars(['F', 'C/E']);
		const line = walkingBass(slashes);
		const lead = pcOf(line.find((n) => n.beat === 3)!.midi);
		// E is the note being arrived at, so the approach is a step from it.
		const distance = Math.min((lead - 4 + 12) % 12, (4 - lead + 12) % 12);
		expect([1, 5, 7].includes(distance) || distance === 0).toBe(true);
	});

	it('leads into the next chord on the last beat of each bar', () => {
		const line = walkingBass(iiVI);
		for (let i = 0; i < iiVI.length; i++) {
			const lead = line.find((n) => n.beat === i * 4 + 3)!;
			const nextRoot = pitchClass(iiVI[(i + 1) % iiVI.length].chord.root);
			const distance = Math.min(
				(pcOf(lead.midi) - nextRoot + 12) % 12,
				(nextRoot - pcOf(lead.midi) + 12) % 12
			);
			// A semitone either side, or the fifth above — the classic approaches.
			expect([1, 5, 7].includes(distance) || distance === 0, `bar ${i + 1}`).toBe(true);
			expect(lead.role).toBe('approach');
		}
	});

	it('loops: the last bar walks back to the first', () => {
		const line = walkingBass(iiVI);
		const lead = line[line.length - 1];
		const firstRoot = pitchClass(iiVI[0].chord.root);
		const distance = Math.min(
			(pcOf(lead.midi) - firstRoot + 12) % 12,
			(firstRoot - pcOf(lead.midi) + 12) % 12
		);
		expect([0, 1, 5, 7]).toContain(distance);
	});
});

describe('it walks rather than leaps', () => {
	it('never jumps more than a sixth between consecutive notes', () => {
		for (const chart of [iiVI, blues]) {
			const line = walkingBass(chart);
			for (let i = 1; i < line.length; i++) {
				const leap = Math.abs(line[i].midi - line[i - 1].midi);
				expect(leap, `beat ${line[i].beat}`).toBeLessThanOrEqual(9);
			}
		}
	});

	it('never repeats the same note twice in a row', () => {
		const line = walkingBass(blues);
		for (let i = 1; i < line.length; i++) {
			expect(line[i].midi, `beat ${line[i].beat}`).not.toBe(line[i - 1].midi);
		}
	});

	it('stays in the range of a bass', () => {
		const line = walkingBass(blues);
		for (const note of line) {
			expect(note.midi).toBeGreaterThanOrEqual(33);
			expect(note.midi).toBeLessThanOrEqual(57);
		}
	});

	it('honours a range it is given', () => {
		const line = walkingBass(blues, { low: 40, high: 52 });
		for (const note of line) {
			expect(note.midi).toBeGreaterThanOrEqual(40);
			expect(note.midi).toBeLessThanOrEqual(52);
		}
	});
});

describe('what the middle beats do', () => {
	it('uses chord tones and scale tones, not arbitrary notes', () => {
		const line = walkingBass(iiVI, { key: makeKey('C') });
		const middles = line.filter((n) => n.role === 'chord-tone' || n.role === 'scale');
		expect(middles.length).toBeGreaterThan(0);
		// Everything in a diatonic ii-V-I should be in the key.
		const inKey = new Set([0, 2, 4, 5, 7, 9, 11]);
		for (const note of middles) {
			expect(inKey.has(pcOf(note.midi)), `beat ${note.beat}`).toBe(true);
		}
	});

	it('prefers the third and fifth of the chord it is on', () => {
		const line = walkingBass(bars(['Dm7', 'Dm7']), { key: makeKey('C') });
		const secondBeat = line.find((n) => n.beat === 1)!;
		// F or A — the third or fifth of Dm7.
		expect([5, 9, 2, 0]).toContain(pcOf(secondBeat.midi));
	});
});

describe('other bar lengths', () => {
	it('handles two chords in a bar', () => {
		const twoBeat = bars(['Dm7', 'G7', 'Cmaj7', 'A7'], 2);
		const line = walkingBass(twoBeat);
		expect(line).toHaveLength(8);
		expect(line.filter((n) => n.role === 'root')).toHaveLength(4);
		expect(line.filter((n) => n.role === 'approach')).toHaveLength(4);
	});

	it('handles a chord lasting a single beat', () => {
		const line = walkingBass([{ chord: parseChord('C'), beats: 1 }]);
		expect(line).toHaveLength(1);
		expect(line[0].role).toBe('root');
	});

	it('handles a chord lasting a whole bar of eight', () => {
		const line = walkingBass([{ chord: parseChord('C7'), beats: 8 }]);
		expect(line).toHaveLength(8);
		expect(line[0].role).toBe('root');
		expect(line[7].role).toBe('approach');
	});

	it('copes with an empty chart', () => {
		expect(walkingBass([])).toEqual([]);
	});
});

describe('determinism', () => {
	it('plays the same line every time, so a loop is stable', () => {
		// A bass player who improvised something different every four bars would
		// be a menace to practise against.
		expect(walkingBass(blues)).toEqual(walkingBass(blues));
	});

	it('transposes with the chart', () => {
		const inC = walkingBass(bars(['C7', 'F7']));
		const inF = walkingBass(bars(['F7', 'Bb7']));
		expect(inC.map((n) => n.role)).toEqual(inF.map((n) => n.role));
	});
});
