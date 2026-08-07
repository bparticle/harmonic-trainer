import { between, intervalName, ivl, transpose, type Interval } from './interval';
import { formatPitch, midi, parseNote, pitchClass, type Note } from './note';
import { scale, type Key } from './key';

/**
 * Chords.
 *
 * The abstract chord (root, quality, extensions, alterations) and the concrete
 * voicing (the actual sounding pitches, low to high) are deliberately different
 * things. Half the teaching value of this app lives in the gap between them:
 * `Dm7` is one idea, and the six ways your left hand might play it are six
 * others.
 */

export type ChordQuality =
	'maj' | 'min' | 'dom' | 'min7b5' | 'dim7' | 'aug' | 'sus2' | 'sus4' | 'maj6' | 'min6';

export type Extension = 7 | 9 | 11 | 13;
export type Alteration = 'b5' | '#5' | 'b9' | '#9' | '#11' | 'b13';

/** Root, quality and colour. Says nothing about which octave anything is in. */
export type AbstractChord = {
	root: Note;
	quality: ChordQuality;
	extensions: Extension[];
	alterations: Alteration[];
	/** Slash chords: the note actually in the bass, when it is not the root. */
	bass?: Note;
};

/** An abstract chord plus a decision about how to play it. */
export type Chord = AbstractChord & {
	inversion: 0 | 1 | 2 | 3;
	/** The sounding pitches, ordered low to high. */
	voicing: Note[];
};

/** Base intervals for each quality, before extensions and alterations. */
const QUALITY_INTERVALS: Record<ChordQuality, string[]> = {
	maj: ['P1', 'M3', 'P5'],
	min: ['P1', 'm3', 'P5'],
	dom: ['P1', 'M3', 'P5', 'm7'],
	// Triad only: with no seventh this is a plain diminished chord, and the m7
	// arrives via the 7 extension. A dominant, by contrast, is never a triad.
	min7b5: ['P1', 'm3', 'd5'],
	dim7: ['P1', 'm3', 'd5', 'd7'],
	aug: ['P1', 'M3', 'A5'],
	sus2: ['P1', 'M2', 'P5'],
	sus4: ['P1', 'P4', 'P5'],
	maj6: ['P1', 'M3', 'P5', 'M6'],
	min6: ['P1', 'm3', 'P5', 'M6']
};

/** How each quality spells its seventh, when it has one. */
const SEVENTH_FOR_QUALITY: Partial<Record<ChordQuality, string>> = {
	maj: 'M7',
	min: 'm7',
	dom: 'm7',
	aug: 'm7',
	sus2: 'm7',
	sus4: 'm7',
	min7b5: 'm7',
	dim7: 'd7'
};

/** Qualities whose sixth is a genuine chord tone, so adding a 9 does not imply a 7. */
const SIXTH_QUALITIES = new Set<ChordQuality>(['maj6', 'min6']);

export function chord(
	root: Note | string,
	quality: ChordQuality,
	extensions: Extension[] = [],
	alterations: Alteration[] = [],
	bass?: Note | string
): AbstractChord {
	return {
		root: typeof root === 'string' ? parseNote(root) : root,
		quality,
		extensions,
		alterations,
		bass: typeof bass === 'string' ? parseNote(bass) : bass
	};
}

/**
 * The intervals a chord contains, from the root, in stacking order.
 *
 * Alterations replace the natural degree rather than adding to it: a ♭9 chord
 * has a ♭9 and no natural 9. A ♯11 without an explicit 11 extension still adds
 * the ♯11, because that is what the symbol means.
 */
