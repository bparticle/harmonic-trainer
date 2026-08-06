import type { BarChord } from '$lib/audio/bass';
import { formatChord, type AbstractChord } from '$lib/music/chord';
import { key as makeKey, type Key } from '$lib/music/key';
import type { ChartStyle } from '$lib/server/db/schema';
import { chordFromNumeral } from './progressions';

/**
 * The application vehicles, as chord grids.
 *
 * Generic forms only — twelve-bar blues, minor blues, rhythm changes, modal
 * vamps. Nothing here is a transcription of anyone's tune, and nothing here is
 * anyone's melody. The chart importer is where your own material goes.
 *
 * Grids are stored as Roman numerals rather than chord symbols, so one chart
 * plays in all twelve keys without being rewritten. Bars are grouped into rows
 * of four purely because that is how a chart is read.
 */

export type ChartSeed = {
	slug: string;
	name: string;
	style: ChartStyle;
	defaultBpm: number;
	/** Rows of bars; each bar holds one or two Roman numerals. */
	grid: string[][];
	notes: string;
};

export const CHARTS: ChartSeed[] = [
	{
		slug: 'blues-12',
		name: 'Twelve-bar blues',
		style: 'blues',
		defaultBpm: 120,
		grid: [
			['I7', 'IV7', 'I7', 'I7'],
			['IV7', 'IV7', 'I7', 'I7'],
			['V7', 'IV7', 'I7', 'V7']
		],
		notes:
			'The bare form. Every device in the curriculum can be smuggled into it: the ii–V in bars 9–10, a tritone sub in bar 12, a backdoor into bar 7.'
	},
	{
		slug: 'blues-12-jazz',
		name: 'Twelve-bar blues, jazz changes',
		style: 'blues',
		defaultBpm: 140,
		grid: [
			['I7', 'IV7', 'I7', 'v7 I7'],
			['IV7', '#iv°7', 'I7', 'VI7'],
			['ii7', 'V7', 'I7 VI7', 'ii7 V7']
		],
		notes:
			'The same twelve bars once the ii–Vs have been let in. Bar 8 is a secondary dominant, bar 6 a passing diminished, and the last two bars a turnaround.'
	},
	{
		slug: 'minor-blues-12',
		name: 'Minor blues',
		style: 'minor_blues',
		defaultBpm: 120,
		grid: [
			['i7', 'i7', 'i7', 'i7'],
			['iv7', 'iv7', 'i7', 'i7'],
			['bVI7', 'V7', 'i7', 'V7']
		],
		notes:
			'Forces the half-diminished ii and the altered V to become automatic. Bar 9 is the ♭VI7, which is the tritone sub of the ii.'
	},
	{
		slug: 'rhythm-changes',
		name: 'Rhythm changes',
		style: 'rhythm_changes',
		defaultBpm: 160,
		grid: [
			['I6 vi7', 'ii7 V7', 'I6 vi7', 'ii7 V7'],
			['I7', 'IV7', 'I6 vi7', 'ii7 V7'],
			['I6 vi7', 'ii7 V7', 'I6 vi7', 'ii7 V7'],
			['I7', 'IV7', 'I6 V7/vi', 'ii7 V7'],
			['III7', 'III7', 'VI7', 'VI7'],
			['II7', 'II7', 'V7', 'V7'],
			['I6 vi7', 'ii7 V7', 'I6 vi7', 'ii7 V7'],
			['I7', 'IV7', 'I6 vi7', 'ii7 V7']
		],
		notes:
			'Thirty-two bars, AABA. The A sections are ii–Vs moving twice as fast as feels comfortable; the bridge is nothing but a chain of dominants round the wheel.'
	},
	{
		slug: 'modal-vamp',
		name: 'Modal vamp',
		style: 'modal_vamp',
		defaultBpm: 132,
		grid: [
			['i7', 'i7', 'i7', 'i7'],
			['i7', 'i7', 'i7', 'i7'],
			['bii7', 'bii7', 'i7', 'i7'],
			['i7', 'i7', 'i7', 'i7']
		],
		notes:
			'Dorian, sixteen bars, with a shift up a semitone for two. Nowhere to hide behind harmonic motion, so the voicings and the melody have to carry it.'
	}
];

export function chartBySlug(slug: string): ChartSeed | undefined {
	return CHARTS.find((c) => c.slug === slug);
}

// ---------------------------------------------------------------------------
// Putting a chart into a key
// ---------------------------------------------------------------------------

/** One bar as it will be read and played. */
export type ChartBar = {
	/** Bar number from one, so it can be said out loud. */
	number: number;
	/** The chords in this bar, with their numerals kept for the analysis view. */
	chords: {
		numeral: string;
		symbol: string;
		chord: AbstractChord;
		beats: number;
	}[];
};

export type RealisedChart = {
	slug: string;
	name: string;
	style: ChartStyle;
	keyCenter: string;
	defaultBpm: number;
	notes: string;
	/** Rows of bars, as printed. */
	rows: ChartBar[][];
	/** The same bars flattened, which is what the players consume. */
	bars: BarChord[];
	beatsPerBar: number;
};

/**
 * Resolve a numeral grid into one key.
 *
 * A bar holds one chord for the whole bar, or two for half each — which is how
 * charts have always been written, and enough for every form here. The minor
 * forms are read in aeolian so that `i` and `iv` come out minor without every
 * numeral having to be spelled with an accidental.
 */
export function realiseChart(seed: ChartSeed, keyName: string, beatsPerBar = 4): RealisedChart {
	const minor = seed.style === 'minor_blues' || seed.style === 'modal_vamp';
	const k: Key = minor ? makeKey(keyName.replace(/m$/, ''), 'aeolian') : makeKey(keyName);

	const bars: BarChord[] = [];
	let number = 0;

	const rows = seed.grid.map((row) =>
		row.map((cell) => {
			number++;
			const numerals = cell.trim().split(/\s+/);
			const share = beatsPerBar / numerals.length;

			const chords = numerals.map((numeral) => {
				const built = chordFromNumeral(numeral, k);
				bars.push({ chord: built, beats: share });
				return {
					numeral,
					symbol: formatChord(built),
					chord: built,
					beats: share
				};
			});

			return { number, chords };
		})
	);

	return {
		slug: seed.slug,
		name: seed.name,
		style: seed.style,
		keyCenter: keyName,
		defaultBpm: seed.defaultBpm,
		notes: seed.notes,
		rows,
		bars,
		beatsPerBar
	};
}
