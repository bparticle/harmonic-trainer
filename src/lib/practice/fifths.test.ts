import { describe, expect, it } from 'vitest';
import { buildRound, FIFTHS_WAVES, MIXED_WAVE } from './fifths';

describe('Fifths arcade', () => {
	it('introduces the keys in order from C and keeps different signatures at shared positions', () => {
		expect(FIFTHS_WAVES.map((wave) => wave.keys.map((key) => key.signature))).toEqual([
			[0, 1, -1],
			[2, -2, 3, -3],
			[4, -4, 5, -5, 6, -6],
			[7, -7],
			[]
		]);
		const keys = FIFTHS_WAVES.flatMap((wave) => wave.keys);
		expect(new Set(keys.map((key) => key.position)).size).toBe(12);
		for (const [position, names] of [
			[5, ['B', 'C♭']],
			[6, ['F♯', 'G♭']],
			[7, ['D♭', 'C♯']]
		] as const) {
			expect(keys.filter((key) => key.position === position).map((key) => key.name)).toEqual(names);
		}
	});

	it('opens each teaching wave with its new positions and uses only introduced keys', () => {
		for (const [wave, { keys }] of FIFTHS_WAVES.slice(0, MIXED_WAVE).entries()) {
			const known = FIFTHS_WAVES.slice(0, wave + 1).flatMap((entry) => entry.keys);
			const round = buildRound(wave, () => 0.5);
			expect(round.slice(0, keys.length)).toEqual(
				keys.map((target) => ({ kind: 'position', target }))
			);
			for (const shot of round) {
				expect(known).toContain(shot.target);
				if ('choices' in shot) {
					expect(shot.choices.every((choice) => known.includes(choice))).toBe(true);
				}
			}
		}
	});

	it('mixes four recall modes and travels in both directions using the spelled fifth', () => {
		const round = buildRound(MIXED_WAVE, () => 0.2);
		expect(round).not.toEqual(buildRound(MIXED_WAVE, () => 0.8));
		const keyPrompts = round.filter((shot) =>
			['position', 'name', 'signature'].includes(shot.kind)
		);
		expect(new Set(keyPrompts.map((shot) => shot.target.signature)).size).toBe(15);
		expect(round.filter((shot) => shot.kind === 'signature-position')).toHaveLength(5);
		const turns = round.filter((shot) => shot.kind === 'neighbor');
		expect(turns.filter((shot) => shot.direction === 1)).toHaveLength(3);
		expect(turns.filter((shot) => shot.direction === -1)).toHaveLength(3);
		for (const shot of turns) {
			expect(shot.target.signature).toBe(shot.from.signature + shot.direction);
			expect(shot.target.position).toBe((shot.from.position + shot.direction + 12) % 12);
		}
		for (const shot of round) {
			if ('choices' in shot) {
				expect(new Set(shot.choices).size).toBe(4);
				expect(shot.choices).toContain(shot.target);
			}
		}
	});
});