export function chordIntervals(c: AbstractChord): Interval[] {
	const names = [...QUALITY_INTERVALS[c.quality]];

	const has = (degree: Extension) => c.extensions.includes(degree);
	const altered = (a: Alteration) => c.alterations.includes(a);

	// Fifth alterations replace the natural fifth.
	if (altered('b5')) replaceDegree(names, 5, 'd5');
	if (altered('#5')) replaceDegree(names, 5, 'A5');

	// Any upper extension implies the seventh, except on 6 chords where the
	// sixth is the colour tone and 6/9 is a real chord.
	const seventh = SEVENTH_FOR_QUALITY[c.quality];
	const wantsSeventh =
		seventh !== undefined &&
		(has(7) || ((has(9) || has(11) || has(13)) && !SIXTH_QUALITIES.has(c.quality)));
	if (wantsSeventh && !names.some((n) => n.endsWith('7'))) names.push(seventh);

	if (has(9) || altered('b9') || altered('#9')) {
		names.push(altered('b9') ? 'b9' : altered('#9') ? '#9' : 'M9');
	}
	if (has(11) || altered('#11')) {
		names.push(altered('#11') ? '#11' : 'P11');
	}
	if (has(13) || altered('b13')) {
		names.push(altered('b13') ? 'b13' : 'M13');
	}

	return names.map(ivl);
}

function replaceDegree(names: string[], degree: number, replacement: string) {
	const index = names.findIndex((n) => Number(n.slice(-1)) === degree);
	if (index >= 0) names[index] = replacement;
}

/** The spelled notes of a chord, in stacking order from the root. */
export function chordNotes(c: AbstractChord, octave = 4): Note[] {
	const root = { ...c.root, octave };
	return chordIntervals(c).map((interval) => transpose(root, interval));
}

export function chordPitchClasses(c: AbstractChord): number[] {
	return chordNotes(c).map(pitchClass);
}

/** Semitones above the tonic for each degree of a major scale. */
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];

/**
 * What each note of a chord is called, as a scale degree.
 *
 * `1 3 5 ♭7` for a dominant seventh, `1 ♭3 ♭5 ♭♭7` for a diminished. This is
 * the only vocabulary the app has for saying *which note is which* — there is
 * no notation to point at — so it does the work that a stave would otherwise do
 * and it needs to be right about the flats.
 */
export function degreeLabels(c: AbstractChord): Array<{ note: Note; degree: string }> {
	const notes = chordNotes(c);
	return chordIntervals(c).map((interval, i) => {
		const octaves = Math.floor(interval.steps / 7);
		const expected = MAJOR_STEPS[interval.steps % 7] + octaves * 12;
		const delta = interval.semitones - expected;
		const mark = delta < 0 ? '♭'.repeat(-delta) : '♯'.repeat(delta);
		return { note: notes[i], degree: `${mark}${interval.steps + 1}` };
	});
}

// ---------------------------------------------------------------------------
// Voicings
// ---------------------------------------------------------------------------

/**
 * Move a voicing so it sits inside a range of notes.
 *
 * For showing a chord on a keyboard that only has so many keys. Shifting the
 * whole thing by octaves is tried first, because that keeps the shape — the
 * chord still looks like the chord. Only when it genuinely will not fit is it
 * re-stacked from the bottom of the range, which changes the inversion but at
 * least shows every note.
 *
 * Nothing is dropped. A chord diagram missing its seventh is worse than one in
 * an inversion you did not ask for.
 */
export function fitToRange(voicing: Note[], low: number, high: number): Note[] {
	if (voicing.length === 0) return voicing;

	const lowest = Math.min(...voicing.map(midi));
	const highest = Math.max(...voicing.map(midi));

	// Aim the middle of the chord at the middle of the range, in whole octaves.
	let shift = Math.round((low + high) / 2 / 12 - (lowest + highest) / 2 / 12);
	// …then nudge until it is actually inside, in case the rounding overshot.
	while (lowest + shift * 12 < low) shift++;
	while (highest + shift * 12 > high) shift--;

	if (lowest + shift * 12 >= low && highest + shift * 12 <= high) {
		return voicing.map((n) => ({ ...n, octave: n.octave + shift }));
	}

	// Wider than the range: stack the same notes upward from the bottom of it.
	const out: Note[] = [];
	let previous = low - 1;
	for (const n of voicing) {
		let candidate = { ...n };
		while (midi(candidate) < low || midi(candidate) <= previous) {
			candidate = { ...candidate, octave: candidate.octave + 1 };
		}
		previous = midi(candidate);
		out.push(candidate);
	}
	return out;
}

