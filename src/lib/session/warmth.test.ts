import { describe, expect, it } from 'vitest';
import {
	cellsOf,
	FIRST_FRONTIER,
	frontierFromPosition,
	RUNGS,
	STAGES,
	workingPosition
} from '$lib/curriculum/ladder';
import { chordsByTonic, keysPlayed, keyStandings } from './warmth';

const AT_START = FIRST_FRONTIER;

/** The record this was designed against: two keys played, ten never touched. */
const RECORD = [
	{ key: 'C', chords: 500 },
	{ key: 'A', chords: 200 },
	{ key: 'F', chords: 88 }
];

const standing = (key: string, rows = RECORD, at = AT_START, here = 0) =>
	keyStandings(rows, at, here).find((entry) => entry.key === key)!;

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
		expect(keysPlayed(keyStandings(RECORD, AT_START, 0))).toBe(3);
		expect(keysPlayed(keyStandings([], AT_START, 0))).toBe(0);
	});
});

describe('where the ladder is standing', () => {
	it('offers all twelve keys wherever the ladder happens to be', () => {
		expect(keyStandings([], AT_START, 0).map((entry) => entry.key)).toEqual(
			STAGES.map((stage) => stage.key)
		);
	});

	it('marks the one key it is standing in, and only that one', () => {
		const standings = keyStandings([], frontierFromPosition('D', 'primary-triads')!, 3);
		expect(standings.filter((entry) => entry.here).map((entry) => entry.key)).toEqual([
			STAGES[3].key
		]);
	});

	it('counts the rung it is on as open, so a first day has met something', () => {
		expect(standing('C').reached).toBe(1);
		expect(standing('G').reached).toBe(0);
	});

	it('counts how many rungs each key holds, which is now a per-key number', () => {
		// A frontier opens rungs to different depths in different keys, so this is
		// no longer "everything behind, nothing ahead" — it is a count per key.
		const frontier = frontierFromPosition('F', 'all-triads')!;
		const at = (key: string) => standing(key, [], frontier).reached;
		expect(at('C')).toBe(RUNGS.length);
		expect(at('G')).toBe(RUNGS.length);
		expect(at('F')).toBe(4);
		expect(at('D')).toBe(0);
	});

	it('agrees with the ladder itself about everywhere it has been', () => {
		const places = [
			['C', 'tonic-triad'],
			['Bb', 'all-triads'],
			['Gb', 'relative-minor']
		] as const;

		for (const [key, rungId] of places) {
			const frontier = frontierFromPosition(key, rungId)!;
			const counted = new Map<string, number>();
			for (const cell of cellsOf(frontier)) {
				counted.set(cell.key, (counted.get(cell.key) ?? 0) + 1);
			}

			const here = workingPosition(frontier).stageIndex;
			for (const entry of keyStandings([], frontier, here)) {
				expect(entry.reached, `${key}/${rungId}: ${entry.key}`).toBe(counted.get(entry.key) ?? 0);
			}
		}
	});
});
