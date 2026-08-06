import { describe, expect, it } from 'vitest';
import { formatNote, pitchClass } from '$lib/music/note';
import { key } from '$lib/music/key';
import { spell } from '$lib/music/spell';
import { wheelNoteName } from './geometry';

const name = (pc: number) => formatNote(wheelNoteName(pc));

describe('the wheel’s painted labels', () => {
	it('uses the conventional shortest spelling for all twelve', () => {
		const labels = Array.from({ length: 12 }, (_, pc) => name(pc));
		expect(labels).toEqual([
			'C',
			'Db',
			'D',
			'Eb',
			'E',
			'F',
			'F#',
			'G',
			'Ab',
			'A',
			'Bb',
			'B'
		]);
	});

	it('never changes, whatever key is in play', () => {
		// This is the whole point: rotating the wheel to Gb must not rewrite F#.
		const reference = Array.from({ length: 12 }, (_, pc) => name(pc));
		for (const tonic of ['C', 'Gb', 'F#', 'B', 'Eb', 'Db', 'A']) {
			void key(tonic);
			expect(
				Array.from({ length: 12 }, (_, pc) => name(pc)),
				tonic
			).toEqual(reference);
		}
	});

	it('spells each label as the pitch class it sits on', () => {
		for (let pc = 0; pc < 12; pc++) {
			expect(pitchClass(wheelNoteName(pc)), String(pc)).toBe(pc);
		}
	});

	it('never uses a double accidental', () => {
		for (let pc = 0; pc < 12; pc++) {
			expect(Math.abs(wheelNoteName(pc).alter)).toBeLessThanOrEqual(1);
		}
	});

	it('uses one letter per label, all seven represented', () => {
		const letters = Array.from({ length: 12 }, (_, pc) => wheelNoteName(pc).letter);
		expect(new Set(letters).size).toBe(7);
	});

	it('differs from key-aware spelling, which is why both exist', () => {
		// In Gb major the fourth degree is Cb, but the wheel cell still says B.
		const gFlat = key('Gb');
		expect(formatNote(spell(11, gFlat))).toBe('Cb');
		expect(name(11)).toBe('B');
	});
});
