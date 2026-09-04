import { describe, expect, it } from 'vitest';
import {
	FIRST_FRONTIER,
	FIRST_POSITION,
	RUNGS,
	STAGES,
	cellsOf,
	deepen,
	depthOf,
	directionsForItem,
	directionsForRung,
	frontierCovering,
	frontierFromPosition,
	isOpen,
	isWellFormed,
	minorKeysReached,
	relativeMinorOf,
	keysAtStation,
	stationHolding,
	itemsForRung,
	ladderIdentity,
	narrower,
	nextCell,
	nextWidening,
	openedCell,
	positionOf,
	rungsOpenIn,
	stageByKey,
	widen,
	widenNext,
	widest,
	workingPosition,
	type Frontier
} from './ladder';
import { parseKey, scale } from '$lib/music/key';
import { pitchClass } from '$lib/music/note';

describe('the order of keys', () => {
	it('starts at C with nothing to remember', () => {
		expect(STAGES[0].key).toBe('C');
		expect(STAGES[0].accidentals).toBe(0);
		expect(STAGES[0].relativeMinor).toBe('Am');
	});

	it('adds exactly one accidental at a time', () => {
		for (let i = 1; i < STAGES.length; i++) {
			const previous = Math.abs(STAGES[i - 1].accidentals);
			const current = Math.abs(STAGES[i].accidentals);
			expect(current - previous, `${STAGES[i - 1].key} → ${STAGES[i].key}`).toBeLessThanOrEqual(1);
		}
	});

	it('alternates sharp and flat sides', () => {
		// C, G, F, D, Bb, A, Eb… — the way keys have always been taught.
		expect(STAGES.slice(0, 7).map((s) => s.key)).toEqual(['C', 'G', 'F', 'D', 'Bb', 'A', 'Eb']);
	});

	it('covers twelve keys, each once', () => {
		expect(STAGES).toHaveLength(12);
		expect(new Set(STAGES.map((s) => s.key)).size).toBe(12);
	});

	it('names the right relative minor for each', () => {
		for (const stage of STAGES) {
			const major = parseKey(stage.key);
			const minor = parseKey(stage.relativeMinor);
			const majorPcs = new Set(scale(major).map(pitchClass));
			const minorPcs = scale(minor).map(pitchClass);
			// Relative keys share all seven notes.
			for (const pc of minorPcs) {
				expect(majorPcs.has(pc), `${stage.key} / ${stage.relativeMinor}`).toBe(true);
			}
		}
	});

	it('states the accidentals in words for each key', () => {
		for (const stage of STAGES) expect(stage.note.length, stage.key).toBeGreaterThan(8);
	});
});

describe('the rungs', () => {
	it('starts with the scale and nothing else', () => {
		expect(RUNGS[0].id).toBe('scale');
		expect(itemsForRung('scale', STAGES[0])).toHaveLength(1);
	});

	it('builds up rather than jumping', () => {
		expect(RUNGS.map((r) => r.id)).toEqual([
			'scale',
			'tonic-triad',
			'primary-triads',
			'all-triads',
			'tonic-seventh',
			'all-sevenths',
			'relative-minor'
		]);
	});

	it('holds no chord progressions — those moved to their own section', () => {
		expect(RUNGS.some((r) => /progress|two|five|ii/i.test(r.id))).toBe(false);
	});

	it('explains itself without assuming anything', () => {
		for (const rung of RUNGS) {
			expect(rung.teaches.length, rung.id).toBeGreaterThan(30);
			expect(rung.instruction.length, rung.id).toBeGreaterThan(20);
		}
	});

	it('grows one idea at a time', () => {
		const counts = RUNGS.map((r) => itemsForRung(r.id, STAGES[0]).length);
		expect(counts[0]).toBe(1); // scale
		expect(counts[1]).toBe(1); // tonic triad
		expect(counts[2]).toBe(3); // I IV V
		expect(counts[3]).toBe(7); // all triads
	});
});

