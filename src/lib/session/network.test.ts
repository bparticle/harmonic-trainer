import { describe, expect, it } from 'vitest';
import {
	FIRST_FRONTIER,
	RUNGS,
	STAGES,
	deepen,
	widen,
	widenNext,
	type Frontier
} from '$lib/curriculum/ladder';
import { columnOf, stageAtAccidentals } from '$lib/curriculum/atlas';
import { ladderPath } from './journey';
import { keyStandings } from './warmth';
import { borrowColumn, network, stationOf } from './network';

/** A frontier `moves` deepenings past the start. */
const after = (moves: number): Frontier => {
	let frontier = FIRST_FRONTIER;
	for (let i = 0; i < moves; i++) frontier = deepen(frontier) ?? frontier;
	return frontier;
};

const draw = (frontier: Frontier, rows: Array<{ key: string; chords: number }> = []) =>
	network(ladderPath(frontier, []), keyStandings(rows, frontier, 0));

describe('network', () => {
	it('draws the twelve stations in map order whatever the frontier', () => {
		for (const frontier of [FIRST_FRONTIER, after(3), after(7)]) {
			const net = draw(frontier);
			expect(net.stations).toHaveLength(STAGES.length);
			expect(net.stations.map((s) => s.column)).toEqual([...Array(12).keys()]);
			expect(net.stations[6].key).toBe('C');
		}
	});

	it('puts one line on the map on the first morning, one stop long', () => {
		const net = draw(FIRST_FRONTIER);
		const [scale, home] = net.lines;

		expect(scale.stops).toBe(1);
		expect(scale.from).toBe(columnOf(STAGES[0]));
		expect(scale.to).toBe(scale.from);

		expect(home.stops).toBe(0);
		expect(home.from).toBeNull();
		expect(net.stations.filter((s) => s.onNetwork).map((s) => s.key)).toEqual(['C']);
	});

	it('grows into an arrowhead centred on C', () => {
		// Seven deepenings gives [7, 6, 5, 4, 3, 2, 1], and every line is centred
		// on C because the ladder alternates sides as it widens.
		const net = draw(after(7));
		expect(net.lines.map((line) => line.stops)).toEqual([7, 6, 5, 4, 3, 2, 1]);

		for (const line of net.lines) {
			expect(line.from).not.toBeNull();
			expect(line.from!).toBeLessThanOrEqual(columnOf(STAGES[0]));
			expect(line.to!).toBeGreaterThanOrEqual(columnOf(STAGES[0]));
		}

		// Never narrower going down. The staircase, read as widths on the page.
		const widths = net.lines.map((line) => line.to! - line.from!);
		for (let i = 1; i < widths.length; i++) expect(widths[i]).toBeLessThanOrEqual(widths[i - 1]);
	});

	it('points each stub at the key the ladder would actually add next', () => {
		const net = draw(after(7));

		// A line reaching three sharps extends to a fourth sharp; the one below it
		// extends to a third flat. The stub alternates because the ladder does.
		expect(net.lines[0].next?.key).toBe(STAGES[7].key);
		expect(net.lines[1].next?.key).toBe(STAGES[6].key);
		expect(net.lines[0].next!.column).toBeGreaterThan(net.lines[0].to!);
		expect(net.lines[1].next!.column).toBeLessThan(net.lines[1].from!);
	});

	it('draws a stub only where the frontier would actually allow one', () => {
		// The shape that started this: three lines whose next key is F, and only
		// the top one may take it without standing wider than the rung above.
		const net = network(
			ladderPath({ widths: [2, 2, 2, 1, 1, 1, 1] }, []),
			keyStandings([], { widths: [2, 2, 2, 1, 1, 1, 1] }, 0)
		);

		expect(net.lines.map((line) => line.next?.key ?? null)).toEqual([
			'F',
			null,
			null,
			'G',
			null,
			null,
			null
		]);
	});

	it('never draws a stub the ladder would refuse, at any frontier', () => {
		let frontier = FIRST_FRONTIER;
		for (let move = 0; move < 60; move++) {
			const net = draw(frontier);
			for (const line of net.lines) {
				if (!line.next) continue;
				expect(widen(frontier, line.index)).not.toBeNull();
			}
			frontier = (move % 3 === 0 ? deepen(frontier) : widenNext(frontier)) ?? frontier;
		}
	});

	it('agrees with the frontier about where the next stop goes', () => {
		let frontier = after(4);
		for (let step = 0; step < 20; step++) {
			const target = widenNext(frontier);
			if (!target) break;
			const before = draw(frontier);
			frontier = target;
			const grown = draw(frontier);

			// Exactly one line gained exactly one stop, and it is the one whose stub
			// was pointing at the key that is now on it.
			const changed = grown.lines.filter((line, i) => line.stops !== before.lines[i].stops);
			expect(changed).toHaveLength(1);
			expect(changed[0].keys).toContain(before.lines[changed[0].index].next?.key);
		}
	});

	it('names the line that would open next, and stops naming one at the bottom', () => {
		expect(draw(FIRST_FRONTIER).opensNext?.rungId).toBe(RUNGS[1].id);
		expect(draw(after(3)).opensNext?.rungId).toBe(RUNGS[4].id);
		expect(draw(after(7)).opensNext).toBeNull();
	});

	it('counts cells rather than steps, because a frontier is a set', () => {
		const net = draw(after(7));
		expect(net.cells).toBe(28);
		expect(net.total).toBe(STAGES.length * RUNGS.length);
		expect(net.fill).toBeCloseTo(28 / 84);
	});

	it('makes a station an interchange of however many lines call there', () => {
		const net = draw(after(7));
		expect(stationOf(net, 'C')?.lines).toBe(7);
		expect(stationOf(net, 'G')?.lines).toBe(6);
		expect(stationOf(net, 'Eb')?.lines).toBe(1);
		expect(stationOf(net, 'B')?.lines).toBe(0);
		expect(stationOf(net, 'B')?.onNetwork).toBe(false);
	});

	it('carries the record onto the stations without recomputing it', () => {
		const net = draw(after(7), [
			{ key: 'C', chords: 400 },
			{ key: 'G mixolydian', chords: 100 }
		]);

		expect(stationOf(net, 'C')?.chords).toBe(400);
		expect(stationOf(net, 'C')?.fresh).toBe(false);
		expect(stationOf(net, 'G')?.chords).toBe(100);
		// Opened but never played is not the same as never opened.
		expect(stationOf(net, 'F')?.fresh).toBe(true);
		expect(stationOf(net, 'F')?.onNetwork).toBe(true);
	});

	it('holds the two ends of the loop', () => {
		const net = draw(after(7));
		expect(net.stations[net.ends.flat].key).toBe('Gb');
		expect(net.stations[net.ends.sharp].key).toBe('B');
	});
});

describe('borrowColumn', () => {
	it('leaves a borrow where it is when the departure is C', () => {
		expect(borrowColumn(3, 0)).toBe(columnOf(stageAtAccidentals(3)));
	});

	it('moves every borrow with the departure, by the same number of stops', () => {
		// The ragtime III7 is borrowed from A in C, and from C in E flat — three
		// stops sharp of wherever you are standing.
		expect(borrowColumn(3, -3)).toBe(columnOf(stageAtAccidentals(0)));
		expect(borrowColumn(2, -3)).toBe(columnOf(stageAtAccidentals(-1)));
	});

	it('wraps rather than walking off the end', () => {
		// The tritone substitution is six stops out from wherever home is, and
		// six stops out from G flat is C.
		expect(borrowColumn(-6, -6)).toBe(columnOf(stageAtAccidentals(0)));
	});
});
