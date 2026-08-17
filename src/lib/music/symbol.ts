import type { AbstractChord } from './chord';
import { formatPitch } from './note';

/**
 * Chord symbols broken into typographic parts.
 *
 * `formatChord` produces a string, which is right for fixtures, the database
 * and Roman numerals. This produces the pieces a renderer needs to set the
 * symbol properly: the accidentals and quality marks are drawn as vector glyphs
 * rather than typed as characters, because ♭ ♯ ∆ ø ° are missing from most
 * display faces and a missing glyph at 14rem is not a subtle failure.
 */

export type SymbolPart =
	| { kind: 'text'; value: string }
	| { kind: 'glyph'; value: Glyph }
	| { kind: 'super'; parts: SymbolPart[] }
	| { kind: 'slash' };

export type Glyph =
	'flat' | 'sharp' | 'doubleFlat' | 'doubleSharp' | 'triangle' | 'halfDim' | 'dim' | 'plus';

function accidentalParts(alter: number): SymbolPart[] {
	if (alter === 0) return [];
	if (alter === -1) return [{ kind: 'glyph', value: 'flat' }];
	if (alter === 1) return [{ kind: 'glyph', value: 'sharp' }];
	if (alter === -2) return [{ kind: 'glyph', value: 'doubleFlat' }];
	if (alter === 2) return [{ kind: 'glyph', value: 'doubleSharp' }];
	return Array.from({ length: Math.abs(alter) }, () => ({
		kind: 'glyph' as const,
		value: alter < 0 ? ('flat' as const) : ('sharp' as const)
	}));
}

function alterationParts(alteration: string): SymbolPart[] {
	const glyph: Glyph = alteration.startsWith('b') ? 'flat' : 'sharp';
	return [
		{ kind: 'glyph', value: glyph },
		{ kind: 'text', value: alteration.slice(1) }
	];
}

/**
 * Split a chord into renderable parts.
 *
 * Extensions and alterations go into a `super` group so they can be set smaller
 * and raised, the way a chart writes them, instead of sitting on the baseline
 * at the same size as the root.
 */
export function chordSymbolParts(c: AbstractChord): SymbolPart[] {
	const parts: SymbolPart[] = [
		{ kind: 'text', value: c.root.letter },
		...accidentalParts(c.root.alter)
	];

	const highest = [...c.extensions].sort((a, b) => b - a)[0];
	const upper: SymbolPart[] = [];
	/**
	 * A `sus` token sits *after* the raised extension — G7sus4, never Gsus4⁷ —
	 * so it is held back and emitted between the two superscript groups.
	 */
	let trailing: SymbolPart[] = [];

	switch (c.quality) {
		case 'maj':
			if (c.extensions.length) {
				parts.push({ kind: 'glyph', value: 'triangle' });
				if (highest && highest !== 7) upper.push({ kind: 'text', value: String(highest) });
			}
			break;
		case 'dom':
			upper.push({ kind: 'text', value: String(highest && highest !== 7 ? highest : 7) });
			break;
		case 'min':
			parts.push({ kind: 'text', value: 'm' });
			if (highest) upper.push({ kind: 'text', value: String(highest) });
			break;
		case 'minMaj':
			parts.push({ kind: 'text', value: 'm' });
			parts.push({ kind: 'glyph', value: 'triangle' });
			upper.push({ kind: 'text', value: String(highest && highest !== 7 ? highest : 7) });
			break;
		case 'min7b5':
			if (c.extensions.includes(7)) {
				parts.push({ kind: 'glyph', value: 'halfDim' });
				upper.push({ kind: 'text', value: '7' });
			} else {
				parts.push({ kind: 'glyph', value: 'dim' });
			}
			break;
		case 'dim7':
			parts.push({ kind: 'glyph', value: 'dim' });
			upper.push({ kind: 'text', value: '7' });
			break;
		case 'aug':
			parts.push({ kind: 'glyph', value: 'plus' });
			if (highest) upper.push({ kind: 'text', value: String(highest) });
			break;
		case 'maj6':
			upper.push({ kind: 'text', value: '6' });
			break;
		case 'min6':
			parts.push({ kind: 'text', value: 'm' });
			upper.push({ kind: 'text', value: '6' });
			break;
		case 'sus2':
			if (highest) upper.push({ kind: 'text', value: String(highest) });
			trailing = [{ kind: 'text', value: 'sus2' }];
			break;
		case 'sus4':
			if (highest) upper.push({ kind: 'text', value: String(highest) });
			trailing = [{ kind: 'text', value: 'sus4' }];
			break;
	}

	const altered = c.alterations.flatMap(alterationParts);

	if (trailing.length) {
		if (upper.length) parts.push({ kind: 'super', parts: upper });
		parts.push(...trailing);
		if (altered.length) parts.push({ kind: 'super', parts: altered });
	} else {
		// No suspension, so extensions and alterations set as one raised group.
		const combined = [...upper, ...altered];
		if (combined.length) parts.push({ kind: 'super', parts: combined });
	}

	// Set on the baseline, not raised: `add9` is a word, and the digit belongs to
	// the word rather than to the stack of extensions above it.
	for (const degree of c.added ?? []) parts.push({ kind: 'text', value: `add${degree}` });

	if (c.bass) {
		parts.push({ kind: 'slash' });
		parts.push({ kind: 'text', value: c.bass.letter });
		parts.push(...accidentalParts(c.bass.alter));
	}

	return parts;
}

/** Plain-text rendering of the same parts, for aria-labels and tooltips. */
export function partsToText(parts: SymbolPart[]): string {
	const glyphText: Record<Glyph, string> = {
		flat: '♭',
		sharp: '♯',
		doubleFlat: '𝄫',
		doubleSharp: '𝄪',
		triangle: '∆',
		halfDim: 'ø',
		dim: '°',
		plus: '+'
	};

	return parts
		.map((part) => {
			if (part.kind === 'text') return part.value;
			if (part.kind === 'glyph') return glyphText[part.value];
			if (part.kind === 'slash') return '/';
			return partsToText(part.parts);
		})
		.join('');
}

/** Spoken form, for screen readers: "E flat minor seven". */
export function chordSymbolLabel(c: AbstractChord): string {
	const spoken: Record<string, string> = {
		maj: 'major',
		min: 'minor',
		minMaj: 'minor major',
		dom: 'dominant',
		min7b5: 'half diminished',
		dim7: 'diminished',
		aug: 'augmented',
		sus2: 'suspended second',
		sus4: 'suspended fourth',
		maj6: 'major sixth',
		min6: 'minor sixth'
	};

	const root = formatPitch(c.root)
		.replace('bb', ' double flat')
		.replace('##', ' double sharp')
		.replace('b', ' flat')
		.replace('#', ' sharp');

	const highest = [...c.extensions].sort((a, b) => b - a)[0];
	// A dominant always has a seventh even when the symbol does not spell it out,
	// so "G dominant" would be a stranger thing to hear than "G dominant 7".
	const spokenExtension = c.quality === 'dom' || c.quality === 'minMaj' ? (highest ?? 7) : highest;
	const extension = spokenExtension ? ` ${spokenExtension}` : '';
	const spokenAdded = (c.added ?? []).map((degree) => ` add ${degree}`).join('');
	const alterations = c.alterations
		.map((a) => ` ${a.startsWith('b') ? 'flat' : 'sharp'} ${a.slice(1)}`)
		.join('');
	const bass = c.bass
		? ` over ${formatPitch(c.bass).replace('b', ' flat').replace('#', ' sharp')}`
		: '';

	return `${root} ${spoken[c.quality]}${extension}${alterations}${spokenAdded}${bass}`;
}
