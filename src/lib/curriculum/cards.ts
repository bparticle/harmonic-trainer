import {
	chordPitchClasses,
	closeVoicing,
	diatonicSeventh,
	diatonicTriad,
	formatChord,
	invert,
	rootlessVoicing,
	shellVoicing,
	type AbstractChord
} from '$lib/music/chord';
import { BRIGHTNESS_ORDER, formatKey, key as makeKey, scale, type Key } from '$lib/music/key';
import { transpose, ivl } from '$lib/music/interval';
import { formatNote, midi, pitchClass } from '$lib/music/note';
import { spell } from '$lib/music/spell';
import type { CardDirection } from '$lib/server/db/schema';
import type { GeneratorSpec, SkillSeed } from './skills';

/**
 * Cards are generated, never authored.
 *
 * A card is (skill, key, instance, direction). The first three say what the
 * material is; the fourth says which way round you are being asked, and each
 * direction is a separate card with its own schedule — because hearing,
 * naming, playing and reading a shape off the wheel are genuinely different
 * skills. You can hear a chord you cannot name.
 *
 * Everything is transposed by parameter. No key is ever written into a card.
 */

export const ALL_DIRECTIONS: CardDirection[] = [
	'hear_name',
	'hear_play',
	'see_play',
	'play_name'
];

/** The twelve keys in circle-of-fifths order, so the curriculum walks the wheel. */
export const CIRCLE_KEYS = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

/**
 * What a card asks. `answerPitchClasses` is what has to be played or named;
 * `prompt` is what the screen or the speakers give you.
 */
export type CardPayload = {
	kind: string;
	/** Chord symbols, scale names, or whatever the item is called. */
	label: string;
	/** Concert pitch classes of the answer. */
	answerPitchClasses: number[];
	/** MIDI notes for a specific voicing, when the voicing is the point. */
	answerVoicing?: number[];
	/** Roman numeral or degree label, for the naming directions. */
	degree?: string;
	/** Extra context the drill needs, such as which inversion or form. */
	detail?: string;
};

export type GeneratedCard = {
	skillCode: string;
	keyCenter: string;
	direction: CardDirection;
	payload: CardPayload;
	/** Stable across regeneration, so re-seeding does not orphan review history. */
	identity: string;
};

/**
 * Directions that make no sense for a given item.
 *
 * A scale has no single shape on the wheel worth reading back, and an
 * inversion drill is about where your hands go, not about naming anything.
 * Generating cards nobody can answer would quietly poison the accuracy stats.
 */
function directionsFor(kind: string): CardDirection[] {
	switch (kind) {
		case 'scale':
		case 'mode':
			return ['hear_play', 'see_play', 'play_name'];
		case 'inversion':
		case 'shell':
		case 'rootless':
		case 'quartal':
			return ['hear_play', 'see_play'];
		default:
			return ALL_DIRECTIONS;
	}
}

const keyOf = (pc: number, minor = false) =>
	makeKey(spell(pc, makeKey('C')), minor ? 'aeolian' : 'ionian');

const voicingMidi = (notes: ReturnType<typeof closeVoicing>) => notes.map(midi);

// ---------------------------------------------------------------------------
// Item generation, one function per generator kind
// ---------------------------------------------------------------------------

function diatonicSeventhItems(k: Key, triadsOnly: boolean): CardPayload[] {
	const roman = k.mode === 'aeolian'
		? ['i', 'ii°', '♭III', 'iv', 'v', '♭VI', '♭VII']
		: ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];

	return [1, 2, 3, 4, 5, 6, 7].map((degree) => {
		const chord = triadsOnly ? diatonicTriad(k, degree) : diatonicSeventh(k, degree);
		return {
			kind: 'chord',
			label: formatChord(chord),
			answerPitchClasses: chordPitchClasses(chord),
			answerVoicing: voicingMidi(closeVoicing(chord, 3)),
			degree: roman[degree - 1]
		};
	});
}