describe('what a rung asks in a key', () => {
	it('gives the right scale for C', () => {
		const [item] = itemsForRung('scale', STAGES[0]);
		expect(item.answerPitchClasses).toEqual([0, 2, 4, 5, 7, 9, 11]);
		expect(item.answerVoicing).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
		expect(item.detail).toBe('C D E F G A B');
	});

	it('plays every scale continuously from its tonic to the next octave', () => {
		for (const stage of STAGES) {
			for (const rung of ['scale', 'relative-minor'] as const) {
				const item = itemsForRung(rung, stage)[0];
				const voicing = item.answerVoicing ?? [];
				expect(voicing, `${stage.key}/${rung}`).toHaveLength(8);
				expect(voicing.every((note, index) => index === 0 || note > voicing[index - 1])).toBe(true);
				expect(voicing.at(-1)! - voicing[0]).toBe(12);
			}
		}
	});

	it('gives the right scale for the flat keys too', () => {
		const [item] = itemsForRung('scale', stageByKey('Eb')!);
		expect(item.detail).toBe('E♭ F G A♭ B♭ C D');
	});

	it('names the primary triads by degree', () => {
		const items = itemsForRung('primary-triads', STAGES[0]);
		expect(items.map((i) => i.label)).toEqual(['C', 'F', 'G']);
		expect(items.map((i) => i.degree)).toEqual(['I', 'IV', 'V']);
	});

	it('names all seven triads of C', () => {
		const items = itemsForRung('all-triads', STAGES[0]);
		expect(items.map((i) => i.label)).toEqual(['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim']);
	});

	it('names all seven sevenths of C', () => {
		const items = itemsForRung('all-sevenths', STAGES[0]);
		expect(items.map((i) => i.label)).toEqual([
			'Cmaj7',
			'Dm7',
			'Em7',
			'Fmaj7',
			'G7',
			'Am7',
			'Bm7b5'
		]);
	});

	it('gives the relative minor the same notes as its major', () => {
		const [scaleItem] = itemsForRung('relative-minor', STAGES[0]);
		expect([...scaleItem.answerPitchClasses].sort((a, b) => a - b)).toEqual([0, 2, 4, 5, 7, 9, 11]);
	});

	it('works in every key without throwing', () => {
		for (const stage of STAGES) {
			for (const rung of RUNGS) {
				expect(() => itemsForRung(rung.id, stage), `${rung.id} in ${stage.key}`).not.toThrow();
				expect(itemsForRung(rung.id, stage).length).toBeGreaterThan(0);
			}
		}
	});

	it('keeps every voicing playable', () => {
		for (const stage of STAGES) {
			for (const rung of RUNGS) {
				for (const item of itemsForRung(rung.id, stage)) {
					for (const note of item.answerVoicing ?? []) {
						expect(note, `${stage.key}/${rung.id}`).toBeGreaterThanOrEqual(21);
						expect(note).toBeLessThanOrEqual(108);
					}
				}
			}
		}
	});
});

