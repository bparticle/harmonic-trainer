import { describe, expect, it } from 'vitest';
import { DEFAULT_WHEEL_CONFIG } from '$lib/settings';
import { key, parseKey } from '$lib/music/key';
import { parseChord } from '$lib/music/chord';
import { mod12, pitchClassAt, type WheelGeometry } from './geometry';
import {
	brightnessAxis,
	chordCells,
	keyOverlay,
	modulationOverlay,
	neighbourOverlays,
	scaleBlock
} from './overlays';

const GEOMETRY: WheelGeometry = { outerRadius: 330, ringWidth: 52 };
const config = DEFAULT_WHEEL_CONFIG;

describe('key overlay', () => {
	it('gives the scale seven cells and the key seven chords', () => {
		const overlay = keyOverlay(key('C'), config, GEOMETRY);
		expect(overlay.scaleCells).toHaveLength(7);
		expect(overlay.chords).toHaveLength(7);
	});

	it('names the diatonic sevenths with their Roman numerals', () => {
		const overlay = keyOverlay(key('Eb'), config, GEOMETRY);
		expect(overlay.chords.map((c) => c.symbol)).toEqual([
			'Ebmaj7',
			'Fm7',
			'Gm7',
			'Abmaj7',
			'Bb7',
			'Cm7',
			'Dm7b5'
		]);
		expect(overlay.chords.map((c) => c.roman)).toEqual([
			'Imaj7',
			'ii7',
			'iii7',
			'IVmaj7',
			'V7',
			'vi7',
			'viim7b5'
		]);
	});

	it('lands every cell on a note of the key', () => {
		for (const name of ['C', 'Gb', 'B', 'Ebm', 'F#m']) {
			const k = parseKey(name);
			const overlay = keyOverlay(k, config, GEOMETRY);
			const pcs = new Set(overlay.pitchClasses);
			for (const cell of overlay.scaleCells) {
				expect(pcs.has(pitchClassAt(cell, config)), name).toBe(true);
			}
		}
	});

	it('uses minor numerals for a minor key', () => {
		const overlay = keyOverlay(parseKey('Am'), config, GEOMETRY);
		expect(overlay.chords[0].roman).toBe('i7');
		expect(overlay.chords[1].roman).toBe('iim7b5');
	});
});

describe('scale blocks and brightness', () => {
	it('finds a diatonic scale as seven consecutive positions', () => {
		for (const name of ['C', 'Gb', 'B', 'Eb', 'Am', 'F#m']) {
			expect(scaleBlock(parseKey(name), config), name).not.toBeNull();
		}
	});

	it('slides the block one step anticlockwise per darkening mode', () => {
		const axis = brightnessAxis(key('C'), config);
		expect(axis).toHaveLength(7);
		expect(axis[0].mode).toBe('lydian');
		expect(axis[6].mode).toBe('locrian');

		for (let i = 1; i < axis.length; i++) {
			const previous = axis[i - 1].block!.start;
			const current = axis[i].block!.start;
			expect(mod12(previous - current), `${axis[i - 1].mode} to ${axis[i].mode}`).toBe(1);
		}
	});

	it('marks the current mode', () => {
		const axis = brightnessAxis(key('C', 'dorian'), config);
		expect(axis.filter((a) => a.current).map((a) => a.mode)).toEqual(['dorian']);
	});

	it('works from any tonic', () => {
		for (const tonic of ['Eb', 'F#', 'B', 'Db']) {
			const axis = brightnessAxis(key(tonic), config);
			expect(
				axis.every((a) => a.block !== null),
				tonic
			).toBe(true);
		}
	});
});

describe('neighbours on the wheel', () => {
	it('puts Ebmaj7 one note from Gm7 and gives it cells', () => {
		const found = neighbourOverlays(parseChord('Gm7'), key('C'), config, GEOMETRY);
		const ebmaj7 = found.find((n) => n.symbol === 'Ebmaj7');
		expect(ebmaj7).toBeDefined();
		expect(ebmaj7!.changed).toBe(1);
		expect(ebmaj7!.cells).toHaveLength(4);
	});

	it('gives every neighbour a drawable shape', () => {
		for (const n of neighbourOverlays(parseChord('Cmaj7'), key('C'), config, GEOMETRY)) {
			expect(n.cells.length).toBeGreaterThan(0);
		}
	});
});

describe('chord cells', () => {
	it('collapses a diminished seventh onto one spoke', () => {
		const cells = chordCells(parseChord('Cdim7'), config, GEOMETRY);
		expect(new Set(cells.map((c) => c.position)).size).toBe(1);
	});
});

describe('modulation overlay', () => {
	it('measures one step and finds shared chords', () => {
		const overlay = modulationOverlay(key('C'), key('G'), config, GEOMETRY);
		expect(overlay.distance).toBe(1);
		expect(overlay.sharedPitchClasses).toHaveLength(6);
		expect(overlay.pivots.length).toBeGreaterThan(0);
	});

	it('finds the vi-becomes-ii pivot from C to G', () => {
		const overlay = modulationOverlay(key('C'), key('G'), config, GEOMETRY);
		const am7 = overlay.pivots.find((p) => p.symbol === 'Am7');
		expect(am7).toBeDefined();
		expect(am7!.romanInFrom).toBe('vi7');
		expect(am7!.romanInTo).toBe('ii7');
	});

	it('reports honestly when two keys share no chord', () => {
		const overlay = modulationOverlay(key('C'), key('A'), config, GEOMETRY);
		expect(overlay.distance).toBe(3);
		expect(overlay.pivots).toHaveLength(0);
		expect(overlay.summary).toContain('nothing to pivot on');
	});

	it('has least in common at six steps', () => {
		const near = modulationOverlay(key('C'), key('G'), config, GEOMETRY);
		const far = modulationOverlay(key('C'), key('Gb'), config, GEOMETRY);
		expect(far.distance).toBe(6);
		expect(far.sharedPitchClasses.length).toBeLessThan(near.sharedPitchClasses.length);
	});

	it('is symmetric in distance', () => {
		const there = modulationOverlay(key('C'), key('Eb'), config, GEOMETRY);
		const back = modulationOverlay(key('Eb'), key('C'), config, GEOMETRY);
		expect(there.distance).toBe(back.distance);
		expect(there.sharedPitchClasses.sort()).toEqual(back.sharedPitchClasses.sort());
	});

	it('describes the move in words', () => {
		const overlay = modulationOverlay(key('C'), key('G'), config, GEOMETRY);
		expect(overlay.summary).toContain('one step');
		expect(overlay.summary).toContain('C');
		expect(overlay.summary).toContain('G');
	});
});