function scaleItem(k: Key, mode: string): CardPayload {
	return {
		kind: 'scale',
		label: `${formatKey(k)} ${mode}`,
		answerPitchClasses: scale(k).map(pitchClass),
		detail: mode
	};
}

function inversionItems(k: Key, sevenths: boolean): CardPayload[] {
	const names = ['root position', '1st inversion', '2nd inversion', '3rd inversion'];
	const out: CardPayload[] = [];

	for (const degree of [1, 2, 4, 5, 6]) {
		const chord = sevenths ? diatonicSeventh(k, degree) : diatonicTriad(k, degree);
		const positions = sevenths ? 4 : 3;
		for (let inversion = 0; inversion < positions; inversion++) {
			const voicing = invert(closeVoicing(chord, 3), inversion);
			out.push({
				kind: 'inversion',
				label: formatChord(chord),
				answerPitchClasses: chordPitchClasses(chord),
				answerVoicing: voicingMidi(voicing),
				detail: names[inversion]
			});
		}
	}
	return out;
}

function shellItems(k: Key, orders: Array<'1-3-7' | '1-7-3'>): CardPayload[] {
	const out: CardPayload[] = [];
	for (const degree of [2, 5, 1]) {
		const chord = diatonicSeventh(k, degree);
		for (const order of orders) {
			out.push({
				kind: 'shell',
				label: formatChord(chord),
				answerPitchClasses: chordPitchClasses(chord),
				answerVoicing: voicingMidi(shellVoicing(chord, order, 3)),
				detail: `shell ${order}`
			});
		}
	}
	return out;
}

function twoFiveOneItems(k: Key, quality: 'major' | 'minor'): CardPayload[] {
	const context = quality === 'minor' ? makeKey(k.tonic, 'aeolian') : k;
	const two = diatonicSeventh(context, 2);
	const one = diatonicSeventh(context, 1);

	// A minor ii-V borrows its major third from harmonic minor, or it does not pull.
	const five: AbstractChord =
		quality === 'minor'
			? {
					root: transpose(context.tonic, ivl('P5')),
					quality: 'dom',
					extensions: [],
					alterations: []
				}
			: diatonicSeventh(context, 5);

	const progression = [two, five, one];
	return [
		{
			kind: 'progression',
			label: progression.map((c) => formatChord(c)).join(' – '),
			answerPitchClasses: [...new Set(progression.flatMap(chordPitchClasses))],
			answerVoicing: progression.flatMap((c) => voicingMidi(shellVoicing(c, '1-3-7', 3))),
			degree: quality === 'minor' ? 'iiø – V7 – i' : 'ii – V – I'
		}
	];
}

function rootlessItems(k: Key, forms: Array<'A' | 'B'>): CardPayload[] {
	const out: CardPayload[] = [];
	for (const degree of [2, 5, 1]) {
		const chord = diatonicSeventh(k, degree);
		// Rootless voicings want the ninth; the plain seventh has nothing to drop to.
		const extended: AbstractChord = { ...chord, extensions: [...chord.extensions, 9] };
		for (const form of forms) {
			try {
				out.push({
					kind: 'rootless',
					label: formatChord(extended),
					answerPitchClasses: chordPitchClasses(extended),
					answerVoicing: voicingMidi(rootlessVoicing(extended, form, 3)),
					detail: `form ${form}`
				});
			} catch {
				// A chord with no third or seventh has no rootless form. Skip it
				// rather than generating a card with no answer.
			}
		}
	}
	return out;
}

function modeItems(k: Key): CardPayload[] {
	return BRIGHTNESS_ORDER.map((mode, rank) => {
		const modal = makeKey(k.tonic, mode);
		return {
			kind: 'mode',
			label: `${formatNote(k.tonic)} ${mode}`,
			answerPitchClasses: scale(modal).map(pitchClass),
			detail: rank === 0 ? 'brightest' : rank === 6 ? 'darkest' : `${rank} flatter than lydian`
		};
	});
}

