import { describe, expect, it } from 'vitest';
import { parseChord } from '$lib/music/chord';
import { key as makeKey } from '$lib/music/key';
import { scoreFor } from './backing';
import type { BarChord } from './bass';
import {
	compPattern,
	countInHits,
	drumPattern,
	feelOf,
	GROOVES,
	grooveSpec,
	isGroove,
	SWING_OFFSET
} from './groove';
import { bassLine } from './bass';

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
			groove: 'swing',
			key: makeKey('C')
		});
		expect(beats).toBe(16);
		expect(events.filter((e) => e.kind === 'bass')).toHaveLength(16);
		expect(events.filter((e) => e.kind === 'click')).toHaveLength(16);
	});

	it('is in time order, which is what the scheduler expects', () => {
		const { events } = scoreFor({ bars: iiVI, bpm: 120, groove: 'swing' });
		for (let i = 1; i < events.length; i++) {
			expect(events[i].beat).toBeGreaterThanOrEqual(events[i - 1].beat);
		}
	});

	it('keeps every event inside the loop, so nothing is cut off or doubled', () => {
		const { events, beats } = scoreFor({ bars: iiVI, bpm: 120, groove: 'swing' });
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
			groove: 'swing',
			loopFrom: 9,
			loopTo: 10
		});
		expect(beats).toBe(8);
	});

	it('falls back to the whole form if the loop points select nothing', () => {
		const { beats } = scoreFor({
			bars: iiVI,
			bpm: 120,
			groove: 'swing',
			loopFrom: 99
		});
		expect(beats).toBe(16);
	});

	it('plays nothing for an empty chart rather than throwing', () => {
		expect(scoreFor({ bars: [], bpm: 120, groove: 'swing' })).toEqual({
			events: [],
			beats: 0
		});
	});
});

