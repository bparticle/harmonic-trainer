import type { BarChord } from '$lib/audio/bass';
import type { Groove } from '$lib/audio/groove';
import { formatChord, type AbstractChord } from '$lib/music/chord';
import { key as makeKey, type Key } from '$lib/music/key';
import type { ChartStyle } from '$lib/server/db/schema';
import { chordFromNumeral } from './progressions';
import { demandOfGrid, type Demand } from './vocabulary';

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
 *   traditional Folk songs with no author and no first publication to record.
 *              The category is the claim here, in place of the year: these are
 *              nobody's composition in the same way a blues is nobody's, and
 *              putting them under `standards` with a year invented to fill the
 *              field would be the opposite of what that field is for.
 *   mine       Charts you typed in yourself, kept in the database rather than
 *              here. Where anything still in copyright belongs.
 *
 * What is deliberately absent is a fake book. No melodies anywhere, and no
 * changes to tunes still in copyright — that is what the chart editor is for.
 *
 * Grids are stored as Roman numerals rather than chord symbols, so one chart
 * plays in all twelve keys without being rewritten. Bars are grouped into rows
 * of four purely because that is how a chart is read.
 */

export type ChartCategory = 'form' | 'cycle' | 'standard' | 'traditional' | 'mine';

export const CHART_CATEGORIES: Record<ChartCategory, string> = {
	form: 'Forms',
	cycle: 'Cycles',
	standard: 'Standards',
	traditional: 'Traditional',
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
	/** The rhythm section it opens with. Choosing a chart sets this and the
	 * tempo together, because a tune played at the wrong tempo in the wrong
	 * groove is not that tune slightly off — it is a different tune. */
	defaultGroove: Groove;
	/** The key it opens in, for a chart that has one. A form does not: a blues
	 * is a blues in all twelve, so this is undefined for everything built in and
	 * the key already on screen is left alone. */
	defaultKey?: string;
	/** Rows of bars; each bar holds one or two Roman numerals. */
	grid: string[][];
	/**
	 * The words, in the same shape as `grid`: one fragment per bar, '' where a
	 * bar has none. Omitted entirely for an instrumental, and every part of the
	 * app that draws lyrics checks for that rather than drawing an empty row —
	 * a chart without words has to look exactly as it did before words existed.
	 *
	 * A bar holding two chords shares one fragment. That is a real limit and an
	 * honest one: the words are aligned to bars because that is what a chord
	 * sheet aligns them to, and splitting a fragment across half a bar would be
	 * inventing timing nobody wrote down.
	 */
	lyrics?: string[][];
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
		defaultGroove: 'shuffle',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
		grid: [
			['i7', 'i7', 'i7', 'i7'],
			['i7', 'i7', 'i7', 'i7'],
			['bii7', 'bii7', 'i7', 'i7'],
			['i7', 'i7', 'i7', 'i7']
		],
		notes:
			'Dorian, sixteen bars, with a shift up a semitone for two. Nowhere to hide behind harmonic motion, so the voicings and the melody have to carry it.'
	},
	{
		slug: 'four-chord-loop',
		name: 'Four-chord loop',
		style: 'custom',
		category: 'form',
		mode: 'major',
		defaultBpm: 96,
		defaultGroove: 'pop',
		grid: [['I', 'V', 'vi', 'IV']],
		notes:
			'I–V–vi–IV, four bars, round and round. The most played progression in popular music and a fair test of whether your triads are actually under the hands — there are no sevenths to hide the shape.'
	},
	{
		slug: 'doo-wop',
		name: 'Doo-wop changes',
		style: 'custom',
		category: 'form',
		mode: 'major',
		defaultBpm: 116,
		defaultGroove: 'pop',
		grid: [['I', 'vi', 'IV', 'V']],
		notes:
			'I–vi–IV–V. The fifties turnaround, and the same four chords as the loop above in a different order — worth playing back to back to hear how much the order is doing.'
	},
	{
		slug: 'mixolydian-vamp',
		name: 'Rock vamp',
		style: 'modal_vamp',
		category: 'form',
		mode: 'major',
		defaultBpm: 128,
		defaultGroove: 'rock',
		grid: [
			['I', 'bVII', 'IV', 'I'],
			['I', 'bVII', 'IV', 'I']
		],
		notes:
			'I–♭VII–IV, which is mixolydian rather than major: the flat seven is the whole sound. Eight bars so the loop is long enough to play a phrase over.'
	},

	// -- Cycles: named devices, not compositions ------------------------------
	{
		slug: 'bird-blues',
		name: 'Bird blues',
		style: 'blues',
		category: 'cycle',
		mode: 'major',
		defaultBpm: 180,
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'ballad',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
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
		defaultGroove: 'swing',
		published: 1902,
		grid: [
			['I', 'I', 'I', 'I7'],
			['IV', 'IV', 'I', 'VI7'],
			['II7', 'II7', 'V7', 'V7'],
			['I', 'VI7', 'ii7 V7', 'I']
		],
		notes:
			'Sixteen bars of ragtime, and about as plain as a chart gets. Worth having because the I–VI–II–V at the end is the turnaround you will play for the rest of your life.'
	},

	{
		slug: 'trouble-in-mind',
		name: 'Trouble in Mind',
		style: 'blues',
		category: 'standard',
		mode: 'major',
		defaultBpm: 88,
		defaultGroove: 'shuffle',
		defaultKey: 'C',
		published: 1924,
		grid: [
			['I', 'I7', 'IV', 'IV'],
			['I', 'V7', 'I V7', 'I']
		],
		notes:
			'The eight-bar blues, which is the twelve-bar with the waiting taken out: the IV arrives in bar three and you are home by bar five. Half the length means twice the changes per chorus, so it is the shortest route to getting a blues under the hands.'
	},
	{
		slug: 'how-long-blues',
		name: 'How Long, How Long Blues',
		style: 'blues',
		category: 'standard',
		mode: 'major',
		defaultBpm: 76,
		defaultGroove: 'shuffle',
		defaultKey: 'C',
		published: 1928,
		grid: [
			['I', 'I7', 'IV', 'IV'],
			['I', 'V7', 'I', 'I']
		],
		notes:
			'The same eight bars at a slower walk and with no turnaround at the end, so the form simply comes round again. Slow enough that every chord is a decision rather than a reflex, which is the tempo most people skip.'
	},
	// -- Traditional: folk songs, no author to credit and none to clear --------
	{
		slug: 'when-the-saints',
		name: 'When the Saints Go Marching In',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 120,
		defaultGroove: 'straight',
		defaultKey: 'C',
		grid: [
			['I', 'I', 'I', 'I'],
			['IV', 'IV', 'I', 'I'],
			['I', 'I', 'V', 'V'],
			['I', 'IV', 'I V', 'I']
		],
		notes:
			'Three major triads and sixteen bars, four of which are the same chord. Almost nothing to think about harmonically, which leaves the whole of your attention for playing it in time and meaning it.'
	},
	{
		slug: 'swing-low',
		name: 'Swing Low, Sweet Chariot',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 76,
		defaultGroove: 'ballad',
		defaultKey: 'C',
		grid: [
			['I', 'I', 'IV', 'I'],
			['I', 'I', 'V', 'V'],
			['I', 'I', 'IV', 'I'],
			['I', 'V', 'I', 'I']
		],
		notes:
			'The same three chords taken slowly, which is a different exercise entirely: at 76 there is time to hear each chord arrive, and nowhere to hide a change that lands early.'
	},
	{
		slug: 'auld-lang-syne',
		name: 'Auld Lang Syne',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 96,
		defaultGroove: 'pop',
		defaultKey: 'C',
		grid: [
			['I', 'I', 'IV', 'I'],
			['I', 'vi', 'ii', 'V'],
			['I', 'I', 'IV', 'I'],
			['I', 'V', 'I', 'I']
		],
		notes:
			'The first tune here to use a minor chord, and it uses two: the vi and the ii, walking down into the V. A good first look at what the minor triads of a key are actually for.'
	},
	{
		slug: 'drunken-sailor',
		name: 'Drunken Sailor',
		style: 'custom',
		category: 'traditional',
		mode: 'minor',
		defaultBpm: 132,
		defaultGroove: 'rock',
		defaultKey: 'D',
		grid: [
			['i', 'i', 'bVII', 'bVII'],
			['i', 'i', 'bVII', 'i'],
			['i', 'i', 'bVII', 'bVII'],
			['i', 'bVII', 'i', 'i']
		],
		notes:
			'Two chords, sixteen bars, and one of them is the flat seven — which sounds like it should be outside the key and is not: in a minor key it is the seventh chord of the scale. Dorian without the theory lesson.'
	},
	{
		slug: 'wade-in-the-water',
		name: 'Wade in the Water',
		style: 'custom',
		category: 'traditional',
		mode: 'minor',
		defaultBpm: 92,
		defaultGroove: 'funk',
		defaultKey: 'D',
		grid: [
			['i', 'i', 'i', 'i'],
			['iv', 'iv', 'i', 'i'],
			['i', 'i', 'V7', 'V7'],
			['i', 'iv', 'i', 'i']
		],
		notes:
			'A minor blues shape without any of the blues chords: i, iv and the V7. Eight bars of one chord to open, so the groove has to carry it — which is the whole point of playing it over a rhythm section rather than alone.'
	},
	{
		slug: 'wayfaring-stranger',
		name: 'Wayfaring Stranger',
		style: 'custom',
		category: 'traditional',
		mode: 'minor',
		defaultBpm: 72,
		defaultGroove: 'ballad',
		defaultKey: 'A',
		grid: [
			['i', 'i', 'iv', 'i'],
			['i', 'i', 'V7', 'i'],
			['i', 'i', 'iv', 'i'],
			['i', 'V7', 'i', 'i']
		],
		notes:
			'The minor i–iv–V, slowly. The V7 has a note from outside the minor scale — the raised seventh — and it is the only thing pulling the tune home. Worth listening for on every one of the four times it happens.'
	},
	{
		slug: 'hava-nagila',
		name: 'Hava Nagila',
		style: 'custom',
		category: 'traditional',
		mode: 'minor',
		defaultBpm: 140,
		defaultGroove: 'straight',
		defaultKey: 'D',
		grid: [
			['i', 'i', 'iv', 'iv'],
			['V7', 'V7', 'i', 'i'],
			['i', 'i', 'iv', 'iv'],
			['V7', 'V7', 'i', 'i']
		],
		notes:
			'The same three minor-key chords as the last one, at nearly twice the speed and two bars each. A tune to take the tempo ladder up rather than to learn anything new on.'
	},
	{
		slug: 'old-joe-clark',
		name: 'Old Joe Clark',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 132,
		defaultGroove: 'straight',
		defaultKey: 'A',
		grid: [
			['I', 'I', 'bVII', 'bVII'],
			['I', 'I', 'V', 'I'],
			['I', 'I', 'bVII', 'bVII'],
			['I', 'V', 'I', 'I']
		],
		notes:
			'A fiddle tune in mixolydian: major key, flat seventh, and no leading note anywhere. The ♭VII is borrowed from the parallel minor and it is the entire sound of the tune — play the same sixteen bars with a vii° instead and it stops being folk music.'
	},
	{
		slug: 'house-of-the-rising-sun',
		name: 'House of the Rising Sun',
		style: 'custom',
		category: 'traditional',
		mode: 'minor',
		defaultBpm: 72,
		defaultGroove: 'ballad',
		defaultKey: 'A',
		grid: [
			['i', 'bIII', 'IV', 'bVI'],
			['i', 'V', 'i', 'V']
		],
		notes:
			'Eight bars that climb away from the tonic and fall back to it. The IV is major where the key wants it minor — one note borrowed from the parallel key — and that single note is why the progression has outlived everybody who ever sang it.'
	},
	{
		slug: 'midnight-special',
		name: 'The Midnight Special',
		style: 'blues',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 116,
		defaultGroove: 'shuffle',
		defaultKey: 'C',
		grid: [
			['I', 'I', 'I', 'I7'],
			['IV', 'IV', 'I', 'I'],
			['V7', 'V7', 'I', 'I']
		],
		notes:
			'A twelve-bar with only one blues seventh in it, sitting in bar four where it turns the tonic into a dominant and pushes you into the IV. The gentlest possible introduction to the chord that makes a blues a blues.'
	},
	{
		slug: 'mango-walk',
		name: 'Mango Walk',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 112,
		defaultGroove: 'reggae',
		defaultKey: 'F',
		grid: [
			['V7', 'I', 'V7', 'I'],
			['V7', 'I', 'V7', 'I']
		],
		lyrics: [
			[
				'My mother did a-tell me that you go',
				'mango walk',
				'You go mango walk,',
				'you go mango walk'
			],
			['My mother did a-tell me that you go', 'mango walk', 'And steal all the number', '’leven']
		],
		notes:
			'Two chords: the dominant leaning home, and home. Nothing to read means the whole of the attention can go on time and on singing while you play, which is harder than it sounds and is the point of having it here.'
	},
	{
		slug: 'skip-to-my-lou',
		name: 'Skip to My Lou',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 132,
		defaultGroove: 'straight',
		defaultKey: 'C',
		grid: [
			['I', 'I', 'V', 'V'],
			['I', 'I', 'V', 'I']
		],
		notes:
			'Two chords and eight bars — the smallest complete tune here, and the one to open the songbook with. Nothing to read means the whole of the attention goes on landing the change on the bar line at a tempo that will not wait for you.'
	},
	{
		slug: 'go-tell-it-on-the-mountain',
		name: 'Go Tell It on the Mountain',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 108,
		defaultGroove: 'straight',
		defaultKey: 'C',
		grid: [
			['I', 'I', 'IV', 'I'],
			['I', 'V', 'I', 'I'],
			['I', 'I', 'I', 'I'],
			['I', 'V', 'I', 'I']
		],
		notes:
			'A chorus that moves and a verse that mostly does not, which is the useful part: eight bars of I with one V in them is where holding time honestly gets difficult.'
	},
	{
		slug: 'down-by-the-riverside',
		name: 'Down by the Riverside',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 116,
		defaultGroove: 'straight',
		defaultKey: 'C',
		grid: [
			['I', 'I', 'I', 'I'],
			['I', 'I', 'V', 'V'],
			['I', 'I', 'IV', 'IV'],
			['I', 'V', 'I', 'I']
		],
		notes:
			'Three chords over sixteen bars, each held for two at a time. The long stretches are the exercise — a chord you sit on for eight beats is a chord you have to keep meaning.'
	},
	{
		slug: 'coming-round-the-mountain',
		name: "She'll Be Coming Round the Mountain",
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 128,
		defaultGroove: 'straight',
		defaultKey: 'C',
		grid: [
			['I', 'I', 'I', 'I'],
			['IV', 'IV', 'I', 'I'],
			['I', 'I', 'V', 'V'],
			['I', 'V', 'I', 'I']
		],
		notes:
			'The same three chords again, in a different order and faster. Two tunes built from one vocabulary is how the vocabulary stops being a list of shapes and starts being something you can hear coming.'
	},
	{
		slug: 'oh-susanna',
		name: 'Oh! Susanna',
		style: 'custom',
		category: 'standard',
		mode: 'major',
		defaultBpm: 120,
		defaultGroove: 'straight',
		defaultKey: 'C',
		published: 1848,
		grid: [
			['I', 'I', 'I', 'V'],
			['I', 'I', 'V', 'I'],
			['IV', 'IV', 'I', 'I'],
			['I', 'V', 'I', 'I']
		],
		notes:
			'The oldest thing in the book and still three chords. Verse and chorus differ, which the three-chord tunes above do not: the IV arrives only when the chorus does, so the form is audible in the harmony.'
	},
	{
		slug: 'michael-row-the-boat',
		name: 'Michael, Row the Boat Ashore',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 96,
		defaultGroove: 'ballad',
		defaultKey: 'C',
		grid: [
			['I', 'IV', 'I', 'vi'],
			['I', 'IV', 'I V', 'I']
		],
		notes:
			'Eight bars, and the vi in bar four is the whole lesson: the same three notes as the tonic with one moved, arriving where a major chord was expected. The plainest place in the songbook to hear what a relative minor does.'
	},
	{
		slug: 'shenandoah',
		name: 'Shenandoah',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 68,
		defaultGroove: 'ballad',
		defaultKey: 'C',
		grid: [
			['I', 'IV', 'I', 'vi'],
			['IV', 'I', 'V', 'V'],
			['I', 'IV', 'I', 'vi'],
			['IV', 'I V', 'I', 'I']
		],
		notes:
			'A plain setting, taken slowly. At 68 there is time between the chords to hear the vi turn the phrase and the IV set it back down, which is exactly the pair of moves the faster tunes go past too quickly to teach.'
	},
	{
		slug: 'motherless-child',
		name: 'Sometimes I Feel Like a Motherless Child',
		style: 'custom',
		category: 'traditional',
		mode: 'minor',
		defaultBpm: 66,
		defaultGroove: 'ballad',
		// The bare tonic, as everywhere else: `mode` is what says this is minor,
		// and the key field is read as a note.
		defaultKey: 'C',
		grid: [
			['i', 'i', 'iv', 'i'],
			['i', 'i', 'V', 'i'],
			['iv', 'iv', 'i', 'i'],
			['i', 'V', 'i', 'i']
		],
		notes:
			'A minor key with nothing borrowed and nothing chromatic: i, iv and the major V, which is what a minor key actually sounds like before anything is added to it. The first play-along that is minor all the way through.'
	},
	{
		slug: 'careless-love',
		name: 'Careless Love',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 96,
		defaultGroove: 'shuffle',
		defaultKey: 'C',
		grid: [
			['I', 'I', 'V7', 'V7'],
			['I', 'I7', 'IV', 'IV'],
			['I', 'V7', 'I', 'I']
		],
		notes:
			'Twelve bars that are not a blues — the changes go somewhere else and arrive at the same place. Bar six is the whole point: a dominant seventh on the tonic, which belongs to no key at all and is the sound of most of the last century leaning towards the IV.'
	},
	{
		slug: 'shine-on-harvest-moon',
		name: 'Shine On, Harvest Moon',
		style: 'custom',
		category: 'standard',
		mode: 'major',
		defaultBpm: 132,
		defaultGroove: 'swing',
		defaultKey: 'C',
		published: 1908,
		grid: [
			['I', 'I', 'VI7', 'VI7'],
			['II7', 'II7', 'V7', 'V7'],
			['I', 'I', 'VI7', 'VI7'],
			['II7', 'V7', 'I', 'I']
		],
		notes:
			'The circle of fifths as a song rather than as an exercise: VI7 to II7 to V7 to I, twice, with each dominant aimed at the next. Every ragtime-era tune in this section is built on this and it is worth meeting on its own first.'
	},
	{
		slug: 'linstead-market',
		name: 'Linstead Market',
		style: 'custom',
		category: 'traditional',
		mode: 'major',
		defaultBpm: 104,
		defaultGroove: 'reggae',
		defaultKey: 'C',
		grid: [
			['I', 'IV', 'V', 'I'],
			['I', 'IV', 'V', 'I'],
			['I', 'IV', 'V', 'I'],
			['I', 'IV', 'V', 'I']
		],
		// Verse twice, then the chorus twice, which is the whole song.
		lyrics: [
			['Mi carry mi ackee go a', 'Linstead Market', 'Not a quattie worth', 'sell'],
			['Mi carry mi ackee go a', 'Linstead Market', 'Not a quattie worth', 'sell'],
			['Oh lord what a night,', 'not a bite', 'What a Saturday', 'night'],
			['Lawd what a night,', 'not a bite', 'What a Saturday', 'night']
		],
		notes:
			'I–IV–V–I, four times, verse and chorus over the same four bars. The plainest changes in the book, so what is left to get right is the groove and landing the change exactly on the bar line.'
	}
];

