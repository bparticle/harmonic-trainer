import { demandOfNumerals } from './vocabulary';
import { describe, expect, it } from 'vitest';
import {
	PROGRESSIONS,
	chordFromNumeral,
	progressionById,
	progressionsAtLevel,
	realiseProgression
} from './progressions';
import { formatChord, parseChord } from '$lib/music/chord';
import { romanNumeral } from '$lib/music/analyse';
import { key as makeKey, parseKey } from '$lib/music/key';
import { STAGES } from './ladder';

const symbolOf = (numeral: string, keyName: string) =>
	formatChord(chordFromNumeral(numeral, parseKey(keyName)));

describe('Roman numerals into chords', () => {
	it('reads the plain diatonic triads of C', () => {
		expect(['I', 'ii', 'iii', 'IV', 'V', 'vi'].map((n) => symbolOf(n, 'C'))).toEqual([
			'C',
			'Dm',
			'Em',
			'F',
			'G',
			'Am'
		]);
	});

	it('reads sevenths', () => {
		expect(symbolOf('ii7', 'C')).toBe('Dm7');
		expect(symbolOf('V7', 'C')).toBe('G7');
		expect(symbolOf('Imaj7', 'C')).toBe('Cmaj7');
	});

	it('reads half-diminished and diminished', () => {
		expect(symbolOf('iiø7', 'Am')).toBe('Bm7b5');
		expect(symbolOf('vii°', 'C')).toBe('Bdim');
	});

	it('reads the augmented triad and the augmented seventh', () => {
		// Charts write it +, the analysis writes it aug, and both have to come back
		// with the raised fifth still on them.
		expect(symbolOf('Iaug', 'C')).toBe('Caug');
		expect(symbolOf('IIIaug7', 'Ab')).toBe('Caug7');
		expect(symbolOf('III+7', 'Ab')).toBe('Caug7');
	});

	it('reads the upper extensions without losing the seventh underneath', () => {
		// A suffix it did not recognise used to fall through to a bare triad, so a
		// V13 came back as a major chord — the ninth gone and the seventh with it.
		expect(symbolOf('ii9', 'C')).toBe('Dm9');
		expect(symbolOf('V13', 'C')).toBe('G13');
		expect(symbolOf('Imaj9', 'C')).toBe('Cmaj9');
		expect(symbolOf('ii11', 'C')).toBe('Dm11');
	});

	it('keeps a half-diminished chord half-diminished', () => {
		// Written m7b5 by the analysis and ø7 by hand. Read as a plain seventh, the
		// ii of every minor ii–V quietly turned major-key.
		expect(symbolOf('viim7b5', 'C')).toBe('Bm7b5');
		expect(symbolOf('viiø7', 'C')).toBe('Bm7b5');
	});

	it('reads suspensions and alterations', () => {
		expect(symbolOf('Isus4', 'C')).toBe('Csus4');
		expect(symbolOf('I7sus4', 'C')).toBe('C7sus4');
		expect(symbolOf('V7b9', 'C')).toBe('G7b9');
		expect(symbolOf('V7#11', 'C')).toBe('G7#11');
	});

	it('takes a bare lowercase numeral to mean whatever the key makes it', () => {
		// vii in a major key is diminished; ii is not.
		expect(symbolOf('vii', 'C')).toBe('Bdim');
		expect(symbolOf('ii', 'C')).toBe('Dm');
	});

	it('reads chromatic roots', () => {
		expect(symbolOf('bVII7', 'C')).toBe('Bb7');
		expect(symbolOf('bII7', 'C')).toBe('Db7');
		expect(symbolOf('bVI', 'C')).toBe('Ab');
	});

	it('reads applied dominants as a fifth above their target', () => {
		expect(symbolOf('V7/vi', 'C')).toBe('E7');
		expect(symbolOf('V7/ii', 'C')).toBe('A7');
		expect(symbolOf('V7/V', 'C')).toBe('D7');
	});

	it('reads a slash bass as a degree of the key', () => {
		// Arabic after the slash is a bass note, Roman is an applied dominant. The
		// bass is counted from the key like everything else here, so the B under a
		// G triad in C is the seventh degree and not the chord's own third.
		expect(symbolOf('I/3', 'C')).toBe('C/E');
		expect(symbolOf('V/7', 'C')).toBe('G/B');
		expect(symbolOf('IV/1', 'C')).toBe('F/C');
	});

	it('keeps the bass on a chord that has a quality and extensions', () => {
		expect(symbolOf('ii7/4', 'C')).toBe('Dm7/F');
		expect(symbolOf('Imaj9/5', 'C')).toBe('Cmaj9/G');
	});

	it('reads an altered bass degree', () => {
		expect(symbolOf('I/b3', 'C')).toBe('C/Eb');
		expect(symbolOf('I/b7', 'C')).toBe('C/Bb');
	});

	it('transposes a slash chord like any other numeral', () => {
		expect(symbolOf('I/3', 'Eb')).toBe('Eb/G');
		expect(symbolOf('V/7', 'F')).toBe('C/E');
		expect(symbolOf('I/b3', 'A')).toBe('A/C');
	});

	it('does not mistake an applied dominant for a bass note', () => {
		// The two share a slash, and the whole disambiguation is Roman versus
		// Arabic. Nothing already written may change meaning.
		expect(symbolOf('V7/vi', 'C')).toBe('E7');
		expect(symbolOf('V7/V', 'C')).toBe('D7');
	});

	it('transposes: the same numeral is a different chord in each key', () => {
		expect(symbolOf('ii7', 'Eb')).toBe('Fm7');
		expect(symbolOf('V7', 'Eb')).toBe('Bb7');
		expect(symbolOf('bII7', 'Eb')).toBe('E7');
		expect(symbolOf('ii7', 'B')).toBe('C#m7');
	});

	it('raises with a sharp and lowers with a flat, keeping the letter', () => {
		// The numeral says which way the note moved; re-spelling through the key
		// threw that away and returned whichever accidental the key preferred.
		expect(symbolOf('#I', 'F')).toBe('F#');
		expect(symbolOf('bV7', 'C')).toBe('Gb7');
		expect(symbolOf('bVI7', 'C')).toBe('Ab7');
		expect(symbolOf('#iv°7', 'C')).toBe('F#dim7');
	});

	it('writes E rather than F♭, and F rather than E♯', () => {
		// Both are correct by letter arithmetic and neither is ever written.
		expect(symbolOf('bII7', 'Eb')).toBe('E7');
		expect(symbolOf('bV7', 'B')).toBe('F7');
		expect(symbolOf('#iv°7', 'B')).toBe('Fdim7');
	});

	it('reads minor numerals from the major scale, as charts are written', () => {
		// ♭VI in C minor is A♭, counted from C major. Counting it from aeolian —
		// which already has a flat sixth — flattened it a second time.
		expect(symbolOf('bVI7', 'C')).toBe('Ab7');
		expect(symbolOf('i7', 'C')).toBe('Cm7');
		expect(symbolOf('iv7', 'C')).toBe('Fm7');
	});

	it('refuses nonsense', () => {
		expect(() => chordFromNumeral('Q', makeKey('C'))).toThrow();
		expect(() => chordFromNumeral('', makeKey('C'))).toThrow();
	});

	it('carries a minor-major seventh', () => {
		expect(symbolOf('imMaj7', 'A')).toBe('AmMaj7');
		expect(symbolOf('imMaj7', 'C')).toBe('CmMaj7');
		expect(symbolOf('imMaj9', 'A')).toBe('AmMaj9');
		expect(symbolOf('imMaj7/7', 'A')).toBe('AmMaj7/G#');
	});

	it('carries an added tone without turning it into an extension', () => {
		expect(symbolOf('iadd2', 'A')).toBe('Amadd2');
		expect(symbolOf('iadd9', 'A')).toBe('Amadd9');
		expect(symbolOf('Iadd9', 'A')).toBe('Aadd9');
		expect(symbolOf('iadd9', 'Eb')).toBe('Ebmadd9');
	});
});

