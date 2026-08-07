import {
	chordPitchClasses,
	formatChord,
	type AbstractChord,
	type ChordQuality,
	type Extension
} from './chord';
import { pitchClassDistance } from './interval';
import { pitchClass } from './note';
import { spell } from './spell';
import type { Key } from './key';

/**
 * Voice-leading distance and chord neighbourhoods.
 *
 * This is the machinery behind the wheel's neighbours mode. The canonical example
 * is Gm7 → E♭∆: two chords a single note apart, which is obvious once you can
 * see it and invisible otherwise. Being able to browse outward from a chord you
 * already own — one note, then two — is the app's whole method for growing new
 * material out of old.
 */

/** How many pitch classes differ between two chords. */
export function notesChanged(a: number[], b: number[]): number {
	const setB = new Set(b);
	const outside = a.filter((pc) => !setB.has(pc)).length;
	const setA = new Set(a);
	const incoming = b.filter((pc) => !setA.has(pc)).length;
	return Math.max(outside, incoming);
}

/**
 * Smallest total semitone movement that turns one pitch-class set into the
 * other, over every way of pairing the notes up.
 *
 * Brute force over permutations. The sets here are chords, never more than six
 * or seven notes, so the factorial does not matter and an exact answer is worth
 * more than a clever approximation.
 */
export function voiceLeadingDistance(a: number[], b: number[]): number {
	const from = [...new Set(a)];
	const to = [...new Set(b)];
	if (from.length === 0 || to.length === 0) return Infinity;

	// Pair the smaller set into the larger, then charge the leftovers to their
	// nearest partner — a note that appears from nowhere still had to come from
	// somewhere under the hand.
	const [short, long] = from.length <= to.length ? [from, to] : [to, from];

	let best = Infinity;
	const used = new Array(long.length).fill(false);

	const walk = (index: number, total: number) => {
		if (total >= best) return;
		if (index === short.length) {
			let extra = 0;
			for (let i = 0; i < long.length; i++) {
				if (used[i]) continue;
				extra += Math.min(...short.map((pc) => pitchClassDistance(pc, long[i])));
			}
			best = Math.min(best, total + extra);
			return;
		}
		for (let i = 0; i < long.length; i++) {
			if (used[i]) continue;
			used[i] = true;
			walk(index + 1, total + pitchClassDistance(short[index], long[i]));
			used[i] = false;
		}
	};

	walk(0, 0);
	return best;
}

export type Neighbour = {
	chord: AbstractChord;
	symbol: string;
	/** How many notes have to change. */
	changed: number;
	/** Total semitone movement under the best pairing. */
	distance: number;
	/** The pitch classes that leave and arrive. */
	leaving: number[];
	arriving: number[];
};

/** Chord qualities worth offering as neighbours. Kept to what a jazz hand reaches for. */
const NEIGHBOUR_SHAPES: Array<{ quality: ChordQuality; extensions: Extension[] }> = [
	{ quality: 'maj', extensions: [] },
	{ quality: 'min', extensions: [] },
	{ quality: 'maj', extensions: [7] },
	{ quality: 'min', extensions: [7] },
	{ quality: 'dom', extensions: [] },
	{ quality: 'min7b5', extensions: [7] },
	{ quality: 'dim7', extensions: [] },
	{ quality: 'maj6', extensions: [] },
	{ quality: 'min6', extensions: [] },
	{ quality: 'aug', extensions: [] },
	{ quality: 'sus4', extensions: [7] }
];

/**
 * Every chord reachable from this one by changing at most `maxChanged` notes,
 * ordered by how far the voices actually have to move.
 */
export function neighbours(source: AbstractChord, context: Key, maxChanged = 2): Neighbour[] {
	const sourcePcs = chordPitchClasses(source);
	const sourceSet = new Set(sourcePcs);
	const sourceSymbol = formatChord(source);

	const found: Neighbour[] = [];

	for (let root = 0; root < 12; root++) {
		for (const shape of NEIGHBOUR_SHAPES) {
			const candidate: AbstractChord = {
				root: spell(root, context),
				quality: shape.quality,
				extensions: shape.extensions,
				alterations: []
			};

			const symbol = formatChord(candidate);
			if (symbol === sourceSymbol) continue;

			const pcs = chordPitchClasses(candidate);
			if (pcs.length !== sourcePcs.length) continue;

			const changed = notesChanged(sourcePcs, pcs);
			if (changed === 0 || changed > maxChanged) continue;

			const candidateSet = new Set(pcs);
			found.push({
				chord: candidate,
				symbol,
				changed,
				distance: voiceLeadingDistance(sourcePcs, pcs),
				leaving: sourcePcs.filter((pc) => !candidateSet.has(pc)),
				arriving: pcs.filter((pc) => !sourceSet.has(pc))
			});
		}
	}

	// Two chords can share a spelling by different routes; keep the closest.
	const bySymbol = new Map<string, Neighbour>();
	for (const n of found) {
		const existing = bySymbol.get(n.symbol);
		if (!existing || n.distance < existing.distance) bySymbol.set(n.symbol, n);
	}

	return [...bySymbol.values()].sort(
		(a, b) => a.changed - b.changed || a.distance - b.distance || a.symbol.localeCompare(b.symbol)
	);
}

/** Pitch classes shared by two chords — the notes a hand does not have to move. */
export function commonTones(a: AbstractChord, b: AbstractChord): number[] {
	const setB = new Set(chordPitchClasses(b));
	return chordPitchClasses(a).filter((pc) => setB.has(pc));
}

/** Pitch classes shared by two keys, for the modulation overlay. */
export function sharedPitchClasses(a: number[], b: number[]): number[] {
	const setB = new Set(b.map((pc) => ((pc % 12) + 12) % 12));
	return [...new Set(a.map((pc) => ((pc % 12) + 12) % 12))].filter((pc) => setB.has(pc));
}

/** Root motion between two chords, in fifths, signed and reduced to -6..6. */
export function rootMotionInFifths(a: AbstractChord, b: AbstractChord): number {
	const from = (((pitchClass(a.root) * 7) % 12) + 12) % 12;
	const to = (((pitchClass(b.root) * 7) % 12) + 12) % 12;
	const raw = (((to - from) % 12) + 12) % 12;
	return raw > 6 ? raw - 12 : raw;
}