describe('directions', () => {
	it('never asks you to name a scale', () => {
		// A scale has no chord shape to name, and a wrong answer to an impossible
		// question still counts against you.
		expect(directionsForRung('scale')).not.toContain('hear_name');
	});

	it('asks everything of a chord rung', () => {
		expect(directionsForRung('all-sevenths')).toEqual([
			'see_play',
			'hear_play',
			'hear_name',
			'hear_quality',
			'degree_play'
		]);
	});

	it('asks no quality question until there are two qualities to tell apart', () => {
		// `tonic-triad` and `primary-triads` build major triads and nothing else.
		// *What kind of chord was that* is not a question when it has had one
		// answer every time it has ever been asked.
		expect(directionsForRung('tonic-triad')).not.toContain('hear_quality');
		expect(directionsForRung('primary-triads')).not.toContain('hear_quality');
		expect(directionsForRung('all-triads')).toContain('hear_quality');
	});

	it('asks no name until the bank can supply a wrong one', () => {
		// The mirror image, and the fault it fixes. On those two rungs the whole
		// bank is major triads, so the three buttons beside the right answer came
		// from `diatonicNames` — chords derived from the key that the ladder has
		// not built and nobody has met.
		expect(directionsForRung('tonic-triad')).not.toContain('hear_name');
		expect(directionsForRung('primary-triads')).not.toContain('hear_name');
		expect(directionsForRung('all-triads')).toContain('hear_name');
	});

	it('opens the quality question no later than the naming one it feeds', () => {
		// The ordering this milestone exists for, checked as an ordering rather
		// than as two facts that happen to agree today.
		for (const rung of RUNGS) {
			const asked = directionsForRung(rung.id);
			if (asked.includes('hear_name')) expect(asked, rung.id).toContain('hear_quality');
		}
	});

	it('asks the quality of every item that is a chord, and of no other', () => {
		for (const stage of STAGES) {
			for (const rung of RUNGS) {
				if (!directionsForRung(rung.id).includes('hear_quality')) continue;
				for (const item of itemsForRung(rung.id, stage)) {
					const asked = directionsForItem(rung.id, item).includes('hear_quality');
					expect(asked, `${stage.key}/${rung.id}/${item.label}`).toBe(Boolean(item.chord));
				}
			}
		}
	});

	it('makes no card in a direction nothing asks for', () => {
		// The rule this list is under, and the one it broke from the day the ladder
		// was written: `play_name`
		// was generated for every triad and every seventh and queued by nothing, so
		// the bank filled with permanently-due rows that could not be reached. A
		// direction belongs here only if a task partition contains it.
		for (const rung of RUNGS) {
			expect(directionsForRung(rung.id), rung.id).not.toContain('play_name');
		}
	});

	it('never asks a scale which numeral it is', () => {
		// The same refusal as naming one, for the same reason: a scale is seven
		// notes and not a numbered chord.
		expect(directionsForRung('scale')).not.toContain('degree_play');
	});

	it('asks the relative minor for its numerals even though it holds a scale', () => {
		// The rung says yes and the scale inside it says no, which is the whole
		// reason the item gets a say: i, iv and v are degrees like any other.
		const [scale, tonic] = itemsForRung('relative-minor', STAGES[0]);
		expect(directionsForItem('relative-minor', scale)).not.toContain('degree_play');
		expect(directionsForItem('relative-minor', tonic)).toContain('degree_play');
		expect(tonic.degree).toBe('i');
	});

	it('asks a numeral of every item that carries one, and of no other', () => {
		for (const stage of STAGES) {
			for (const rung of RUNGS) {
				for (const item of itemsForRung(rung.id, stage)) {
					const asked = directionsForItem(rung.id, item).includes('degree_play');
					expect(asked, `${stage.key}/${rung.id}/${item.label}`).toBe(Boolean(item.degree));
				}
			}
		}
	});

	it('never asks the relative minor to name the scale it holds', () => {
		// The refusal above is written for the scale *rung*, and the relative minor
		// is a chord rung with a scale inside it — so its scale item was handed the
		// whole chord list and made a card asking you to name the A minor scale.
		// On an account that had opened only C the buttons beside it were *C scale*
		// and *Am scale*, which are the same seven notes.
		const [scale, tonic] = itemsForRung('relative-minor', STAGES[0]);
		expect(scale.kind).toBe('scale');
		expect(directionsForItem('relative-minor', scale)).not.toContain('hear_name');
		expect(directionsForItem('relative-minor', tonic)).toContain('hear_name');
	});

	it('asks for a name only where there is a chord to name it with', () => {
		// The same rule as the numerals, one field along: `chord` is what a triad
		// and a seventh carry and a scale does not.
		for (const stage of STAGES) {
			for (const rung of RUNGS) {
				for (const item of itemsForRung(rung.id, stage)) {
					const asked = directionsForItem(rung.id, item).includes('hear_name');
					expect(asked, `${stage.key}/${rung.id}/${item.label}`).toBe(
						directionsForRung(rung.id).includes('hear_name') && Boolean(item.chord)
					);
				}
			}
		}
	});
});

describe('moving along', () => {
	it('starts at C, on the scale', () => {
		expect(FIRST_POSITION.stage.key).toBe('C');
		expect(FIRST_POSITION.rung.id).toBe('scale');
	});

	it('opens one rung in one key and nothing else', () => {
		expect(cellsOf(FIRST_FRONTIER)).toEqual([{ key: 'C', rungId: 'scale' }]);
		expect(depthOf(FIRST_FRONTIER)).toBe(1);
	});
});

