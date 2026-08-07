import type { BarChord } from '$lib/audio/bass';
import { formatChord, type AbstractChord } from '$lib/music/chord';
import { key as makeKey, type Key } from '$lib/music/key';
import type { ChartStyle } from '$lib/server/db/schema';
import { chordFromNumeral } from './progressions';

/**
 * The application vehicles, as chord grids.
 *
 * Three kinds of thing live here, and the difference matters:
 *
 *   forms      The generic shapes — twelve-bar blues, rhythm changes, a modal
 *              vamp. Nobody's tune; the raw material everything else is built
 *              from.
 *   cycles     Named harmonic devices. A bird blues and a three-tonic cycle are
 *              patterns that get taught in every book, not compositions, even
 *              though both are named after the player who made them famous.
 *   standards  Real repertoire, and only where the copyright has expired: US
 *              publication in 1930 or earlier. The year is recorded on each one
 *              so the claim can be checked rather than taken on trust.
 *   mine       Charts you typed in yourself, kept in the database rather than
 *              here. Where anything still in copyright belongs.
 *
 * What is deliberately absent is a fake book. No melodies anywhere, and no
 * changes to tunes still in copyright — that is what the chart importer is for.
 *
 * Grids are stored as Roman numerals rather than chord symbols, so one chart
 * plays in all twelve keys without being rewritten. Bars are grouped into rows
 * of four purely because that is how a chart is read.
 */

export type ChartCategory = 'form' | 'cycle' | 'standard' | 'mine';

export const CHART_CATEGORIES: Record<ChartCategory, string> = {
	form: 'Forms',
	cycle: 'Cycles',
	standard: 'Standards',
	mine: 'Yours'
};

export type ChartSeed = {
	slug: string;
	name: string;
	style: ChartStyle;
	category: ChartCategory;
	/** How the key is named and heard. Numerals always resolve against the major
	 * scale — see `realiseChart` — so this only decides whether the chart is
	 * announced as "C" or "C minor". */
	mode: 'major' | 'minor';
	defaultBpm: number;
	/** Rows of bars; each bar holds one or two Roman numerals. */
	grid: string[][];
	notes: string;
	/** Year of first publication, for the standards. Their licence to be here. */
	published?: number;
};

