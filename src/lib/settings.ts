import { FIRST_FRONTIER } from './curriculum/ladder';
import type { Oklch } from './design/color';
import { DEFAULT_PALETTE } from './design/palette';

/**
 * Shapes of the JSON columns on the `settings` table, plus their defaults.
 * Shared between client and server — the colour editor and the wheel
 * calibration screen both read and write these.
 */

/**
 * The harmonic wheel's geometry. Every value is a parameter because the
 * on-screen wheel has to be made to match a physical one that was built by
 * hand: the calibration screen flips `offsetDirection` and moves `startNote`
 * until the two agree.
 */
export type WheelConfig = {
	/** Nested circles of fifths, outermost first. */
	rings: number;
	/** Circle-of-fifths steps each ring is rotated relative to the one outside it. */
	ringOffsetSteps: number;
	/** Which way that rotation goes. Flipped during calibration. */
	offsetDirection: 1 | -1;
	/** Note sitting at 12 o'clock on the outermost ring. */
	startNote: string;
};

export type Prefs = {
	/** Minutes. Ten, twenty or thirty-five. */
	sessionLengthMinutes: 10 | 20 | 35;
	/** How long a chord's name is withheld so there is time to guess it first. */
	revealDelayMs: number;
	/** Note-on clustering window used to group simultaneous notes into one chord event. */
	chordClusterWindowMs: number;
	/** Offset applied to incoming MIDI timestamps after latency calibration. */
	midiLatencyOffsetMs: number;
	/**
	 * The frontier: how many keys each rung of the ladder is open in.
	 *
	 * One number per rung, in `RUNGS` order, non-increasing. This replaced
	 * `ladderKey` and `ladderRung`, which between them named a single point on a
	 * walk and therefore made everything reached a prefix of that walk — see the
	 * note on `Frontier` in `curriculum/ladder.ts` for what that cost.
	 *
	 * A stored position migrates to the frontier it always meant, exactly rather
	 * than approximately, so nobody loses ground on the upgrade. `parsePrefs`
	 * does that conversion and is the only place the old two fields are still
	 * read.
	 *
	 * Opening more is a decision, not a threshold. The app says when a rung looks
	 * solid; you decide when to go deeper or wider, because you can tell whether
	 * something is under your fingers far better than a review count can.
	 */
	ladderWidths: number[];
};

export type ColorMap = Oklch[];

export const DEFAULT_WHEEL_CONFIG: WheelConfig = {
	rings: 5,
	ringOffsetSteps: 3,
	offsetDirection: 1,
	startNote: 'C'
};

export const DEFAULT_PREFS: Prefs = {
	sessionLengthMinutes: 20,
	revealDelayMs: 2000,
	chordClusterWindowMs: 80,
	midiLatencyOffsetMs: 0,
	// Everyone starts at the beginning: C major, and the seven notes in it. Copied
	// rather than shared, so this module constant and `FIRST_FRONTIER` cannot be
	// aliased into one array that a careless in-place edit would corrupt for both.
	ladderWidths: [...FIRST_FRONTIER.widths]
};

export const DEFAULT_COLOR_MAP: ColorMap = DEFAULT_PALETTE;

export type AppSettings = {
	colorMap: ColorMap;
	wheelConfig: WheelConfig;
	prefs: Prefs;
	midiDevice: string | null;
	tourSeen: boolean;
};

export const DEFAULT_SETTINGS: AppSettings = {
	colorMap: DEFAULT_COLOR_MAP,
	wheelConfig: DEFAULT_WHEEL_CONFIG,
	prefs: DEFAULT_PREFS,
	midiDevice: null,
	tourSeen: false
};