function appliedDominantItems(k: Key, substitutes: boolean): CardPayload[] {
	const out: CardPayload[] = [];
	const targets = [2, 3, 4, 5, 6];

	for (const degree of targets) {
		const target = diatonicSeventh(k, degree);
		const dominant: AbstractChord = {
			root: transpose(target.root, ivl('P5')),
			quality: 'dom',
			extensions: [],
			alterations: []
		};
		// Indexed by degree, so one-based: degree 6 is the vi chord.
		const numeral = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'][degree - 1] ?? String(degree);

		out.push({
			kind: 'applied-dominant',
			label: `${formatChord(dominant)} → ${formatChord(target)}`,
			answerPitchClasses: chordPitchClasses(dominant),
			answerVoicing: voicingMidi(shellVoicing(dominant, '1-3-7', 3)),
			degree: `V7/${numeral}`
		});

		if (substitutes) {
			// Straight across the wheel: same third and seventh, roles swapped.
			const sub: AbstractChord = {
				root: transpose(dominant.root, ivl('d5')),
				quality: 'dom',
				extensions: [],
				alterations: []
			};
			out.push({
				kind: 'tritone-sub',
				label: `${formatChord(sub)} → ${formatChord(target)}`,
				answerPitchClasses: chordPitchClasses(sub),
				answerVoicing: voicingMidi(shellVoicing(sub, '1-3-7', 3)),
				degree: `subV7/${numeral}`
			});
		}
	}
	return out;
}

const BORROWED: Record<string, { interval: string; quality: AbstractChord['quality']; extensions: number[] }> = {
	iv: { interval: 'P4', quality: 'min', extensions: [7] },
	bVI: { interval: 'm6', quality: 'maj', extensions: [7] },
	bVII: { interval: 'm7', quality: 'dom', extensions: [] },
	bIII: { interval: 'm3', quality: 'maj', extensions: [7] }
};

function borrowedItems(k: Key, degrees: string[]): CardPayload[] {
	return degrees
		.filter((d) => d in BORROWED)
		.map((degree) => {
			const spec = BORROWED[degree];
			const chord: AbstractChord = {
				root: transpose(k.tonic, ivl(spec.interval)),
				quality: spec.quality,
				extensions: spec.extensions as AbstractChord['extensions'],
				alterations: []
			};
			return {
				kind: 'borrowed',
				label: formatChord(chord),
				answerPitchClasses: chordPitchClasses(chord),
				answerVoicing: voicingMidi(closeVoicing(chord, 3)),
				degree,
				detail: `borrowed from ${formatNote(k.tonic)} minor`
			};
		});
}

function modulationItems(k: Key, distances: number[]): CardPayload[] {
	return distances.flatMap((distance) =>
		[1, -1].map((direction) => {
			const steps = distance * direction;
			const targetPc = (((pitchClass(k.tonic) + steps * 7) % 12) + 12) % 12;
			const target = keyOf(targetPc);
			const pivot = diatonicSeventh(target, 2);
			return {
				kind: 'modulation',
				label: `${formatKey(k)} → ${formatKey(target)}`,
				answerPitchClasses: scale(target).map(pitchClass),
				answerVoicing: voicingMidi(closeVoicing(pivot, 3)),
				detail: `${distance} step${distance === 1 ? '' : 's'} ${direction > 0 ? 'sharpwards' : 'flatwards'}`
			};
		})
	);
}