/** Root position, stacked as tightly as the intervals allow. */
export function closeVoicing(c: AbstractChord, octave = 3): Note[] {
	const notes = chordNotes(c, octave);
	const out: Note[] = [];
	let previous = -Infinity;
	for (const n of notes) {
		let candidate = n;
		while (midi(candidate) <= previous) candidate = { ...candidate, octave: candidate.octave + 1 };
		previous = midi(candidate);
		out.push(candidate);
	}
	return out;
}

/**
 * Move the lowest `n` notes up an octave. This is inversion as a keyboard
 * player experiences it — the shape rolls upward and a different chord tone
 * ends up in the bass.
 */
export function invert(voicing: Note[], n: number): Note[] {
	if (n <= 0) return [...voicing];
	const notes = [...voicing];
	for (let i = 0; i < n; i++) {
		const lowest = notes.shift();
		if (!lowest) break;
		let raised = { ...lowest, octave: lowest.octave + 1 };
		const highest = notes[notes.length - 1];
		while (highest && midi(raised) < midi(highest))
			raised = { ...raised, octave: raised.octave + 1 };
		notes.push(raised);
	}
	return notes;
}

/** Diatonic step count for each chord degree, including the compound ones. */
const DEGREE_STEPS: Record<number, number> = { 1: 0, 3: 2, 5: 4, 7: 6, 9: 8, 11: 10, 13: 12 };

/**
 * The interval for a named chord degree, honouring alterations — asking a
 * G7♭9 for its 9 gives the ♭9, because that is the only 9 the chord has.
 */
export function degreeInterval(c: AbstractChord, degree: number): Interval | undefined {
	const target = DEGREE_STEPS[degree];
	if (target === undefined) return undefined;
	const intervals = chordIntervals(c);
	return (
		intervals.find((i) => i.steps === target) ??
		// A 13 written as a plain 6, or a 9 written as a 2, is the same tone.
		(target >= 7 ? intervals.find((i) => i.steps === target - 7) : undefined)
	);
}

/** First available degree from a preference list. */
function preferDegree(c: AbstractChord, degrees: number[]): Interval | undefined {
	for (const d of degrees) {
		const found = degreeInterval(c, d);
		if (found) return found;
	}
	return undefined;
}

/**
 * Shell voicing: root, third and seventh only. The fifth carries no information
 * and the left hand has better things to do with that finger.
 */
export function shellVoicing(
	c: AbstractChord,
	order: '1-3-7' | '1-7-3' = '1-3-7',
	octave = 3
): Note[] {
	const root = { ...c.root, octave };
	const third = preferDegree(c, [3]);
	const seventh = preferDegree(c, [7]);
	if (!third || !seventh) {
		throw new Error('No shell voicing for a chord without a third and a seventh');
	}

	const thirdNote = transpose(root, third);
	const seventhNote = transpose(root, seventh);

	// 1-7-3 puts the seventh below the third, which lands the third on top.
	const ordered =
		order === '1-3-7' ? [root, thirdNote, seventhNote] : [root, seventhNote, thirdNote];
	return stackInOrder(ordered, octave);
}

/**
 * Rootless voicings, the Bill Evans left-hand shapes.
 *
 * Form A stacks 3–5–7–9, form B stacks 7–9–3–5. Dominants swap the fifth for
 * the thirteenth, since the fifth of a dominant is the one note nobody misses.
 * The two forms alternate down a ii–V–I so the hand barely moves — which is the
 * whole reason they are worth learning as a pair rather than individually.
 */
