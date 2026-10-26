import { describe, expect, it } from 'vitest';
import { formatPitch, midi, pitchClass } from '$lib/music/note';
import { SECTIONS, STOPS, STOP_IDS, seeded, stopById, type Item } from './line';
import { isPlain, stepName } from './recipes';

const SEEDS = [1, 7, 42, 1234, 99_999, 0xfffffff0];
const everyItem = (): Array<[string, number, Item]> =>
	STOPS.flatMap((stop) =>
		SEEDS.flatMap((seed) => stop.make(seeded(seed)).map((item) => [stop.id, seed, item] as const))
	) as Array<[string, number, Item]>;

/**
 * Everything asked for sits between C3 and C5, well inside the on-screen
 * keyboard, which runs G2 to E5 so nothing is ever drawn on its very edge.
 */
const LOWEST = 48;
const HIGHEST = 72;

describe('the line', () => {
	it('lists every stop once, in the order of its ids', () => {
		expect(STOPS.map((stop) => stop.id)).toEqual([...STOP_IDS]);
	});

	it('is the same round from the same seed', () => {
		for (const stop of STOPS) {
			expect(stop.make(seeded(5))).toEqual(stop.make(seeded(5)));
		}
	});

	it('varies from one seed to the next where it can', () => {
		const major = stopById('major')!;
		const names = (seed: number) =>
			major
				.make(seeded(seed))
				.map((item) => formatPitch(item.tones[0].note))
				.join(' ');
		expect(new Set(SEEDS.map(names)).size).toBeGreaterThan(1);
	});

	it('asks for something on every item, and every note once', () => {
		for (const [stop, seed, item] of everyItem()) {
			const where = `${stop} #${seed}`;
			expect(item.wanted.length, where).toBeGreaterThan(0);
			const all = [...item.given, ...item.wanted].sort((a, b) => a - b);
			expect(all, where).toEqual(item.tones.map((_, i) => i));
			const pcs = item.tones.map((tone) => pitchClass(tone.note));
			expect(new Set(pcs).size, where).toBe(pcs.length);
		}
	});

	it('counts every distance in keys, from the root it is drawn on', () => {
		for (const [stop, seed, item] of everyItem()) {
			const root = midi(item.tones[0].note);
			for (const tone of item.tones) {
				expect(midi(tone.note) - root, `${stop} #${seed}`).toBe(tone.offset);
			}
		}
	});

	it('only ever asks for keys that are on the screen', () => {
		for (const [stop, seed, item] of everyItem()) {
			for (const tone of item.tones) {
				const key = midi(tone.note);
				expect(key >= LOWEST && key <= HIGHEST, `${stop} #${seed}: ${key}`).toBe(true);
			}
		}
	});

	it('spells everything plainly', () => {
		for (const [stop, seed, item] of everyItem()) {
			for (const tone of item.tones) {
				expect(isPlain(tone.note), `${stop} #${seed}: ${formatPitch(tone.note)}`).toBe(true);
			}
		}
	});

	it('teaches on C before it asks anything else', () => {
		for (const stop of STOPS) {
			const items = stop.make(seeded(3));
			const first = items[0];
			if (first.hint !== 'keys') continue;
			expect(pitchClass(first.tones[0].note), stop.id).toBe(0);
			// And the copying comes before the asking.
			const lastKeys = items.map((item) => item.hint).lastIndexOf('keys');
			expect(
				items.slice(0, lastKeys + 1).every((item) => item.hint === 'keys'),
				stop.id
			).toBe(true);
		}
	});

	it('only hands out a root on the keys when the item is not asking for it', () => {
		for (const [stop, seed, item] of everyItem()) {
			if (item.kind !== 'build') continue;
			expect(item.given.includes(0), `${stop} #${seed}`).toBe(item.hint !== 'name');
		}
	});

	it('morphs by moving the fewest keys', () => {
		for (const [stop, seed, item] of everyItem()) {
			if (item.kind !== 'morph') continue;
			const before = new Set(item.before!.tones.map((tone) => pitchClass(tone.note)));
			for (const i of item.given) {
				expect(before.has(pitchClass(item.tones[i].note)), `${stop} #${seed}`).toBe(true);
			}
			// One key moves, or one is added: never a whole new chord.
			expect(item.wanted.length, `${stop} #${seed}`).toBe(1);
		}
	});

	it('goes all the way round the circle and comes home', () => {
		for (const id of ['clockwise', 'anticlockwise'] as const) {
			const items = stopById(id)!.make(seeded(1));
			expect(items).toHaveLength(12);
			const visited = items.map((item) => pitchClass(item.tones[1].note));
			expect(new Set(visited).size).toBe(12);
			expect(visited.at(-1)).toBe(0);
			// Each hop leaves from where the last one landed.
			for (let i = 1; i < items.length; i++) {
				expect(pitchClass(items[i].tones[0].note)).toBe(visited[i - 1]);
			}
		}
		const order = stopById('clockwise')!
			.make(seeded(1))
			.map((item) => formatPitch(item.tones[1].note, true));
		expect(order).toEqual(['G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F', 'C']);
		const back = stopById('anticlockwise')!
			.make(seeded(1))
			.map((item) => formatPitch(item.tones[1].note, true));
		expect(back).toEqual(['F', 'B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'B', 'E', 'A', 'D', 'G', 'C']);
	});

	it('finds the black key next door to E and B is not there', () => {
		const items = stopById('half')!.make(seeded(1));
		const pairs = items.map((item) => item.tones.map((tone) => formatPitch(tone.note)).join('→'));
		expect(pairs).toContain('E→F');
		expect(pairs).toContain('B→C');
	});

	it('asks for a whole step on every item of the whole-step stop, and nothing else', () => {
		// The first version mixed half steps in as review under the title "Skip
		// one", and the only sign was the small count on the card.
		const letters = 'CDEFGAB';
		for (const seed of SEEDS) {
			for (const item of stopById('whole')!.make(seeded(seed))) {
				expect(item.tones[1].offset, `#${seed}`).toBe(2);
				const [from, to] = item.tones.map((tone) => tone.note);
				// Spelled as a major second: the next letter, so C♯ to D♯, not E♭.
				expect((letters.indexOf(to.letter) - letters.indexOf(from.letter) + 7) % 7).toBe(1);
			}
		}
		const pairs = stopById('whole')!
			.make(seeded(1))
			.map((item) => item.tones.map((tone) => formatPitch(tone.note)).join('→'));
		expect(pairs).toContain('E→F#');
		expect(pairs).toContain('B→C#');
	});

	it('names every hop it asks for', () => {
		for (const [stop, seed, item] of everyItem()) {
			if (item.chord) continue;
			expect(stepName(item.tones[1].offset), `${stop} #${seed}`).not.toMatch(/half steps/);
		}
	});

	it('says what every stop teaches before it asks anything', () => {
		const titles = new Set<string>();
		for (const stop of STOPS) {
			expect(stop.title.length, stop.id).toBeGreaterThan(0);
			expect(stop.summary.length, stop.id).toBeGreaterThan(0);
			expect(stop.brief.length, stop.id).toBeGreaterThan(0);
			expect(titles.has(stop.title), stop.title).toBe(false);
			titles.add(stop.title);
		}
	});

	it('keeps each section of the line together, in syllabus order', () => {
		const order = Object.keys(SECTIONS);
		const runs = STOPS.map((stop) => stop.section).filter((s, i, all) => s !== all[i - 1]);
		expect(new Set(runs).size).toBe(runs.length);
		expect(runs).toEqual(order.filter((id) => runs.includes(id as (typeof runs)[number])));
	});

	it('draws every chord example on C, with the moved note where it was', () => {
		// The step examples are not all on C: E to F is the point of one.
		for (const stop of STOPS) {
			for (const figure of stop.figures) {
				if (figure.chord) expect(pitchClass(figure.tones[0].note), stop.id).toBe(0);
				if (figure.ghost) {
					expect(
						figure.tones.some((tone) => tone.offset === figure.ghost!.offset),
						stop.id
					).toBe(false);
				}
			}
		}
	});

	it('spells a third as a third, not as whatever key it lands on', () => {
		for (const seed of SEEDS) {
			for (const item of stopById('thirds')!.make(seeded(seed))) {
				const [root, third] = item.tones.map((tone) => tone.note);
				const letters = 'CDEFGAB';
				expect((letters.indexOf(third.letter) - letters.indexOf(root.letter) + 7) % 7).toBe(2);
			}
		}
	});
});
