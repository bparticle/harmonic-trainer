import { analyse, type Analysis, type ChordCategory } from './analyse';
import type { AbstractChord } from './chord';
import { fifthsDistance, key as makeKey, parallelKey, scale, type Key, type Mode } from './key';
import { ivl, transpose } from './interval';
import type { ScaleId } from './scales';
import { formatNote, pitchClass, type Note } from './note';

export type ScaleSuggestion = {
	name: string;
	reason: string;
	/**
	 * The same scale as notes rather than as a phrase.
	 *
	 * `name` is for reading and these are for drawing. Both are needed: a
	 * keyboard diagram cannot be built from "G♭ Lydian dominant", and a panel
	 * that only showed the diagram would have stopped teaching the name.
	 */
	root: Note;
	scale: ScaleId;
};

export type CompatibleContext = {
	key: Key;
	roman: string;
	category: ChordCategory;
	description: string;
};

export type HarmonicStudy = Analysis & {
	annotation: string;
	scales: ScaleSuggestion[];
	compatibleKeys: CompatibleContext[];
};

const MAJOR_TONICS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const MINOR_TONICS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];

const MODE_LABEL: Record<Mode, string> = {
	ionian: 'Ionian',
	dorian: 'Dorian',
	phrygian: 'Phrygian',
	lydian: 'Lydian',
	mixolydian: 'Mixolydian',
	aeolian: 'Aeolian',
	locrian: 'Locrian',
	harmonicMinor: 'harmonic minor',
	melodicMinor: 'melodic minor'
};

const IONIAN_ROTATION: Mode[] = [
	'ionian',
	'dorian',
	'phrygian',
	'lydian',
	'mixolydian',
	'aeolian',
	'locrian'
];

const AEOLIAN_ROTATION: Mode[] = [
	'aeolian',
	'locrian',
	'ionian',
	'dorian',
	'phrygian',
	'lydian',
	'mixolydian'
];

const MINOR_ISH = new Set(['min', 'min7b5', 'dim7', 'min6']);

export function formatStudyKey(k: Key): string {
	const tonic = formatNote(k.tonic, { unicode: true });
	if (k.mode === 'ionian') return tonic + ' major';
	if (k.mode === 'aeolian') return tonic + ' minor';
	if (k.mode === 'harmonicMinor') return tonic + ' harmonic minor';
	if (k.mode === 'melodicMinor') return tonic + ' melodic minor';
	return tonic + ' ' + MODE_LABEL[k.mode];
}

export function formatRoman(roman: string): string {
	return roman
		.replaceAll('b', String.fromCharCode(0x266d))
		.replaceAll('#', String.fromCharCode(0x266f));
}

function sameKey(a: Key, b: Key): boolean {
	return pitchClass(a.tonic) === pitchClass(b.tonic) && a.mode === b.mode;
}

function categoryDescription(category: ChordCategory): string {
	switch (category) {
		case 'diatonic':
			return 'Diatonic';
		case 'minor-dominant':
			return 'Dominant in minor';
		case 'secondary-dominant':
			return 'Secondary dominant';
		case 'blues-dominant':
			return 'Blues dominant';
		case 'borrowed':
			return 'Borrowed';
		case 'tritone-sub':
			return 'Tritone substitute';
		case 'backdoor':
			return 'Backdoor dominant';
		case 'chromatic':
			return 'Chromatic';
	}
}

function annotationFor(analysis: Analysis): string {
	if (analysis.modulation)
		return String.fromCharCode(0x2192) + ' ' + formatStudyKey(analysis.modulation.to);
	if (analysis.pivot) return 'Pivot to ' + formatStudyKey(analysis.pivot.to);
	switch (analysis.category) {
		case 'diatonic':
			return 'In key';
		case 'minor-dominant':
			return 'Harmonic minor';
		case 'blues-dominant':
			return 'Blues IV';
		case 'secondary-dominant': {
			const target = analysis.roman.split('/')[1];
			return target ? 'To ' + formatRoman(target) : 'Tonicizing';
		}
		case 'borrowed':
			return 'Borrowed';
		case 'tritone-sub':
			return 'Tritone sub';
		case 'backdoor':
			return 'Backdoor';
		case 'chromatic':
			return 'Outside key';
	}
}