describe('the frontier', () => {
	const after = (moves: number): Frontier => {
		let frontier = FIRST_FRONTIER;
		for (let i = 0; i < moves; i++) frontier = deepen(frontier) ?? frontier;
		return frontier;
	};

	/*
	 * The whole of "widen before you deepen", asserted as arithmetic. Going one
	 * rung deeper drags every rung above it one key wider, so the staircase
	 * builds itself and being deep-and-narrow is unreachable.
	 */
	it('widens everything above it when it deepens', () => {
		expect(after(0).widths).toEqual([1, 0, 0, 0, 0, 0, 0]);
		expect(after(1).widths).toEqual([2, 1, 0, 0, 0, 0, 0]);
		expect(after(3).widths).toEqual([4, 3, 2, 1, 0, 0, 0]);
		expect(after(6).widths).toEqual([7, 6, 5, 4, 3, 2, 1]);
	});

	it('reaches every rung in as many moves as the old walk did', () => {
		// Seven steps got you seven rungs before, in one key. It still does — with
		// twenty-one cells of breadth underneath that the old walk did not have.
		expect(depthOf(after(6))).toBe(RUNGS.length);
		expect(cellsOf(after(6))).toHaveLength(28);
	});

	it('stops deepening at the last rung', () => {
		expect(deepen(after(6))).toBeNull();
	});

	it('stays a staircase however it is moved', () => {
		let frontier: Frontier = FIRST_FRONTIER;
		for (let i = 0; i < 40; i++) {
			frontier = deepen(frontier) ?? widenNext(frontier) ?? frontier;
			expect(isWellFormed(frontier), `after ${i + 1} moves`).toBe(true);
		}
	});

	it('refuses a widening that would break the staircase', () => {
		// Rung two is open in one key and rung one in two. Widening rung two to
		// two is legal; widening it again would put it ahead of rung one.
		const frontier = after(1);
		const once = widen(frontier, 1)!;
		expect(once.widths).toEqual([2, 2, 0, 0, 0, 0, 0]);
		expect(widen(once, 1)).toBeNull();
	});

	/*
	 * The dead end, found by opening the page rather than by a test. An account
	 * standing at G's third rung migrates to [2,2,2,1,1,1,1]: every rung open, so
	 * nothing to deepen, and the last four rungs level with each other, so the
	 * deepest one cannot widen either. Asking only the deepest rung offers the
	 * person nothing at all, on a frontier with two legal moves in it.
	 */
	it('widens the deepest rung that can, not merely the deepest rung', () => {
		const stuck: Frontier = { widths: [2, 2, 2, 1, 1, 1, 1] };
		expect(deepen(stuck)).toBeNull();
		expect(widen(stuck, 6)).toBeNull();

		const target = nextWidening(stuck)!;
		expect(target.rungIndex).toBe(3);
		// Rung four is open in C alone, so the key it gains is the next one along.
		expect(target.stage.key).toBe('G');
		expect(widenNext(stuck)!.widths).toEqual([2, 2, 2, 2, 1, 1, 1]);
	});

	it('always offers somewhere to go until the whole ladder is open', () => {
		let frontier: Frontier = FIRST_FRONTIER;
		for (let i = 0; i < STAGES.length * RUNGS.length; i++) {
			const next = deepen(frontier) ?? widenNext(frontier);
			if (!next) break;
			frontier = next;
		}
		// Only the complete ladder is allowed to be a dead end.
		expect(deepen(frontier)).toBeNull();
		expect(widenNext(frontier)).toBeNull();
		expect(frontier.widths).toEqual(RUNGS.map(() => STAGES.length));
	});

	it('refuses to widen a rung that is not open, or past the twelfth key', () => {
		expect(widen(FIRST_FRONTIER, 3)).toBeNull();
		expect(widen({ widths: RUNGS.map(() => STAGES.length) }, 0)).toBeNull();
	});

	it('never opens a rung in a key whose shallower rungs are closed', () => {
		const frontier = after(4);
		for (const cell of cellsOf(frontier)) {
			const r = RUNGS.findIndex((rung) => rung.id === cell.rungId);
			for (let above = 0; above < r; above++) {
				expect(isOpen(frontier, cell.key, RUNGS[above].id), `${cell.key} ${cell.rungId}`).toBe(
					true
				);
			}
		}
	});

	it('counts the rungs open in one key, for a swatch to print', () => {
		expect(rungsOpenIn(after(3), 'C')).toBe(4);
		expect(rungsOpenIn(after(3), 'D')).toBe(1);
		expect(rungsOpenIn(after(3), 'Gb')).toBe(0);
		expect(rungsOpenIn(after(3), 'nonsense')).toBe(0);
	});

	it('stands on the deepest rung, in the newest key of it', () => {
		const here = workingPosition(after(3));
		expect(here.rung.id).toBe(RUNGS[3].id);
		expect(here.stage.key).toBe('C');
	});

	it('offers the next rung as the thing to open next, and nothing at the end', () => {
		expect(nextCell(FIRST_FRONTIER)).toEqual({ key: 'C', rungId: RUNGS[1].id });
		expect(nextCell(after(6))).toBeNull();
	});

	it('steps back a key at a time, then closes the rung, and never the last cell', () => {
		const wide = widenNext(after(1))!;
		expect(wide.widths).toEqual([2, 2, 0, 0, 0, 0, 0]);
		expect(narrower(wide)!.widths).toEqual([2, 1, 0, 0, 0, 0, 0]);
		expect(narrower(narrower(wide)!)!.widths).toEqual([2, 0, 0, 0, 0, 0, 0]);
		expect(narrower({ widths: [1, 0, 0, 0, 0, 0, 0] })).toBeNull();
	});

	it('rejects a frontier that is not a staircase', () => {
		expect(isWellFormed({ widths: [1, 2, 0, 0, 0, 0, 0] })).toBe(false);
		expect(isWellFormed({ widths: [0, 0, 0, 0, 0, 0, 0] })).toBe(false);
		expect(isWellFormed({ widths: [1, 0, 0] })).toBe(false);
		expect(isWellFormed({ widths: [13, 0, 0, 0, 0, 0, 0] })).toBe(false);
		expect(isWellFormed({ widths: [1.5, 0, 0, 0, 0, 0, 0] })).toBe(false);
	});
});