export function rootlessVoicing(c: AbstractChord, form: 'A' | 'B' = 'A', octave = 3): Note[] {
	const root = { ...c.root, octave };
	const colour = c.quality === 'dom' ? [13, 5] : [5, 13];

	const wanted = form === 'A' ? [[3], colour, [7], [9]] : [[7], [9], [3], colour];

	const intervals = wanted
		.map((preferences) => preferDegree(c, preferences))
		.filter((i): i is Interval => Boolean(i));

	if (intervals.length < 3) {
		throw new Error(`No rootless voicing for ${formatChord(c)}`);
	}

	return stackInOrder(
		intervals.map((i) => transpose(root, i)),
		octave
	);
}

/** Drop the second-highest voice down an octave. */
export function drop2(voicing: Note[]): Note[] {
	if (voicing.length < 3) return [...voicing];
	const notes = [...voicing];
	const [dropped] = notes.splice(notes.length - 2, 1);
	return stackAscending([{ ...dropped, octave: dropped.octave - 1 }, ...notes]);
}

/**
 * Stack notes in the order given, each one placed at the lowest octave that
 * still puts it above the previous.
 *
 * Rootless voicings need this rather than a sort: form B *is* the shape with
 * the seventh underneath the ninth. Sorting by pitch would collapse it into
 * form A, which is the one thing the two forms must never do.
 */
function stackInOrder(notes: Note[], startOctave: number): Note[] {
	const out: Note[] = [];
	let previous = -Infinity;
	for (const n of notes) {
		let candidate = { ...n, octave: startOctave };
		while (midi(candidate) <= previous) candidate = { ...candidate, octave: candidate.octave + 1 };
		previous = midi(candidate);
		out.push(candidate);
	}
	return out;
}

/** Order notes low to high, lifting octaves where needed to keep the order strict. */
function stackAscending(notes: Note[]): Note[] {
	const sorted = [...notes].sort((a, b) => midi(a) - midi(b));
	const out: Note[] = [];
	let previous = -Infinity;
	for (const n of sorted) {
		let candidate = n;
		while (midi(candidate) <= previous) candidate = { ...candidate, octave: candidate.octave + 1 };
		previous = midi(candidate);
		out.push(candidate);
	}
	return out;
}

/** Attach a concrete voicing to an abstract chord. */
export function voice(c: AbstractChord, voicing: Note[], inversion: 0 | 1 | 2 | 3 = 0): Chord {
	return { ...c, inversion, voicing };
}

// ---------------------------------------------------------------------------
// Diatonic harmony
// ---------------------------------------------------------------------------

/** Stack thirds on a scale degree. Works for any mode, not just major and minor. */
export function stackThirds(k: Key, degree: number, count: number): Note[] {
	const notes = scale(k);
	const out: Note[] = [];
	for (let i = 0; i < count; i++) {
		const index = degree - 1 + i * 2;
		const wrapped = index % 7;
		const octaveLift = Math.floor(index / 7);
		const n = notes[wrapped];
		out.push({ ...n, octave: n.octave + octaveLift });
	}
	// The scale is built ascending from the tonic, so a degree high in the scale
	// wraps to a lower octave. Re-stack so the chord really ascends.
	return stackAscending(out);
}

/** The diatonic seventh chord on a scale degree, correctly spelled. */
export function diatonicSeventh(k: Key, degree: number): AbstractChord {
	const notes = stackThirds(k, degree, 4);
	return identify(notes);
}

/** The diatonic triad on a scale degree. */
export function diatonicTriad(k: Key, degree: number): AbstractChord {
	return identify(stackThirds(k, degree, 3));
}

/**
 * Name a stack of notes whose lowest note is the root. This is the exact,
 * unambiguous case; `recognise()` in recognise.ts handles the hard one.
 */