function modeAtChordRoot(chord: AbstractChord, k: Key): Mode | null {
	if (k.mode !== 'ionian' && k.mode !== 'aeolian') return null;
	const index = scale(k).findIndex((note) => pitchClass(note) === pitchClass(chord.root));
	if (index < 0) return null;
	return (k.mode === 'ionian' ? IONIAN_ROTATION : AEOLIAN_ROTATION)[index];
}

function suggestionsFor(analysis: Analysis, next: AbstractChord | undefined): ScaleSuggestion[] {
	const chord = analysis.chord;
	const root = formatNote(chord.root, { unicode: true });
	const out: ScaleSuggestion[] = [];
	/*
	 * `name` is the phrase and `from`/`id` are the same scale as notes. They are
	 * passed separately rather than derived from one another because the phrase
	 * is not always the scale's own name: the parent key of a diatonic chord
	 * reads as "B♭ major", not "B♭ Ionian".
	 */
	const add = (name: string, reason: string, from: Note, id: ScaleId) => {
		if (!out.some((suggestion) => suggestion.name === name)) {
			out.push({ name, reason, root: from, scale: id });
		}
	};

	const alteredDominant =
		chord.quality === 'dom' &&
		chord.alterations.some((alteration) => ['b9', '#9', '#5', 'b13'].includes(alteration));

	if (alteredDominant) {
		add(
			root + ' altered',
			'Maximum dominant tension; resolve altered notes by step.',
			chord.root,
			'altered'
		);
		const parentRoot = transpose(chord.root, ivl('m2'));
		const parent = formatNote(parentRoot, { unicode: true });
		add(
			parent + ' melodic minor',
			'The parent scale of ' + root + ' altered.',
			parentRoot,
			'melodicMinor'
		);
	}

	if (chord.quality === 'dim7') {
		add(
			root + ' whole-half diminished',
			'Repeats the chord tones and adds symmetrical passing tones.',
			chord.root,
			'wholeHalfDiminished'
		);
	} else if (chord.quality === 'min7b5') {
		add(
			root + ' Locrian natural 2',
			'A smoother minor ii sound with a natural ninth.',
			chord.root,
			'locrianNatural2'
		);
		add(root + ' Locrian', 'The strict diatonic choice.', chord.root, 'locrian');
	} else if (chord.quality === 'aug') {
		add(
			root + ' whole-tone',
			'Matches the augmented fifth and keeps the sound open.',
			chord.root,
			'wholeTone'
		);
	}

	if (analysis.category === 'minor-dominant') {
		const tonic = formatNote(analysis.key.tonic, { unicode: true });
		add(
			tonic + ' harmonic minor',
			'Supplies the leading tone that gives this V chord its pull.',
			analysis.key.tonic,
			'harmonicMinor'
		);
		add(
			root + ' Phrygian dominant',
			'The same notes heard from the dominant root.',
			chord.root,
			'phrygianDominant'
		);
	} else if (analysis.category === 'blues-dominant') {
		add(
			root + ' Mixolydian',
			'The inside sound for the blues IV dominant.',
			chord.root,
			'mixolydian'
		);
		const tonic = formatNote(analysis.key.tonic, { unicode: true });
		add(
			tonic + ' blues',
			'Keeps the improvisation tied to the home blues sound.',
			analysis.key.tonic,
			'blues'
		);
		add(root + ' blues', 'Leans fully into the local IV chord colour.', chord.root, 'blues');
	} else if (analysis.category === 'tritone-sub' || analysis.category === 'backdoor') {
		add(
			root + ' Lydian dominant',
			'Keeps the dominant shell and gives the substitute its characteristic sharp 11.',
			chord.root,
			'lydianDominant'
		);
		add(
			root + ' Mixolydian',
			'A plainer dominant sound with less altered colour.',
			chord.root,
			'mixolydian'
		);
	} else if (analysis.category === 'secondary-dominant') {
		const targetRoot = transpose(chord.root, ivl('P4'));
		const resolvesToMinor =
			next && pitchClass(next.root) === pitchClass(targetRoot) && MINOR_ISH.has(next.quality);
		if (resolvesToMinor) {
			const target = formatNote(targetRoot, { unicode: true });
			add(
				target + ' harmonic minor',
				'Makes the target minor chord sound temporarily tonic.',
				targetRoot,
				'harmonicMinor'
			);
			add(
				root + ' Phrygian dominant',
				'The dominant-root view of that harmonic-minor sound.',
				chord.root,
				'phrygianDominant'
			);
		} else {
			add(
				root + ' Mixolydian',
				'The clear inside sound for an unaltered secondary dominant.',
				chord.root,
				'mixolydian'
			);
			add(
				root + ' altered',
				'Adds more tension when the resolution can carry it.',
				chord.root,
				'altered'
			);
		}
	} else if (analysis.category === 'borrowed') {
		const source = parallelKey(analysis.key);
		add(
			formatStudyKey(source),
			'The parallel key this chord is borrowed from.',
			source.tonic,
			source.mode
		);
		const mode = modeAtChordRoot(chord, source);
		if (mode) {
			add(
				root + ' ' + MODE_LABEL[mode],
				'The borrowed parent scale heard from the chord root.',
				chord.root,
				mode
			);
		}
	} else if (analysis.category === 'diatonic') {
		add(
			formatStudyKey(analysis.key),
			'The parent scale of the current key centre.',
			analysis.key.tonic,
			analysis.key.mode
		);
		const mode = modeAtChordRoot(chord, analysis.key);
		if (mode && mode !== analysis.key.mode) {
			add(
				root + ' ' + MODE_LABEL[mode],
				'The same seven notes, centred on this chord.',
				chord.root,
				mode
			);
		}
	}

	if (out.length === 0) {
		if (chord.quality === 'dom') {
			add(
				root + ' Mixolydian',
				'A stable starting point for an unaltered dominant chord.',
				chord.root,
				'mixolydian'
			);
		} else if (MINOR_ISH.has(chord.quality)) {
			add(root + ' Dorian', 'A flexible minor sound with a natural sixth.', chord.root, 'dorian');
		} else {
			add(
				root + ' major pentatonic',
				'A clear chord-tone-led starting point.',
				chord.root,
				'majorPentatonic'
			);
		}
	}

	return out.slice(0, 3);
}