describe('the grooves', () => {
	it('names every one of them uniquely', () => {
		expect(new Set(GROOVES.map((g) => g.id)).size).toBe(GROOVES.length);
	});

	it('falls back to swing rather than throwing on a name it has never seen', () => {
		// A stored preference and a logged run are not promises about the
		// vocabulary. Reading one written by a later version must not break the page.
		expect(grooveSpec('bebop-waltz' as never).id).toBe('swing');
		expect(isGroove('bebop-waltz')).toBe(false);
	});

	it('swings only where a swung eighth belongs', () => {
		expect(feelOf('swing')).toBe('swing');
		expect(feelOf('shuffle')).toBe('swing');
		// Bossa played with a swung eighth is the single most common way to get it
		// wrong, so it is worth a test rather than a comment.
		expect(feelOf('bossa')).toBe('straight');
		expect(feelOf('rock')).toBe('straight');
	});

	it('puts the backbeat on two and four everywhere it belongs', () => {
		for (const groove of ['rock', 'pop', 'shuffle', 'funk'] as const) {
			const snares = drumPattern(4, groove).filter((h) => h.instrument === 'snare');
			expect(
				snares.map((h) => h.beat),
				groove
			).toEqual([1, 3]);
		}
	});

	it('drops beat one and hits three with both feet, for reggae', () => {
		const hits = drumPattern(4, 'reggae');
		const onOne = hits.filter((h) => h.beat === 0);
		// The hi-hat is there; the kick and the snare are the point of the silence.
		expect(onOne.map((h) => h.instrument)).toEqual(['hihat']);

		const three = hits.filter((h) => h.beat === 2).map((h) => h.instrument);
		expect(three).toContain('kick');
		expect(three).toContain('snare');
	});

	it('leans the reggae hi-hat on the offbeat, not the beat', () => {
		const hats = drumPattern(4, 'reggae').filter((h) => h.instrument === 'hihat');
		const onBeat = hats.find((h) => h.beat === 1)!;
		const offBeat = hats.find((h) => h.beat === 1.5)!;
		expect(offBeat.velocity).toBeGreaterThan(onBeat.velocity);
	});

	it('skanks on every offbeat and nowhere else', () => {
		const hits = compPattern(bars(['Cmaj7']), 'reggae');
		expect(hits.map((h) => h.beat)).toEqual([0.5, 1.5, 2.5, 3.5]);
		// Clipped, not held: the chord is a chop.
		for (const hit of hits) expect(hit.duration).toBeLessThan(0.5);
	});

	it('rests the reggae bass where the one drop lands', () => {
		const line = bassLine(bars(['C7']), 'reggae');
		expect(line.map((n) => n.beat)).toEqual([0, 1.5, 3]);
		// Nothing on three, which is where the kick and snare are.
		expect(line.some((n) => n.beat === 2)).toBe(false);
	});

	it('halves the backbeat for a ballad, which is what makes it a ballad', () => {
		const snares = drumPattern(8, 'ballad').filter((h) => h.instrument === 'snare');
		expect(snares.map((h) => h.beat)).toEqual([2, 6]);
	});

	it('keeps the ride to the jazz kits and the hi-hat out of nothing', () => {
		for (const spec of GROOVES) {
			const hits = drumPattern(8, spec.id);
			expect(hits.length, spec.id).toBeGreaterThan(0);
			const rides = hits.some((h) => h.instrument === 'ride');
			expect(rides, spec.id).toBe(spec.id === 'swing' || spec.id === 'straight');
		}
	});

	it('repeats its cycle across the form and stops at the end of it', () => {
		for (const spec of GROOVES) {
			const short = drumPattern(4, spec.id);
			const long = drumPattern(16, spec.id);
			expect(long.length, spec.id).toBeGreaterThan(short.length);
			for (const hit of long) {
				expect(hit.beat, spec.id).toBeGreaterThanOrEqual(0);
				expect(hit.beat, spec.id).toBeLessThan(16);
			}
		}
	});

	it('gives every groove a comp that stays out of the way', () => {
		for (const spec of GROOVES) {
			const hits = compPattern(iiVI, spec.id);
			expect(hits.length, spec.id).toBeGreaterThan(0);
			for (const hit of hits) {
				expect(hit.velocity, spec.id).toBeLessThan(0.5);
				expect(hit.notes.length, spec.id).toBeGreaterThan(0);
			}
		}
	});

	it('never comps past the chord it belongs to', () => {
		// A bar of two chords gets half a figure each. Without this the second
		// chord's stab lands over the first chord's, on the first chord's beat.
		const halves = bars(['Dm7', 'G7'], 2);
		for (const spec of GROOVES) {
			for (const hit of compPattern(halves, spec.id)) {
				// The jazz comp deliberately pushes into the next bar; nothing else does.
				if (spec.comp === 'sparse') continue;
				const chord = Math.floor(hit.beat / 2);
				expect(hit.beat, spec.id).toBeLessThan((chord + 1) * 2);
			}
		}
	});

	it('holds a ballad root instead of playing four of them', () => {
		const walking = scoreFor({ bars: iiVI, bpm: 60, groove: 'swing' });
		const held = scoreFor({ bars: iiVI, bpm: 60, groove: 'ballad' });
		const notes = (s: typeof held) => s.events.filter((e) => e.kind === 'bass');
		expect(notes(walking)).toHaveLength(16);
		expect(notes(held)).toHaveLength(4);
		// And the one note lasts nearly the whole bar rather than a beat of it.
		expect(notes(held)[0].duration).toBeGreaterThan(3);
	});

	it('walks the blues bass up to the sixth and back for a shuffle', () => {
		const line = bassLine(bars(['C7']), 'boogie');
		const pcs = line.map((n) => ((n.midi % 12) + 12) % 12);
		expect(pcs).toEqual([0, 7, 9, 7]);
	});

	it('drives the rock bass on every beat, with a pickup into the change', () => {
		const line = bassLine(bars(['C7', 'F7']), 'driving');
		expect(line.map((n) => n.beat)).toEqual([0, 1, 2, 3, 3.5, 4, 5, 6, 7, 7.5]);
	});

	it('puts the fifth in the middle of the bar and nowhere else, in two', () => {
		expect(bassLine(bars(['C7']), 'root-fifth').map((n) => n.beat)).toEqual([0, 2]);
		// Two beats is not enough room for it without stealing the next chord's.
		expect(bassLine(bars(['C7'], 2), 'root-fifth').map((n) => n.beat)).toEqual([0]);
	});

	it('leaves the walking line exactly as it was', () => {
		const chart = bars(['Dm7', 'G7', 'Cmaj7', 'Cmaj7']);
		expect(bassLine(chart, 'walking', { key: makeKey('C') })).toEqual(
			bassLine(chart, 'walking', { key: makeKey('C') })
		);
		expect(bassLine(chart, 'walking')).toHaveLength(16);
	});

	it('scores every groove without an event escaping the loop', () => {
		for (const spec of GROOVES) {
			const { events, beats } = scoreFor({ bars: iiVI, bpm: 120, groove: spec.id });
			expect(beats, spec.id).toBe(16);
			for (const event of events) {
				expect(event.beat, spec.id).toBeGreaterThanOrEqual(0);
				expect(event.beat, spec.id).toBeLessThan(beats);
			}
			for (let i = 1; i < events.length; i++) {
				expect(events[i].beat, spec.id).toBeGreaterThanOrEqual(events[i - 1].beat);
			}
		}
	});
});