/**
 * The property the songbook actually rests on.
 *
 * A chart is stored as numerals and resolved back when it is played, so a chord
 * that cannot make that trip is a chord the app will play wrongly — quietly, in
 * a tune someone is practising. Round-tripping is the whole contract.
 */
describe('chords survive being stored as numerals', () => {
	const symbols = [
		'AmMaj7',
		'AmMaj9',
		'Amadd2',
		'Amadd9',
		'Aadd9',
		'Amadd2/G#',
		'Csus4add9',
		'Am7',
		'Am9',
		'Am',
		'Amaj7',
		'F#m7b5',
		'Adim/Eb',
		'C/G',
		'G7b9',
		'D/F#'
	];

	// Two keys, not twelve: the numeral must survive the trip *and* stay the same
	// chord when it is read from a different tonic. Far keys are left out because
	// they test enharmonic spelling of the bass, which is a separate question with
	// its own tests.
	it.each(symbols)('%s', (symbol) => {
		for (const keyName of ['A', 'C']) {
			const k = parseKey(keyName);
			const written = parseChord(symbol);
			const stored = romanNumeral(written, k);
			expect(formatChord(chordFromNumeral(stored, k)), `${symbol} in ${keyName} (${stored})`).toBe(
				formatChord(written)
			);
		}
	});
});

