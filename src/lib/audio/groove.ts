import {
	closeVoicing,
	degreeInterval,
	rootlessVoicing,
	type AbstractChord
} from '$lib/music/chord';
import { midi } from '$lib/music/note';
import type { BarChord } from './bass';

/**
 * Drums and comping.
 *
 * Both are written as plain event lists in beats, with no reference to Tone.js
 * or to a clock — the transport turns them into sound. That keeps the musical
 * decisions testable and means a pattern can be inspected, printed or drawn
 * without anything having to make a noise.
 */

export type Feel = 'swing' | 'straight';

export type DrumHit = {
	instrument: 'ride' | 'hihat' | 'kick' | 'snare';
	/** Beats from the start, fractional for offbeats. */
	beat: number;
	/** 0–1. */
	velocity: number;
};

/**
 * Where the swung eighth falls.
 *
 * Two thirds of the way through the beat, which is the triplet feel written as
 * eighths. Straight feel puts it at a half. This single number is most of the
 * difference between a jazz drummer and a metronome.
 */
export const SWING_OFFSET = 2 / 3;
export const STRAIGHT_OFFSET = 1 / 2;

export function offsetFor(feel: Feel): number {
	return feel === 'swing' ? SWING_OFFSET : STRAIGHT_OFFSET;
}

/**
 * The ride pattern.
 *
 * Quarters throughout with an extra stroke after beats two and four — the
 * "spang-a-lang" that carries the time. Hi-hat closes on two and four, which is
 * where the pulse actually is in this music.
 */
export function drumPattern(beats: number, feel: Feel = 'swing'): DrumHit[] {
	const hits: DrumHit[] = [];
	const offset = offsetFor(feel);

	for (let beat = 0; beat < beats; beat++) {
		const inBar = beat % 4;
		const downbeat = inBar === 0;

		hits.push({ instrument: 'ride', beat, velocity: downbeat ? 0.85 : 0.62 });

		// The skip note after two and four.
		if (inBar === 1 || inBar === 3) {
			hits.push({ instrument: 'ride', beat: beat + offset, velocity: 0.5 });
		}

		if (inBar === 1 || inBar === 3) {
			hits.push({ instrument: 'hihat', beat, velocity: 0.7 });
		}

		// Sparse feet: the bass is already stating every beat.
		if (downbeat && beat % 8 === 0) {
			hits.push({ instrument: 'kick', beat, velocity: 0.45 });
		}
	}

	return hits;
}

export type CompHit = {
	/** MIDI notes sounding together. */
	notes: number[];
	beat: number;
	/** Beats to hold it. */
	duration: number;
	velocity: number;
};

/**
 * Comping.
 *
 * Deliberately sparse and off the beat: it is there to imply the harmony, not
 * to fill the bar. Muting it is a first-class option, because the whole point
 * of practising over a backing is often to comp for yourself — and two people
 * comping is one too many.
 *
 * Rootless voicings where the chord has a seventh to build them from, and the
 * triad without its root otherwise. Either way the bass has the root already.
 */
export function compPattern(bars: BarChord[], feel: Feel = 'swing'): CompHit[] {
	const hits: CompHit[] = [];
	const offset = offsetFor(feel);
	let beat = 0;
	let form: 'A' | 'B' = 'A';

	for (const [index, bar] of bars.entries()) {
		const notes = voicingFor(bar.chord, form);
		if (notes.length) {
			// Alternating placement: on the beat, then pushed just before the next
			// bar. Landing in the same place every time turns into a tic.
			const onBeat = index % 2 === 0;
			hits.push({
				notes,
				beat: onBeat ? beat : beat + Math.max(0, bar.beats - 1) + offset,
				duration: Math.min(2, bar.beats),
				velocity: 0.42
			});
			// Alternating the form keeps the hand still between chords.
			form = form === 'A' ? 'B' : 'A';
		}
		beat += bar.beats;
	}

	return hits;
}

function voicingFor(chord: AbstractChord, form: 'A' | 'B'): number[] {
	// A triad has no seventh, so there is no rootless voicing to build. Its third
	// and fifth still say everything the bass is not already saying.
	if (!degreeInterval(chord, 7)) return closeVoicing(chord, 4).map(midi).slice(1);
	return rootlessVoicing(chord, form, 4).map(midi);
}

/** Four beats of clicks before the first bar. */
export function countInHits(beats = 4): DrumHit[] {
	return Array.from({ length: beats }, (_, i) => ({
		instrument: 'hihat' as const,
		beat: i - beats,
		velocity: i === 0 ? 0.9 : 0.6
	}));
}
