import { describe, expect, it } from 'vitest';
import { positionOf, reachedSoFar, RUNGS, STAGES } from '$lib/curriculum/ladder';
import { chordsByTonic, keysPlayed, keyStandings, rungsReached } from './warmth';

const AT_START = { stageIndex: 0, rungIndex: 0 };

/** The record this was designed against: two keys played, ten never touched. */
const RECORD = [
	{ key: 'C', chords: 500 },
	{ key: 'A', chords: 200 },
	{ key: 'F', chords: 88 }
];

const standing = (key: string, rows = RECORD, at = AT_START) =>
	keyStandings(rows, at).find((entry) => entry.key === key)!;

describe('what the record holds in a key', () => {
	it('counts the chords heard in it, whatever mode they were written in', () => {
		const rows = [
			{ key: 'Bb', chords: 10 },
			{ key: 'Bb lydian', chords: 6 },
			{ key: 'Bb dorian', chords: 4 }
		];
		expect(standing('Bb', rows).chords).toBe(20);
	});

	it('files a mode under its own tonic and not under a relative key', () => {
		const rows = [{ key: 'G aeolian', chords: 12 }];
		expect(standing('G', rows).chords).toBe(12);
		expect(standing('Bb', rows).fresh).toBe(true);
	});

	it('calls a key nobody has played fresh rather than zero', () => {
		expect(standing('Gb').fresh).toBe(true);
		expect(standing('C').fresh).toBe(false);
	});

	it('leaves a fresh key with no fill at all, so an outline means one thing', () => {
		expect(standing('Gb').fill).toBe(0);
	});

	it('scales every swatch against the busiest key', () => {
		expect(standing('C').fill).toBe(1);
		expect(standing('A').fill).toBeCloseTo(0.4);
	});

	it('gives a key played once a visible sliver, because some and none differ', () => {
		const rows = [
			{ key: 'C', chords: 588 },
			{ key: 'D', chords: 1 }
		];
		expect(standing('D', rows).fill).toBeGreaterThan(0.05);
		expect(standing('D', rows).chords).toBe(1);
	});

	it('drops a key spelling it cannot read rather than filing it under a guess', () => {
		const held = chordsByTonic([
			{ key: 'H major', chords: 40 },
			{ key: 'C', chords: 2 }
		]);
		expect([...held.values()]).toEqual([2]);
	});

	it('gives every key its tonic to take a colour from', () => {
		expect(standing('C').pc).toBe(0);
		expect(standing('Eb').pc).toBe(3);
		expect(standing('B').pc).toBe(11);
	});

	it('counts the keys that hold something without ranking them', () => {
		expect(keysPlayed(keyStandings(RECORD, AT_START))).toBe(3);
		expect(keysPlayed(keyStandings([], AT_START))).toBe(0);
	});
});

describe('where the ladder is standing', () => {
	it('offers all twelve keys wherever the ladder happens to be', () => {
		expect(keyStandings([], AT_START).map((entry) => entry.key)).toEqual(
			STAGES.map((stage) => stage.key)
		);
	});

	it('marks the one key it is standing in, and only that one', () => {
		const standings = keyStandings([], { stageIndex: 3, rungIndex: 2 });
		expect(standings.filter((entry) => entry.here).map((entry) => entry.key)).toEqual([
			STAGES[3].key
		]);
	});

	it('counts the rung it is on as met, so a first day has met something', () => {
		expect(rungsReached(AT_START, 0)).toBe(1);
	});

	it('has met everything in the keys behind it and nothing in the keys ahead', () => {
		const at = { stageIndex: 2, rungIndex: 3 };
		expect(rungsReached(at, 0)).toBe(RUNGS.length);
		expect(rungsReached(at, 2)).toBe(4);
		expect(rungsReached(at, 5)).toBe(0);
	});

	it('agrees with the ladder itself about everywhere it has been', () => {
		const places = [
			['C', 'tonic-triad'],
			['Bb', 'all-triads'],
			['Gb', 'relative-minor']
		] as const;

		for (const [key, rungId] of places) {
			const position = positionOf(key, rungId)!;
			const counted = new Map<string, number>();
			for (const place of reachedSoFar(position)) {
				counted.set(place.key, (counted.get(place.key) ?? 0) + 1);
			}

			for (const entry of keyStandings([], position)) {
				expect(entry.reached).toBe(counted.get(entry.key) ?? 0);
			}
		}
	});
});