describe('migrating a stored position', () => {
	/*
	 * The upgrade, and it has to be exact rather than close. Every one of the
	 * eighty-four positions an account could have been stored at names a prefix
	 * of the old walk; the frontier it becomes must enumerate that same prefix,
	 * or somebody loses ground on the morning they update.
	 */
	const oldPrefix = (stage: number, rung: number) => {
		const out: string[] = [];
		for (let s = 0; s <= stage; s++) {
			const last = s === stage ? rung : RUNGS.length - 1;
			for (let r = 0; r <= last; r++) out.push(`${STAGES[s].key}|${RUNGS[r].id}`);
		}
		return out.sort();
	};

	it('holds exactly the cells the old walk had reached, everywhere', () => {
		for (let s = 0; s < STAGES.length; s++) {
			for (let r = 0; r < RUNGS.length; r++) {
				const frontier = frontierFromPosition(STAGES[s].key, RUNGS[r].id)!;
				const cells = cellsOf(frontier)
					.map((cell) => `${cell.key}|${cell.rungId}`)
					.sort();
				expect(cells, `${STAGES[s].key} / ${RUNGS[r].id}`).toEqual(oldPrefix(s, r));
			}
		}
	});

	it('produces a well-formed staircase from every position', () => {
		for (const stage of STAGES) {
			for (const rung of RUNGS) {
				expect(isWellFormed(frontierFromPosition(stage.key, rung.id)!)).toBe(true);
			}
		}
	});

	it('refuses a position that names nothing', () => {
		expect(frontierFromPosition('H', 'scale')).toBeNull();
		expect(frontierFromPosition('C', 'nonsense')).toBeNull();
	});

	it('leaves somebody at the very beginning at the very beginning', () => {
		expect(frontierFromPosition('C', 'scale')).toEqual(FIRST_FRONTIER);
	});
});

describe('identity', () => {
	it('is stable, so regenerating matches existing cards', () => {
		const [item] = itemsForRung('tonic-triad', STAGES[0]);
		expect(ladderIdentity('C', 'tonic-triad', item, 'see_play')).toBe(
			ladderIdentity('C', 'tonic-triad', item, 'see_play')
		);
	});

	it('differs per key, rung and direction', () => {
		const [c] = itemsForRung('tonic-triad', STAGES[0]);
		const [g] = itemsForRung('tonic-triad', STAGES[1]);
		const ids = new Set([
			ladderIdentity('C', 'tonic-triad', c, 'see_play'),
			ladderIdentity('G', 'tonic-triad', g, 'see_play'),
			ladderIdentity('C', 'tonic-triad', c, 'hear_play')
		]);
		expect(ids.size).toBe(3);
	});
});