export const CHARTS: ChartSeed[] = [
	{
		slug: 'blues-12',
		name: 'Twelve-bar blues',
		style: 'blues',
		category: 'form',
		mode: 'major',
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
		category: 'form',
		mode: 'major',
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
		category: 'form',
		mode: 'minor',
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
		category: 'form',
		mode: 'major',
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
		category: 'form',
		mode: 'minor',
		defaultBpm: 132,
		grid: [
			['i7', 'i7', 'i7', 'i7'],
			['i7', 'i7', 'i7', 'i7'],
			['bii7', 'bii7', 'i7', 'i7'],
			['i7', 'i7', 'i7', 'i7']
		],
		notes:
			'Dorian, sixteen bars, with a shift up a semitone for two. Nowhere to hide behind harmonic motion, so the voicings and the melody have to carry it.'
	},

	// -- Cycles: named devices, not compositions ------------------------------
	{
		slug: 'bird-blues',
		name: 'Bird blues',
		style: 'blues',
		category: 'cycle',
		mode: 'major',
		defaultBpm: 180,
		grid: [
			['Imaj7', 'vii7 III7', 'vi7 II7', 'v7 I7'],
			['IV7', 'iv7 bVII7', 'iii7 VI7', 'biii7 bVI7'],
			['ii7', 'V7', 'Imaj7 VI7', 'ii7 V7']
		],
		notes:
			'The blues rewritten as an unbroken chain of ii–Vs, which is the single best argument for learning them. Same twelve bars, same three chords underneath, and almost nothing left of the original harmony on the surface.'
	},
	{
		slug: 'three-tonic-cycle',
		name: 'Three-tonic cycle',
		style: 'custom',
		category: 'cycle',
		mode: 'major',
		defaultBpm: 160,
		grid: [
			['Imaj7 bIII7', 'bVImaj7 VII7', 'IIImaj7 V7', 'Imaj7'],
			['bVImaj7 VII7', 'IIImaj7 V7', 'Imaj7 bIII7', 'bVImaj7']
		],
		notes:
			'Three key centres a major third apart, each reached by its own dominant. The device Coltrane built on, on its own without the tune — which is the useful part anyway, because the pattern moves to any key and the tune does not.'
	},
	{
		slug: 'fifths-cycle',
		name: 'ii–V round the wheel',
		style: 'custom',
		category: 'cycle',
		mode: 'major',
		defaultBpm: 120,
		grid: [
			['ii7 V7', 'v7 I7', 'i7 IV7', 'iv7 bVII7'],
			['bvii7 bIII7', 'biii7 bVI7', 'bvi7 bII7', 'bii7 bV7'],
			['bv7 VII7', 'vii7 III7', 'iii7 VI7', 'vi7 II7']
		],
		notes:
			'A ii–V into every one of the twelve keys, falling in fifths, arriving back where it started. Two beats each and no resolution anywhere: the point is the shape of the move, not the arrival.'
	},

	// -- Standards: public domain only. See the note at the top of this file. --
	{
		slug: 'indiana',
		name: '(Back Home Again in) Indiana',
		style: 'custom',
		category: 'standard',
		mode: 'major',
		defaultBpm: 200,
		published: 1917,
		grid: [
			['I', 'I', 'IV7', 'IV7'],
			['I', 'VI7', 'ii7', 'ii7'],
			['I', '#I°7', 'ii7', 'V7'],
			['iii7 VI7', 'ii7', 'ii7 V7', 'I V7'],
			['I', 'I', 'IV7', 'IV7'],
			['I', 'VI7', 'ii7', 'ii7'],
			['IV', 'iv', 'I VI7', 'ii7 V7'],
			['I', 'vi7', 'ii7 V7', 'I']
		],
		notes:
			'Thirty-two bars from 1917 and the vehicle half of bebop was built on. Fast, diatonic, and full of the ii–Vs you have been drilling — which is exactly why it was chosen.'
	},
	{
		slug: 'sweet-georgia-brown',
		name: 'Sweet Georgia Brown',
		style: 'custom',
		category: 'standard',
		mode: 'major',
		defaultBpm: 190,
		published: 1925,
		grid: [
			['VI7', 'VI7', 'VI7', 'VI7'],
			['II7', 'II7', 'II7', 'II7'],
			['V7', 'V7', 'V7', 'V7'],
			['I', 'I', 'I', 'I7'],
			['IV', 'IV', 'IV', 'IV'],
			['I', 'I', 'VI7', 'VI7'],
			['II7', 'II7', 'V7', 'V7'],
			['I', 'VI7', 'ii7 V7', 'I']
		],
		notes:
			'Opens three dominants away from home and spends sixteen bars walking back. If you want to feel the circle of fifths rather than look at it, this is the one.'
	},
	{
		slug: 'st-louis-blues',
		name: 'St. Louis Blues',
		style: 'blues',
		category: 'standard',
		mode: 'major',
		defaultBpm: 130,
		published: 1914,
		grid: [
			['I7', 'I7', 'I7', 'I7'],
			['IV7', 'IV7', 'I7', 'I7'],
			['V7', 'IV7', 'I7', 'V7'],
			['i', 'i', 'V7', 'V7'],
			['i', 'i', 'V7', 'i'],
			['i', 'i', 'V7', 'V7'],
			['i', 'i', 'V7', 'I7'],
			['I7', 'I7', 'I7', 'I7'],
			['IV7', 'IV7', 'I7', 'I7'],
			['V7', 'IV7', 'I7', 'V7']
		],
		notes:
			'Blues, then sixteen bars in the parallel minor, then blues again. The minor strain is the interesting part: same tonic, same fifth, and a completely different room.'
	},
	{
		slug: 'st-james-infirmary',
		name: 'St. James Infirmary',
		style: 'custom',
		category: 'standard',
		mode: 'minor',
		defaultBpm: 96,
		published: 1929,
		grid: [
			['i', 'i V7', 'i', 'iv'],
			['i', 'V7', 'i', 'i']
		],
		notes:
			'Eight bars, minor, traditional. Short enough that you go round it many times in a sitting, which is the point — it is somewhere to try one idea repeatedly rather than a form to get through.'
	},
	{
		slug: 'ja-da',
		name: 'Ja-Da',
		style: 'custom',
		category: 'standard',
		mode: 'major',
		defaultBpm: 170,
		published: 1918,
		grid: [
			['I', 'I', 'VI7', 'VI7'],
			['II7', 'II7', 'V7', 'V7'],
			['I', 'I', 'VI7', 'VI7'],
			['II7', 'V7', 'I', 'I']
		],
		notes:
			'Sixteen bars and one idea: I–VI–II–V, round and round. Nothing else in the repertoire gives you that many repetitions of the turnaround with a tune attached.'
	},
	{
		slug: 'salty-dog',
		name: 'Salty Dog',
		style: 'custom',
		category: 'standard',
		mode: 'major',
		defaultBpm: 160,
		published: 1924,
		grid: [
			['I', 'VI7', 'II7', 'V7'],
			['I', 'VI7', 'II7 V7', 'I']
		],
		notes:
			'Eight bars of the ragtime progression — every chord a dominant, each one pulling to the next. Short enough to go round it twenty times without noticing.'
	},
	{
		slug: 'after-youve-gone',
		name: "After You've Gone",
		style: 'custom',
		category: 'standard',
		mode: 'major',
		defaultBpm: 170,
		published: 1918,
		grid: [
			['I', 'I', 'vi', 'vi'],
			['I7', 'I7', 'IV', 'IV'],
			['iv', 'iv', 'I', 'VI7'],
			['ii7', 'V7', 'I', 'VI7'],
			['ii7', 'V7', 'I', 'I']
		],
		notes:
			'The I–I7–IV–iv walk in bars five to ten is the whole reason to know this one: the tonic turning into its own dominant, then the four turning minor underneath you.'
	},
	{
		slug: 'basin-street-blues',
		name: 'Basin Street Blues',
		style: 'custom',
		category: 'standard',
		mode: 'major',
		defaultBpm: 110,
		published: 1928,
		grid: [
			['I', 'I', 'IV', 'iv'],
			['I VI7', 'II7 V7', 'I', 'I']
		],
		notes:
			'Eight bars, and the borrowed minor four in bar four does all the work. Slow enough that there is time to hear the one note that moves.'
	},
	{
		slug: 'avalon',
		name: 'Avalon',
		style: 'custom',
		category: 'standard',
		mode: 'major',
		defaultBpm: 200,
		published: 1920,
		grid: [
			['V7', 'V7', 'I', 'I'],
			['V7', 'V7', 'I', 'I'],
			['I7', 'I7', 'IV', 'IV'],
			['VI7', 'II7', 'V7', 'I']
		],
		notes:
			'Opens on the dominant and takes eight bars to get home, then runs the dominant chain the other way. Fast, and mostly two chords, so there is room to think.'
	},
	{
		slug: 'bill-bailey',
		name: "Bill Bailey, Won't You Please Come Home",
		style: 'custom',
		category: 'standard',
		mode: 'major',
		defaultBpm: 150,
		published: 1902,
		grid: [
			['I', 'I', 'I', 'I7'],
			['IV', 'IV', 'I', 'VI7'],
			['II7', 'II7', 'V7', 'V7'],
			['I', 'VI7', 'ii7 V7', 'I']
		],
		notes:
			'Sixteen bars of ragtime, and about as plain as a chart gets. Worth having because the I–VI–II–V at the end is the turnaround you will play for the rest of your life.'
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
 * charts have always been written, and enough for every form here.
 *
 * Numerals resolve against the major scale even for the minor charts, because
 * that is the convention every chart is written in: ♭VI in C minor means A♭,
 * counted from C major. Reading them in aeolian instead flattened the sixth a
 * second time, and bar 9 of the minor blues — which is meant to be the A♭7
 * leaning on the V — came out as another G7.
 */
export function realiseChart(seed: ChartSeed, keyName: string, beatsPerBar = 4): RealisedChart {
	const k: Key = makeKey(keyName.replace(/m$/, ''));

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