describe('the progression library', () => {
	it('has unique ids', () => {
		const ids = PROGRESSIONS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('starts easy', () => {
		const first = progressionsAtLevel(1);
		expect(first.length).toBeGreaterThanOrEqual(3);
		// Level one is triads only: no sevenths, no chromatic roots.
		for (const p of first) {
			for (const numeral of p.numerals) {
				expect(numeral, `${p.id}: ${numeral}`).not.toMatch(/7|b|#|\//);
			}
		}
	});

	it('gets harder in steps', () => {
		expect(progressionsAtLevel(3).some((p) => p.id === 'ii-V-I')).toBe(true);
		expect(progressionsAtLevel(5).some((p) => p.id === 'blues-basic')).toBe(true);
		expect(progressionsAtLevel(7).some((p) => p.id === 'tritone-sub')).toBe(true);
	});

	/*
	 * From level four up, one level is one way out of the key.
	 *
	 * The property the readiness gate leans on, asserted here rather than there
	 * because it is a fact about the library rather than about the gate. Before
	 * this the top two levels held four different devices between them, and
	 * meeting any one progression on level five unlocked the whole back half of
	 * the songbook.
	 */
	it('gives each level above three a single way out of the key', () => {
		const devicesAt = new Map<number, Set<string>>();
		for (const p of PROGRESSIONS) {
			const demand = demandOfNumerals(p.numerals, p.mode);
			if (p.level <= 3) {
				expect(demand.devices, `${p.id} is level ${p.level}`).toEqual([]);
				continue;
			}
			expect(demand.devices.length, p.id).toBe(1);
			const seen = devicesAt.get(p.level) ?? new Set<string>();
			seen.add(demand.devices[0]);
			devicesAt.set(p.level, seen);
		}
		for (const [level, devices] of devicesAt) {
			expect([...devices], `level ${level}`).toHaveLength(1);
		}
		// And every device the app knows about is taught somewhere.
		expect(new Set([...devicesAt.values()].flatMap((set) => [...set])).size).toBe(4);
	});

	it('describes each one and says what to listen for', () => {
		for (const p of PROGRESSIONS) {
			expect(p.describes.length, p.id).toBeGreaterThan(30);
			expect(p.listenFor.length, p.id).toBeGreaterThan(20);
		}
	});

	it('resolves in every key of the ladder without throwing', () => {
		for (const p of PROGRESSIONS) {
			for (const stage of STAGES) {
				const keyName = p.mode === 'minor' ? stage.relativeMinor : stage.key;
				expect(() => realiseProgression(p, keyName), `${p.id} in ${keyName}`).not.toThrow();
			}
		}
	});
});

describe('realising a progression', () => {
	it('steps through one chord at a time', () => {
		const realised = realiseProgression(progressionById('ii-V-I')!, 'C');
		expect(realised.steps.map((s) => s.symbol)).toEqual(['Dm7', 'G7', 'Cmaj7']);
		expect(realised.steps).toHaveLength(3);
	});

	it('gives each step its own notes and voicing', () => {
		const realised = realiseProgression(progressionById('I-IV-V-I')!, 'G');
		expect(realised.steps.map((s) => s.symbol)).toEqual(['G', 'C', 'D', 'G']);
		for (const step of realised.steps) {
			expect(step.pitchClasses).toHaveLength(3);
			expect(step.voicing).toHaveLength(3);
		}
	});

	it('gives a shell only where there is a seventh to shell', () => {
		const sevenths = realiseProgression(progressionById('ii-V-I')!, 'C');
		expect(sevenths.steps.every((s) => s.shell !== null)).toBe(true);

		const triads = realiseProgression(progressionById('I-IV-V-I')!, 'C');
		expect(triads.steps.every((s) => s.shell === null)).toBe(true);
	});

	it('handles the minor progressions in a minor key', () => {
		const realised = realiseProgression(progressionById('i-iv-v-i')!, 'Am');
		expect(realised.steps.map((s) => s.symbol)).toEqual(['Am', 'Dm', 'Em', 'Am']);
	});

	it('borrows a major third for the minor ii–V', () => {
		// Without it the cadence does not pull, which is the whole point.
		const realised = realiseProgression(progressionById('ii-V-i-minor')!, 'Am');
		expect(realised.steps.map((s) => s.symbol)).toEqual(['Bm7b5', 'E7', 'Am7']);
	});

	it('lays out twelve bars of blues', () => {
		const realised = realiseProgression(progressionById('blues-basic')!, 'F');
		expect(realised.steps).toHaveLength(12);
		expect(realised.steps[0].symbol).toBe('F7');
		expect(realised.steps[4].symbol).toBe('Bb7');
		expect(realised.steps[8].symbol).toBe('C7');
	});

	it('keeps every note on a real keyboard', () => {
		for (const p of PROGRESSIONS) {
			for (const stage of STAGES) {
				const keyName = p.mode === 'minor' ? stage.relativeMinor : stage.key;
				for (const step of realiseProgression(p, keyName).steps) {
					for (const note of [...step.voicing, ...(step.shell ?? [])]) {
						expect(note, `${p.id} ${keyName} ${step.symbol}`).toBeGreaterThanOrEqual(21);
						expect(note).toBeLessThanOrEqual(108);
					}
				}
			}
		}
	});
});