describe('reading a frontier back off the card bank', () => {
	/*
	 * The repair. A settings row that lost its `ladderWidths` re-derived a legacy
	 * position on every request and sat there, while the card bank went on holding
	 * proof of everywhere that had ever been opened. These are the rules that turn
	 * that proof back into a staircase.
	 */
	it('is well formed, whatever order the cells arrive in', () => {
		const frontier = frontierCovering([
			{ key: 'F', rungId: 'scale' },
			{ key: 'C', rungId: 'all-sevenths' },
			{ key: 'G', rungId: 'scale' },
			{ key: 'C', rungId: 'tonic-triad' }
		]);
		expect(isWellFormed(frontier)).toBe(true);
	});

	it('restores the rungs underneath a deep cell that lost them', () => {
		// Only the deepest cell survives, and the four rungs it stands on must come
		// back with it — nobody reaches the sevenths of C without its scale.
		const frontier = frontierCovering([{ key: 'C', rungId: 'all-sevenths' }]);
		expect(frontier.widths).toEqual([1, 1, 1, 1, 1, 1, 0]);
	});

	it('counts breadth by how far along the ladder each key sits', () => {
		// F is the third stage, so a scale in F means the scale rung is open in
		// three keys — the two before it were opened to get there.
		const frontier = frontierCovering([
			{ key: 'F', rungId: 'scale' },
			{ key: 'C', rungId: 'tonic-triad' }
		]);
		expect(frontier.widths[0]).toBe(3);
		expect(frontier.widths[1]).toBe(1);
	});

	it('round-trips every cell it was given', () => {
		const cells = cellsOf({ widths: [4, 3, 3, 2, 1, 1, 0] });
		expect(cellsOf(frontierCovering(cells))).toEqual(cells);
	});

	it('leaves somewhere to stand when the bank is empty', () => {
		expect(frontierCovering([])).toEqual(FIRST_FRONTIER);
	});

	it('ignores keys and rungs it does not know', () => {
		expect(frontierCovering([{ key: 'H', rungId: 'nonsense' }])).toEqual(FIRST_FRONTIER);
	});

	it('never takes ground away when merged with what was stored', () => {
		const stored: Frontier = { widths: [3, 2, 1, 0, 0, 0, 0] };
		const evidence = frontierCovering([{ key: 'C', rungId: 'all-triads' }]);
		const merged = widest(stored, evidence);
		expect(merged.widths).toEqual([3, 2, 1, 1, 0, 0, 0]);
		expect(isWellFormed(merged)).toBe(true);
	});
});

describe('which minor keys the ladder has actually opened', () => {
	/*
	 * The complaint this answers, in one line: *I tried a lesson on "relative
	 * minor" in the C scale and then had to play St. James Infirmary that had Cmin
	 * and Fmin, which is not part of A minor*. Quite right. The ladder teaches C's
	 * relative minor, which is A minor — the same seven notes. It has never taught
	 * C minor, and on this ladder C minor belongs to the E-flat stage.
	 */
	it('is empty until the relative minor rung is open', () => {
		expect(minorKeysReached(cellsOf({ widths: [2, 2, 2, 1, 1, 1, 0] }))).toEqual([]);
	});

	it('is the relative minor, never the parallel', () => {
		const reached = cellsOf({ widths: [2, 1, 1, 1, 1, 1, 1] });
		expect(minorKeysReached(reached)).toEqual(['A']);
		expect(minorKeysReached(reached)).not.toContain('C');
	});

	it('opens one minor key per stage, in the ladder’s order', () => {
		expect(minorKeysReached(cellsOf({ widths: [3, 3, 3, 3, 3, 3, 3] }))).toEqual(['A', 'E', 'D']);
	});

	it('reaches C minor only through E-flat, which is where it lives', () => {
		// Seven keys deep: the E-flat stage is the seventh, and its relative minor
		// is C minor. So the tune the complaint named becomes legal here, honestly.
		expect(minorKeysReached(cellsOf({ widths: [7, 7, 7, 7, 7, 7, 7] }))).toContain('C');
		expect(minorKeysReached(cellsOf({ widths: [6, 6, 6, 6, 6, 6, 6] }))).not.toContain('C');
	});

	it('names the relative of a key whether or not it is open', () => {
		expect(relativeMinorOf('C')).toBe('A');
		expect(relativeMinorOf('Eb')).toBe('C');
		expect(relativeMinorOf('nowhere')).toBeNull();
	});
});