export function identify(notes: Note[]): AbstractChord {
	const [root, ...rest] = notes;
	const intervals = rest.map((n) => intervalName(simplifyToOctave(between(root, n))));
	const signature = intervals.join(' ');

	const table: Array<[string, ChordQuality, Extension[]]> = [
		['M3 P5', 'maj', []],
		['m3 P5', 'min', []],
		['M3 A5', 'aug', []],
		['m3 d5', 'min7b5', []],
		['M3 P5 M7', 'maj', [7]],
		['m3 P5 m7', 'min', [7]],
		['M3 P5 m7', 'dom', []],
		['m3 d5 m7', 'min7b5', [7]],
		['m3 d5 d7', 'dim7', []],
		['M3 A5 m7', 'aug', [7]],
		['M3 P5 M6', 'maj6', []],
		['m3 P5 M6', 'min6', []],
		['M2 P5', 'sus2', []],
		['P4 P5', 'sus4', []]
	];

	const match = table.find(([sig]) => sig === signature);
	if (!match) throw new Error(`Cannot identify chord: ${signature}`);

	const [, quality, extensions] = match;
	return { root, quality, extensions, alterations: [] };
}

function simplifyToOctave(interval: Interval): Interval {
	let { steps, semitones } = interval;
	while (steps >= 7) {
		steps -= 7;
		semitones -= 12;
	}
	while (steps < 0) {
		steps += 7;
		semitones += 12;
	}
	return { steps, semitones };
}

// ---------------------------------------------------------------------------
// Symbols
// ---------------------------------------------------------------------------

const QUALITY_SUFFIX: Record<ChordQuality, { ascii: string; unicode: string }> = {
	maj: { ascii: '', unicode: '' },
	min: { ascii: 'm', unicode: 'm' },
	dom: { ascii: '', unicode: '' },
	min7b5: { ascii: 'm7b5', unicode: 'ø' },
	dim7: { ascii: 'dim7', unicode: '°' },
	aug: { ascii: 'aug', unicode: '+' },
	sus2: { ascii: 'sus2', unicode: 'sus2' },
	sus4: { ascii: 'sus4', unicode: 'sus4' },
	maj6: { ascii: '6', unicode: '6' },
	min6: { ascii: 'm6', unicode: 'm6' }
};

/**
 * Render a chord symbol. `unicode` swaps in the proper glyphs — ∆ ø ° ♭ ♯ —
 * which is what the UI shows; ASCII is what fixtures and the database use.
 */
export function formatChord(c: AbstractChord, unicode = false): string {
	const root = formatPitch(c.root, unicode);
	const flat = unicode ? '♭' : 'b';
	const sharp = unicode ? '♯' : '#';

	let symbol = root;
	const highest = [...c.extensions].sort((a, b) => b - a)[0];

	if (c.quality === 'maj' && (c.extensions.includes(7) || highest)) {
		symbol += unicode ? '∆' : 'maj';
		if (highest && highest !== 7) symbol += String(highest);
		else if (!unicode) symbol += '7';
	} else if (c.quality === 'dom') {
		symbol += String(highest && highest !== 7 ? highest : 7);
	} else if (c.quality === 'min7b5') {
		// Without a seventh this is a plain diminished triad, not a half-diminished
		// seventh. The quality list has no separate entry for it.
		if (!c.extensions.includes(7)) symbol += unicode ? '°' : 'dim';
		else symbol += unicode ? 'ø7' : 'm7b5';
	} else if (c.quality === 'dim7') {
		symbol += unicode ? '°7' : 'dim7';
	} else if (c.quality === 'sus4' || c.quality === 'sus2') {
		// The extension goes before the suspension: G7sus4, never Gsus47.
		if (highest) symbol += String(highest);
		symbol += c.quality;
	} else {
		symbol += QUALITY_SUFFIX[c.quality][unicode ? 'unicode' : 'ascii'];
		if (highest) symbol += String(highest);
	}

	for (const alteration of c.alterations) {
		symbol += alteration.replace('b', flat).replace('#', sharp);
	}

	if (c.bass && pitchClass(c.bass) !== pitchClass(c.root)) {
		symbol += `/${formatPitch(c.bass, unicode)}`;
	}

	return symbol;
}