export function chartBySlug(slug: string): ChartSeed | undefined {
	return CHARTS.find((c) => c.slug === slug);
}

/**
 * What this chart would ask of a pair of hands.
 *
 * Derived from the grid rather than typed beside it, so a chart that is edited
 * says something different the next time it is asked, and a chart of your own
 * answers on exactly the same terms as a built-in. See `vocabulary.ts` for what
 * the two axes are and why a mission is set only where they are covered.
 */
export const chartDemand = (chart: Pick<ChartSeed, 'grid' | 'mode'>): Demand =>
	demandOfGrid(chart.grid, chart.mode);

/**
 * The built-ins, each carrying its demand.
 *
 * The shape the workout composer wants: it must stay pure and must not parse a
 * Roman numeral, so the derivation happens once here and arrives as data. A
 * chart of your own is given the same treatment where it is loaded.
 */
export const MISSION_CHARTS: Array<ChartSeed & { demand: Demand }> = CHARTS.map((chart) => ({
	...chart,
	demand: chartDemand(chart)
}));

// ---------------------------------------------------------------------------
// Putting a chart into a key
// ---------------------------------------------------------------------------

/** One bar as it will be read and played. */
export type ChartBar = {
	/** Bar number from one, so it can be said out loud. */
	number: number;
	/** The words sung over this bar, if the chart has any. */
	lyric?: string;
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
	defaultGroove: Groove;
	notes: string;
	/** Rows of bars, as printed. */
	rows: ChartBar[][];
	/** Whether there is anything to sing. Asked once here rather than by every
	 * component that would otherwise have to go looking through the bars. */
	hasLyrics: boolean;
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

	const rows = seed.grid.map((row, r) =>
		row.map((cell, c) => {
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

			// Empty string and absent mean the same thing to everything downstream:
			// this bar has no words. Only one of them is allowed past here.
			const lyric = seed.lyrics?.[r]?.[c]?.trim();
			return { number, chords, lyric: lyric || undefined };
		})
	);

	return {
		slug: seed.slug,
		name: seed.name,
		style: seed.style,
		keyCenter: keyName,
		defaultBpm: seed.defaultBpm,
		defaultGroove: seed.defaultGroove,
		notes: seed.notes,
		rows,
		hasLyrics: rows.some((row) => row.some((bar) => bar.lyric !== undefined)),
		bars,
		beatsPerBar
	};
}
