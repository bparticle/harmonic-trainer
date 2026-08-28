import { describe, expect, it } from 'vitest';
import { cellsOf, isWellFormed, RUNGS, STAGES } from './curriculum/ladder';
import { parsePrefs, readPrefs } from './settings-validate';
import { DEFAULT_PREFS } from './settings';

/**
 * The upgrade path, tested against the rows that actually exist.
 *
 * Every account on the family instance has a `prefs_json` holding `ladderKey`
 * and `ladderRung` and no `ladderWidths`. That row is read on the first request
 * after the deploy, and if it comes back as anything other than the ground the
 * account had already covered, somebody opens the app to find their practice
 * has been reset. So this is checked at every one of the eighty-four positions
 * rather than at a couple of samples.
 */

const withPrefs = (extra: Record<string, unknown>) => ({
	sessionLengthMinutes: 20,
	revealDelayMs: 2000,
	chordClusterWindowMs: 80,
	midiLatencyOffsetMs: 0,
	...extra
});

describe('reading the frontier out of stored prefs', () => {
	it('takes a well-formed widths array as it stands', () => {
		const widths = [4, 3, 2, 1, 0, 0, 0];
		expect(parsePrefs(withPrefs({ ladderWidths: widths })).ladderWidths).toEqual(widths);
	});

	it('migrates every stored position to the ground it already covered', () => {
		for (const stage of STAGES) {
			for (const rung of RUNGS) {
				const prefs = parsePrefs(withPrefs({ ladderKey: stage.key, ladderRung: rung.id }));
				const frontier = { widths: prefs.ladderWidths };
				expect(isWellFormed(frontier), `${stage.key} / ${rung.id}`).toBe(true);

				// The old walk's prefix, counted: every rung of every earlier key,
				// plus this key's rungs up to and including where it stood.
				const expected = STAGES.indexOf(stage) * RUNGS.length + (RUNGS.indexOf(rung) + 1);
				expect(cellsOf(frontier), `${stage.key} / ${rung.id}`).toHaveLength(expected);
			}
		}
	});

	it('prefers a stored frontier over a stale position beside it', () => {
		// Both fields present is what a row looks like for one deploy, until the
		// next save drops the old pair. The new one wins.
		const prefs = parsePrefs(
			withPrefs({
				ladderWidths: [2, 1, 0, 0, 0, 0, 0],
				ladderKey: 'Gb',
				ladderRung: 'relative-minor'
			})
		);
		expect(prefs.ladderWidths).toEqual([2, 1, 0, 0, 0, 0, 0]);
	});

	it('starts at the beginning for a row that has neither', () => {
		expect(parsePrefs(withPrefs({})).ladderWidths).toEqual(DEFAULT_PREFS.ladderWidths);
	});

	/*
	 * The old code threw on an unknown key, which was right when the value named
	 * a single place the planner had to go and find. A widths array that has been
	 * fiddled with is better read as "start again" — the practice record it
	 * belongs to is still perfectly good, and refusing to load the settings would
	 * lock somebody out of an account whose rows are all intact.
	 */
	it('falls back rather than throwing on nonsense', () => {
		const nonsense = [
			{ ladderWidths: [1, 2, 0, 0, 0, 0, 0] }, // not a staircase
			{ ladderWidths: [1, 0, 0] }, // wrong length
			{ ladderWidths: [99, 0, 0, 0, 0, 0, 0] }, // past the twelfth key
			{ ladderWidths: 'nope' },
			{ ladderKey: 'H', ladderRung: 'scale' },
			{ ladderKey: 'C', ladderRung: 'nonsense' }
		];
		for (const extra of nonsense) {
			expect(() => parsePrefs(withPrefs(extra))).not.toThrow();
			expect(parsePrefs(withPrefs(extra)).ladderWidths).toEqual(DEFAULT_PREFS.ladderWidths);
		}
	});

	it('still refuses a session length it does not recognise', () => {
		// The other fields kept their old strictness; only the ladder softened.
		expect(() => parsePrefs(withPrefs({ sessionLengthMinutes: 7 }))).toThrow();
	});
});

/**
 * The reader the 500 was about.
 *
 * `parsePrefs` lived on the write path only, and `toAppSettings` cast
 * `prefs_json` straight to `Prefs` — so a row written before a field existed
 * came back missing it, with the types insisting otherwise. Every existing
 * account would have hit an Internal Error on its first request after the
 * frontier shipped. These are the cases a stored row actually takes.
 */
describe('reading a stored prefs row', () => {
	it('migrates a row that has the old ladder fields and no widths', () => {
		const prefs = readPrefs({
			sessionLengthMinutes: 20,
			revealDelayMs: 2000,
			chordClusterWindowMs: 80,
			midiLatencyOffsetMs: 0,
			ladderKey: 'G',
			ladderRung: 'primary-triads'
		});
		expect(isWellFormed({ widths: prefs.ladderWidths })).toBe(true);
		expect(cellsOf({ widths: prefs.ladderWidths })).toHaveLength(RUNGS.length + 3);
	});

	it('fills every field a row is missing rather than handing back undefined', () => {
		const prefs = readPrefs({});
		expect(prefs).toEqual(DEFAULT_PREFS);
		for (const value of Object.values(prefs)) expect(value).toBeDefined();
	});

	it('never throws, whatever the column holds', () => {
		for (const stored of [null, undefined, 'nonsense', 42, [], { ladderWidths: {} }]) {
			expect(() => readPrefs(stored)).not.toThrow();
			expect(readPrefs(stored).ladderWidths).toEqual(DEFAULT_PREFS.ladderWidths);
		}
	});

	it('keeps the values a good row actually holds', () => {
		const prefs = readPrefs({
			sessionLengthMinutes: 35,
			revealDelayMs: 3000,
			chordClusterWindowMs: 120,
			midiLatencyOffsetMs: -40,
			ladderWidths: [3, 2, 1, 0, 0, 0, 0]
		});
		expect(prefs).toEqual({
			sessionLengthMinutes: 35,
			revealDelayMs: 3000,
			chordClusterWindowMs: 120,
			midiLatencyOffsetMs: -40,
			ladderWidths: [3, 2, 1, 0, 0, 0, 0]
		});
	});

	it('falls back on one bad field without discarding the good ones', () => {
		const prefs = readPrefs({ sessionLengthMinutes: 7, revealDelayMs: 3000 });
		expect(prefs.sessionLengthMinutes).toBe(DEFAULT_PREFS.sessionLengthMinutes);
		expect(prefs.revealDelayMs).toBe(3000);
	});
});
