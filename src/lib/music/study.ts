import { analyse, type Analysis, type ChordCategory } from './analyse';
import type { AbstractChord } from './chord';
import { fifthsDistance, key as makeKey, parallelKey, scale, type Key, type Mode } from './key';
import { ivl, transpose } from './interval';
import { formatNote, pitchClass } from './note';

export type ScaleSuggestion = {
	name: string;
	reason: string;
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
	const add = (name: string, reason: string) => {
		if (!out.some((suggestion) => suggestion.name === name)) out.push({ name, reason });
	};

	const alteredDominant =
		chord.quality === 'dom' &&
		chord.alterations.some((alteration) => ['b9', '#9', '#5', 'b13'].includes(alteration));

	if (alteredDominant) {
		add(root + ' altered', 'Maximum dominant tension; resolve altered notes by step.');
		const parent = formatNote(transpose(chord.root, ivl('m2')), { unicode: true });
		add(parent + ' melodic minor', 'The parent scale of ' + root + ' altered.');
	}

	if (chord.quality === 'dim7') {
		add(
			root + ' whole-half diminished',
			'Repeats the chord tones and adds symmetrical passing tones.'
		);
	} else if (chord.quality === 'min7b5') {
		add(root + ' Locrian natural 2', 'A smoother minor ii sound with a natural ninth.');
		add(root + ' Locrian', 'The strict diatonic choice.');
	} else if (chord.quality === 'aug') {
		add(root + ' whole-tone', 'Matches the augmented fifth and keeps the sound open.');
	}

	if (analysis.category === 'minor-dominant') {
		const tonic = formatNote(analysis.key.tonic, { unicode: true });
		add(tonic + ' harmonic minor', 'Supplies the leading tone that gives this V chord its pull.');
		add(root + ' Phrygian dominant', 'The same notes heard from the dominant root.');
	} else if (analysis.category === 'blues-dominant') {
		add(root + ' Mixolydian', 'The inside sound for the blues IV dominant.');
		const tonic = formatNote(analysis.key.tonic, { unicode: true });
		add(tonic + ' blues', 'Keeps the improvisation tied to the home blues sound.');
		add(root + ' blues', 'Leans fully into the local IV chord colour.');
	} else if (analysis.category === 'tritone-sub' || analysis.category === 'backdoor') {
		add(
			root + ' Lydian dominant',
			'Keeps the dominant shell and gives the substitute its characteristic sharp 11.'
		);
		add(root + ' Mixolydian', 'A plainer dominant sound with less altered colour.');
	} else if (analysis.category === 'secondary-dominant') {
		const targetRoot = transpose(chord.root, ivl('P4'));
		const resolvesToMinor =
			next && pitchClass(next.root) === pitchClass(targetRoot) && MINOR_ISH.has(next.quality);
		if (resolvesToMinor) {
			const target = formatNote(targetRoot, { unicode: true });
			add(target + ' harmonic minor', 'Makes the target minor chord sound temporarily tonic.');
			add(root + ' Phrygian dominant', 'The dominant-root view of that harmonic-minor sound.');
		} else {
			add(root + ' Mixolydian', 'The clear inside sound for an unaltered secondary dominant.');
			add(root + ' altered', 'Adds more tension when the resolution can carry it.');
		}
	} else if (analysis.category === 'borrowed') {
		const source = parallelKey(analysis.key);
		add(formatStudyKey(source), 'The parallel key this chord is borrowed from.');
		const mode = modeAtChordRoot(chord, source);
		if (mode)
			add(root + ' ' + MODE_LABEL[mode], 'The borrowed parent scale heard from the chord root.');
	} else if (analysis.category === 'diatonic') {
		add(formatStudyKey(analysis.key), 'The parent scale of the current key centre.');
		const mode = modeAtChordRoot(chord, analysis.key);
		if (mode && mode !== analysis.key.mode) {
			add(root + ' ' + MODE_LABEL[mode], 'The same seven notes, centred on this chord.');
		}
	}

	if (out.length === 0) {
		if (chord.quality === 'dom')
			add(root + ' Mixolydian', 'A stable starting point for an unaltered dominant chord.');
		else if (MINOR_ISH.has(chord.quality))
			add(root + ' Dorian', 'A flexible minor sound with a natural sixth.');
		else add(root + ' major pentatonic', 'A clear chord-tone-led starting point.');
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