const SYMBOL_PATTERN = /^([A-Ga-g](?:bb|##|[b#♭♯])?)(.*?)(?:\/([A-Ga-g](?:bb|##|[b#♭♯])?))?$/;

/**
 * Parse a chord symbol: `Dm7`, `G7b9`, `Cmaj7`, `Bm7b5`, `F#dim7`, `C/E`.
 * Deliberately forgiving about the ways people write the same chord.
 */
export function parseChord(text: string): AbstractChord {
	const match = SYMBOL_PATTERN.exec(text.trim());
	if (!match) throw new Error(`Not a chord symbol: ${text}`);

	const [, rawRoot, rawBody, rawBass] = match;
	const root = parseNote(rawRoot);
	const body = rawBody.replace(/♭/g, 'b').replace(/♯/g, '#');

	/*
	 * Quality is read *before* alterations are stripped. The `b5` in `m7b5` is
	 * part of the quality token, not an alteration — stripping alterations first
	 * turns a half-diminished chord into a minor seventh with a flat five, which
	 * is a different chord with a different function.
	 *
	 * Ordered longest-first so `maj` wins over `m` and `dim7` over `dim`.
	 */
	const QUALITY_TOKENS: Array<[RegExp, ChordQuality, Extension[]]> = [
		// `sus` is matched anywhere, because the extension is written before it:
		// G7sus4 has its quality token in the middle of the symbol.
		[/sus2/, 'sus2', []],
		[/sus4?/, 'sus4', []],
		[/^(m7b5|min7b5|-7b5|ø7|ø)/, 'min7b5', [7]],
		[/^(dim7|°7|o7)/, 'dim7', []],
		[/^(dim|°|o)(?![a-z])/, 'min7b5', []],
		[/^(aug|\+)/, 'aug', []],
		[/^(maj|Maj|MAJ|M|∆)/, 'maj', [7]],
		[/^(min|m|-)/, 'min', []]
	];

	let quality: ChordQuality | undefined;
	let extensions: Extension[] = [];
	let rest = body;

	for (const [pattern, q, defaults] of QUALITY_TOKENS) {
		const found = pattern.exec(body);
		if (!found) continue;
		quality = q;
		extensions = [...defaults];
		// Cut the quality token out wherever it sat, leaving digits and alterations.
		rest = body.slice(0, found.index) + body.slice(found.index + found[0].length);
		break;
	}

	const alterations: Alteration[] = [];
	for (const alteration of ['b5', '#5', 'b9', '#9', '#11', 'b13'] as Alteration[]) {
		if (rest.includes(alteration)) {
			alterations.push(alteration);
			rest = rest.replace(alteration, '');
		}
	}

	const degreeMatch = /(13|11|9|7|6)/.exec(rest);
	const degree = degreeMatch ? (Number(degreeMatch[1]) as Extension | 6) : undefined;

	if (quality === undefined) {
		// No quality token at all: a bare number means a dominant, a bare 6 a
		// sixth chord, and nothing at all a major triad.
		if (degree === 6) quality = 'maj6';
		else if (degree) {
			quality = 'dom';
			extensions = degree === 7 ? [] : [degree];
		} else quality = 'maj';
	} else if (degree === 6 && quality === 'min') {
		quality = 'min6';
		extensions = [];
	} else if (degree === 6 && quality === 'maj') {
		quality = 'maj6';
		extensions = [];
	} else if (degree && degree !== 6) {
		extensions = [degree];
	}

	// A 13 chord contains its 9 and 7; the symbol names only the top.
	if (extensions.length === 1 && extensions[0] > 7) {
		const top = extensions[0];
		extensions = ([7, 9, 11, 13] as Extension[]).filter(
			(d) => d <= top && (d !== 11 || top === 11)
		);
	}

	return { root, quality, extensions, alterations, bass: rawBass ? parseNote(rawBass) : undefined };
}
