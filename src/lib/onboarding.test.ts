import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from './settings';
import { hasConfirmedInput, prefsForExperience } from './onboarding';

describe('first-run input confirmation', () => {
	it('requires three different notes', () => {
		expect(hasConfirmedInput([60, 60, 64])).toBe(false);
		expect(hasConfirmedInput([60, 64, 67])).toBe(true);
	});

	it('accepts any iterable and a different threshold', () => {
		expect(hasConfirmedInput(new Set([48, 52]), 2)).toBe(true);
	});
});

describe('first-run experience presets', () => {
	it('gives a beginner a short first workout and more time to name a chord', () => {
		expect(prefsForExperience(DEFAULT_PREFS, 'beginner')).toEqual({
			...DEFAULT_PREFS,
			sessionLengthMinutes: 10,
			revealDelayMs: 3000
		});
	});

	it('keeps an experienced player on a standard workout with a quicker reveal', () => {
		expect(prefsForExperience(DEFAULT_PREFS, 'experienced')).toEqual({
			...DEFAULT_PREFS,
			sessionLengthMinutes: 20,
			revealDelayMs: 1500
		});
	});

	it('does not move curriculum or overwrite MIDI calibration', () => {
		const calibrated = {
			...DEFAULT_PREFS,
			ladderKey: 'Eb',
			ladderRung: 'sevenths',
			chordClusterWindowMs: 130,
			midiLatencyOffsetMs: -25
		};

		expect(prefsForExperience(calibrated, 'beginner')).toMatchObject({
			ladderKey: 'Eb',
			ladderRung: 'sevenths',
			chordClusterWindowMs: 130,
			midiLatencyOffsetMs: -25
		});
	});
});