function compatibleContexts(chord: AbstractChord, activeKey: Key): CompatibleContext[] {
	const candidates = [
		...MAJOR_TONICS.map((tonic) => makeKey(tonic, 'ionian')),
		...MINOR_TONICS.map((tonic) => makeKey(tonic, 'aeolian'))
	];

	const useful = new Set<ChordCategory>([
		'diatonic',
		'minor-dominant',
		'secondary-dominant',
		'borrowed',
		'blues-dominant'
	]);

	const categoryRank: Record<ChordCategory, number> = {
		diatonic: 0,
		'minor-dominant': 0,
		borrowed: 1,
		'secondary-dominant': 2,
		'blues-dominant': 1,
		backdoor: 3,
		'tritone-sub': 3,
		chromatic: 4
	};

	return candidates
		.map((candidate) => {
			const context = analyse([chord], candidate)[0];
			return {
				key: candidate,
				roman: context.roman,
				category: context.category,
				description: categoryDescription(context.category)
			};
		})
		.filter((context) => useful.has(context.category))
		.sort((a, b) => {
			if (sameKey(a.key, activeKey) !== sameKey(b.key, activeKey)) {
				return sameKey(a.key, activeKey) ? -1 : 1;
			}
			const categoryDifference = categoryRank[a.category] - categoryRank[b.category];
			if (categoryDifference !== 0) return categoryDifference;
			return fifthsDistance(activeKey, a.key) - fifthsDistance(activeKey, b.key);
		});
}

export function studyProgression(chords: AbstractChord[], homeKey: Key): HarmonicStudy[] {
	const analyses = analyse(chords, homeKey);
	return analyses.map((analysis, index) => ({
		...analysis,
		annotation: annotationFor(analysis),
		scales: suggestionsFor(analysis, chords[index + 1]),
		compatibleKeys: compatibleContexts(analysis.chord, analysis.key)
	}));
}
