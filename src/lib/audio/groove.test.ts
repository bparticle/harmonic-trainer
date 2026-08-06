import { describe, expect, it } from 'vitest';
import { parseChord } from '$lib/music/chord';
import { key as makeKey } from '$lib/music/key';
import { scoreFor } from './backing';
import type { BarChord } from './bass';
import { compPattern, countInHits, drumPattern, SWING_OFFSET } from './groove';

const bars = (symbols: string[], beats = 4): BarChord[] =>
	symbols.map((s) => ({ chord: parseChord(s), beats }));

const iiVI = bars(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);

describe('drums', () => {
	it('rides on every beat', () => {
		const rides = drumPattern(16).filter((h) => h.instrument === 'ride');
		for (let beat = 0; beat < 16; beat++) {
			expect(
				rides.some((h) => h.beat === beat),
				`beat ${beat}`
			).toBe(true);
		}
	});

	it('swings the skip note after two and four', () => {
		const hits = drumPattern(4, 'swing');
		expect(hits.some((h) => h.beat === 1 + SWING_OFFSET)).toBe(true);
		expect(hits.some((h) => h.beat === 3 + SWING_OFFSET)).toBe(true);
	});

	it('puts the skip note on the half when the feel is straight', () => {
		const hits = drumPattern(4, 'straight');
		expect(hits.some((h) => h.beat === 1.5)).toBe(true);
		expect(hits.some((h) => h.beat === 1 + SWING_OFFSET)).toBe(false);
	});

	it('closes the hi-hat on two and four, not on one and three', () => {
		const hats = drumPattern(4).filter((h) => h.instrument === 'hihat');
		expect(hats.map((h) => h.beat)).toEqual([1, 3]);
	});

	it('accents the downbeat', () => {
		const hits = drumPattern(4);
		const one = hits.find((h) => h.beat === 0 && h.instrument === 'ride')!;
		const two = hits.find((h) => h.beat === 1 && h.instrument === 'ride')!;
		expect(one.velocity).toBeGreaterThan(two.velocity);
	});

	it('never asks for a note before the start', () => {
		for (const hit of drumPattern(8)) expect(hit.beat).toBeGreaterThanOrEqual(0);
	});

	it('counts in before the first bar', () => {
		expect(countInHits(4).map((h) => h.beat)).toEqual([-4, -3, -2, -1]);
	});
});

describe('comping', () => {
	it('plays one voicing per chord', () => {
		expect(compPattern(iiVI)).toHaveLength(4);
	});

	it('leaves out the root, which the bass already has', () => {
		const hits = compPattern(bars(['Cmaj7']));
		expect(hits[0].notes.map((n) => ((n % 12) + 12) % 12)).not.toContain(0);
	});

	it('does not land in the same place every bar', () => {
		const placings = compPattern(iiVI).map((h, i) => h.beat - i * 4);
		expect(new Set(placings).size).toBeGreaterThan(1);
	});

	it('stays quiet: nothing louder than half velocity', () => {
		for (const hit of compPattern(iiVI)) expect(hit.velocity).toBeLessThan(0.5);
	});

	it('copes with triads, which have no seventh to be rootless about', () => {
		const hits = compPattern(bars(['C', 'F', 'G']));
		expect(hits).toHaveLength(3);
		for (const hit of hits) expect(hit.notes.length).toBeGreaterThan(0);
	});
});

describe('the score as a whole', () => {
	it('covers every beat with a bass note and a click', () => {
		const { events, beats } = scoreFor({
			bars: iiVI,
			bpm: 120,
			feel: 'swing',
			key: makeKey('C')
		});
		expect(beats).toBe(16);
		expect(events.filter((e) => e.kind === 'bass')).toHaveLength(16);
		expect(events.filter((e) => e.kind === 'click')).toHaveLength(16);
	});

	it('is in time order, which is what the scheduler expects', () => {
		const { events } = scoreFor({ bars: iiVI, bpm: 120, feel: 'swing' });
		for (let i = 1; i < events.length; i++) {
			expect(events[i].beat).toBeGreaterThanOrEqual(events[i - 1].beat);
		}
	});

	it('keeps every event inside the loop, so nothing is cut off or doubled', () => {
		const { events, beats } = scoreFor({ bars: iiVI, bpm: 120, feel: 'swing' });
		for (const event of events) {
			expect(event.beat).toBeGreaterThanOrEqual(0);
			expect(event.beat).toBeLessThan(beats);
		}
	});

	it('loops only the bars asked for', () => {
		const twelve = bars(['C7', 'F7', 'C7', 'C7', 'F7', 'F7', 'C7', 'C7', 'G7', 'F7', 'C7', 'G7']);
		const { beats } = scoreFor({
			bars: twelve,
			bpm: 120,
			feel: 'swing',
			loopFrom: 9,
			loopTo: 10
		});
		expect(beats).toBe(8);
	});

	it('falls back to the whole form if the loop points select nothing', () => {
		const { beats } = scoreFor({
			bars: iiVI,
			bpm: 120,
			feel: 'swing',
			loopFrom: 99
		});
		expect(beats).toBe(16);
	});

	it('plays nothing for an empty chart rather than throwing', () => {
		expect(scoreFor({ bars: [], bpm: 120, feel: 'swing' })).toEqual({
			events: [],
			beats: 0
		});
	});
});