describe('the scale item ascends', () => {
	it('carries the octave where the letters wrap round', () => {
		// G major used to come back as G4 A4 B4 C4 D4 E4 F♯4 — three notes up and
		// then an octave down — because `scale` and `midi` between them do not
		// carry. Nothing heard it, because `drill.ts` rebuilds the voicing from the
		// stored root; the session's keyboard was the first thing to read it raw.
		for (const stage of STAGES) {
			const voicing = itemsForRung('scale', stage)[0].answerVoicing ?? [];
			expect(voicing).toHaveLength(8);
			for (let i = 1; i < voicing.length; i++) {
				expect(voicing[i], `${stage.key} at ${i}`).toBeGreaterThan(voicing[i - 1]);
			}
			// One octave exactly, tonic to tonic.
			expect(voicing[voicing.length - 1] - voicing[0]).toBe(12);
		}
	});
});

describe('which cell a move opened', () => {
	/*
	 * The board has to be able to send you to the thing you just pressed, and
	 * only the frontiers know whether the press did anything. Asked of the pair
	 * rather than of the form, because both moves refuse what would break the
	 * staircase.
	 */
	it('names the new line, at the first key, when the ladder deepens', () => {
		const from = FIRST_FRONTIER;
		const to = deepen(from) as Frontier;
		expect(openedCell(from, to)).toEqual({ key: 'C', rungId: RUNGS[1].id });
	});

	it('names the key a widening reached, on the line that reached it', () => {
		// The scale is open in C alone, so widening it opens the second stage.
		const from = FIRST_FRONTIER;
		const to = widen(from, 0) as Frontier;
		expect(openedCell(from, to)).toEqual({ key: STAGES[1].key, rungId: RUNGS[0].id });
	});

	it('prefers the line that was shut over the ones deepening widened', () => {
		// Deepening also drags every rung above it one key wider. The move was
		// about the idea, not about the extra ground underneath it.
		const from = deepen(FIRST_FRONTIER) as Frontier;
		const to = deepen(from) as Frontier;
		expect(openedCell(from, to)).toEqual({ key: 'C', rungId: RUNGS[2].id });
	});

	it('is null when nothing moved', () => {
		expect(openedCell(FIRST_FRONTIER, FIRST_FRONTIER)).toBeNull();
	});
});

describe('stations, and the two spellings one of them answers to', () => {
	it('finds the station a major key is', () => {
		expect(stationHolding('C')).toBe('C');
		expect(stationHolding('Gb')).toBe('Gb');
	});

	it('finds the station a relative minor sits at', () => {
		expect(stationHolding('Am')).toBe('C');
		expect(stationHolding('Ebm')).toBe('Gb');
	});

	/*
	 * The ambiguity this deliberately refuses to guess at. `minorKeysReached`
	 * hands out bare tonics for missions, and `D` is both D major's own station
	 * and the tonic of F's relative minor. Reading it would put D major's cards
	 * at F's stop.
	 */
	it('reads a bare minor tonic as the major key of that name, and nothing else', () => {
		expect(stationHolding('D')).toBe('D');
		expect(stationHolding('F#')).toBeNull();
	});

	it('lists both spellings a station’s cards are stored under', () => {
		expect(keysAtStation('C')).toEqual(['C', 'Am']);
		expect(keysAtStation('Am')).toEqual(['C', 'Am']);
	});

	it('every station answers to its own two names and to no other station’s', () => {
		for (const stage of STAGES) {
			const names = keysAtStation(stage.key);
			expect(names).toEqual([stage.key, stage.relativeMinor]);
			for (const other of STAGES) {
				if (other.key === stage.key) continue;
				expect(names).not.toContain(other.relativeMinor);
			}
		}
	});

	it('hands back a name it cannot place, so a filter built on it holds nothing extra', () => {
		expect(keysAtStation('H')).toEqual(['H']);
	});
});
