import { describe, expect, it } from 'vitest';
import {
	ATOMS,
	atomById,
	atomsForSkill,
	chooseAtom,
	chooseAtomWithFallback,
	realiseAtom
} from './atoms';
import { skillByCode } from '$lib/curriculum/skills';
import { key as makeKey, parseKey } from '$lib/music/key';

const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];

describe('the atoms', () => {
	it('have unique ids', () => {
		const ids = ATOMS.map((a) => a.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('all belong to a skill that exists', () => {
		for (const atom of ATOMS) {
			expect(skillByCode(atom.skillCode), atom.id).toBeDefined();
		}
	});

	it('work in all twelve keys without throwing', () => {
		for (const atom of ATOMS) {
			for (const name of KEYS) {
				expect(() => realiseAtom(atom, parseKey(name)), `${atom.id} in ${name}`).not.toThrow();
			}
		}
	});

	it('are written as a change to something already played', () => {
		// The brief's method: new material grows out of old, or it arrives from
		// nowhere. Every explanation should be addressed to the player and refer
		// to what they already do.
		for (const atom of ATOMS) {
			const text = atom.explain(makeKey('C'));
			expect(text.length, atom.id).toBeGreaterThan(120);
			expect(/\byou\b/i.test(text), `${atom.id} should address the player`).toBe(true);
		}
	});

	it('give something to listen for', () => {
		for (const atom of ATOMS) {
			expect(atom.listenFor.length, atom.id).toBeGreaterThan(20);
		}
	});

	it('transpose: the same atom names different chords in different keys', () => {
		const atom = atomById('guide-tones')!;
		expect(realiseAtom(atom, parseKey('C')).explanation).toContain('Dm7');
		expect(realiseAtom(atom, parseKey('Eb')).explanation).toContain('Fm7');
		expect(realiseAtom(atom, parseKey('B')).explanation).toContain('C#m7');
	});

	it('name the tritone substitute correctly in each key', () => {
		const atom = atomById('tritone-sub')!;
		expect(realiseAtom(atom, parseKey('C')).toSymbols).toContain('Db7');
		expect(realiseAtom(atom, parseKey('F')).toSymbols).toContain('Gb7');
		expect(realiseAtom(atom, parseKey('Eb')).toSymbols).toContain('E7');
	});

	it('borrow the minor four from the parallel minor', () => {
		const atom = atomById('borrowed-four')!;
		expect(realiseAtom(atom, parseKey('C')).toSymbols).toContain('Fm7');
		expect(realiseAtom(atom, parseKey('G')).toSymbols).toContain('Cm7');
	});

	it('give the wheel two shapes to animate between', () => {
		for (const atom of ATOMS) {
			const realised = realiseAtom(atom, makeKey('C'));
			expect(realised.fromPitchClasses.length, atom.id).toBeGreaterThan(0);
			expect(realised.toPitchClasses.length, atom.id).toBeGreaterThan(0);
			for (const pc of [...realised.fromPitchClasses, ...realised.toPitchClasses]) {
				expect(pc).toBeGreaterThanOrEqual(0);
				expect(pc).toBeLessThan(12);
			}
		}
	});

	it('change something between the two shapes, or there is nothing to show', () => {
		// A few atoms are about voicing rather than harmony, and legitimately keep
		// the same notes; the rest must actually move.
		const harmonic = ATOMS.filter(
			(a) => !['drop-the-fifth', 'top-note', 'guide-tones'].includes(a.id)
		);
		for (const atom of harmonic) {
			const realised = realiseAtom(atom, makeKey('C'));
			expect(realised.fromSymbols.join(), atom.id).not.toBe(realised.toSymbols.join());
		}
	});
});

describe('choosing an atom', () => {
	it('returns nothing when no skill is open', () => {
		expect(chooseAtom(null, new Set())).toBeNull();
	});

	it('returns nothing for a skill that is pure drill', () => {
		expect(chooseAtom('L1', new Set())).toBeNull();
	});

	it('picks the first unseen atom of the current skill', () => {
		const atom = chooseAtom('L7', new Set());
		expect(atom).not.toBeNull();
		expect(atom!.skillCode).toBe('L7');
	});

	it('moves on once one has been seen', () => {
		const first = chooseAtom('L7', new Set())!;
		const second = chooseAtom('L7', new Set([first.id]));
		expect(second!.id).not.toBe(first.id);
	});

	it('revisits rather than stalling when all have been seen', () => {
		const all = new Set(atomsForSkill('L7').map((a) => a.id));
		expect(chooseAtom('L7', all)).not.toBeNull();
	});
});

describe('never running out of something to teach', () => {
	const levelOf = (code: string) => skillByCode(code)?.level ?? 99;

	it('falls back when the current skill is pure drill', () => {
		// L1 has no atoms, but block 4 must still have something in it.
		expect(chooseAtom('L1', new Set())).toBeNull();
		expect(chooseAtomWithFallback('L1', new Set(), levelOf)).not.toBeNull();
	});

	it('falls back when the curriculum has not unlocked anything yet', () => {
		// Mastery needs a transfer event, and nothing can transfer before there is
		// transfer detection — so day one must still teach something.
		expect(chooseAtomWithFallback('L0', new Set(), levelOf)).not.toBeNull();
		expect(chooseAtomWithFallback(null, new Set(), levelOf)).not.toBeNull();
	});

	it('prefers the current skill over the fallback', () => {
		expect(chooseAtomWithFallback('L7', new Set(), levelOf)!.skillCode).toBe('L7');
	});

	it('starts the fallback at the lowest level', () => {
		const atom = chooseAtomWithFallback('L0', new Set(), levelOf)!;
		const levels = ATOMS.map((a) => levelOf(a.skillCode));
		expect(levelOf(atom.skillCode)).toBe(Math.min(...levels));
	});

	it('works through the atoms rather than repeating one', () => {
		const seen = new Set<string>();
		for (let i = 0; i < 4; i++) {
			const atom = chooseAtomWithFallback('L0', seen, levelOf)!;
			expect(seen.has(atom.id)).toBe(false);
			seen.add(atom.id);
		}
	});

	it('still gives something once every atom has been seen', () => {
		const all = new Set(ATOMS.map((a) => a.id));
		expect(chooseAtomWithFallback('L0', all, levelOf)).not.toBeNull();
	});
});