function upperStructureItems(k: Key): CardPayload[] {
	// The triads that sit usefully over a dominant, as intervals above its root.
	const structures = [
		{ interval: 'M2', name: 'II', colour: '9, ♯11, 13' },
		{ interval: 'A4', name: '♯IV', colour: '♯11, 7, 9' },
		{ interval: 'm6', name: '♭VI', colour: '♭13, root, ♯9' },
		{ interval: 'm7', name: '♭VII', colour: '♭7, 9, 11' }
	];

	const dominant = diatonicSeventh(k, 5);
	return structures.map((structure) => {
		const triad: AbstractChord = {
			root: transpose(dominant.root, ivl(structure.interval)),
			quality: 'maj',
			extensions: [],
			alterations: []
		};
		return {
			kind: 'upper-structure',
			label: `${formatChord(triad)} over ${formatChord(dominant)}`,
			answerPitchClasses: [
				...new Set([...chordPitchClasses(dominant), ...chordPitchClasses(triad)])
			],
			answerVoicing: [
				...voicingMidi(shellVoicing(dominant, '1-3-7', 2)),
				...voicingMidi(closeVoicing(triad, 4))
			],
			degree: `${structure.name} / V7`,
			detail: `gives the ${structure.colour}`
		};
	});
}

function quartalItems(k: Key): CardPayload[] {
	// Three fourths stacked from each of the first four scale degrees.
	return scale(k)
		.slice(0, 4)
		.map((bottom) => {
			const stack = [{ ...bottom, octave: 3 }];
			for (let i = 0; i < 2; i++) {
				stack.push(transpose(stack[stack.length - 1], ivl('P4')));
			}
			return {
				kind: 'quartal',
				label: `quartal on ${formatNote(bottom)}`,
				answerPitchClasses: stack.map(pitchClass),
				answerVoicing: stack.map(midi),
				detail: 'stacked fourths'
			};
		});
}

function chartItem(chart: string, k: Key): CardPayload {
	return {
		kind: 'chart',
		label: `${chart} in ${formatKey(k)}`,
		answerPitchClasses: scale(k).map(pitchClass),
		detail: chart
	};
}

// ---------------------------------------------------------------------------

/** Items for one skill in one key. */
export function itemsFor(spec: GeneratorSpec, k: Key): CardPayload[] {
	switch (spec.kind) {
		case 'scale':
			return [scaleItem(makeKey(k.tonic, spec.mode), spec.mode)];
		case 'diatonic-sevenths':
			return diatonicSeventhItems(k, spec.triadsOnly ?? false);
		case 'inversions':
			return inversionItems(k, spec.sevenths);
		case 'shells':
			return shellItems(k, spec.orders);
		case 'two-five-one':
			return twoFiveOneItems(k, spec.quality);
		case 'rootless':
			return rootlessItems(k, spec.forms);
		case 'modes':
			return modeItems(k);
		case 'applied-dominants':
			return appliedDominantItems(k, spec.substitutes);
		case 'borrowed':
			return borrowedItems(k, spec.degrees);
		case 'modulation':
			return modulationItems(k, spec.distances);
		case 'upper-structures':
			return upperStructureItems(k);
		case 'quartal':
			return quartalItems(k);
		case 'chart':
			return [chartItem(spec.chart, k)];
		case 'inventory':
		case 'none':
			// Captured from playing, or not drilled at all.
			return [];
	}
}

/**
 * Every card for a skill, across every key and every direction that applies.
 *
 * `identity` is a stable string rather than a random id so re-seeding matches
 * existing cards instead of orphaning their review history.
 */
export function cardsForSkill(skill: SkillSeed, keys = CIRCLE_KEYS): GeneratedCard[] {
	const out: GeneratedCard[] = [];
	const minorSkill = skill.generator.kind === 'two-five-one' && skill.generator.quality === 'minor';

	for (const pc of keys) {
		const k = keyOf(pc, minorSkill);
		const keyCenter = formatKey(k);

		for (const item of itemsFor(skill.generator, k)) {
			for (const direction of directionsFor(item.kind)) {
				out.push({
					skillCode: skill.code,
					keyCenter,
					direction,
					payload: item,
					identity: `${skill.code}|${keyCenter}|${item.kind}|${item.label}|${item.detail ?? ''}|${direction}`
				});
			}
		}
	}
	return out;
}

export function cardsForCurriculum(skills: SkillSeed[]): GeneratedCard[] {
	return skills.flatMap((skill) => cardsForSkill(skill));
}
