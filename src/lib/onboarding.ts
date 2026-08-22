import type { Prefs } from './settings';

export type ExperienceLevel = 'beginner' | 'experienced';

/**
 * A small first-run calibration, using settings the app already owns.
 *
 * It deliberately does not move the curriculum ladder. An experienced player
 * can jump to any key or rung from Today, while silently moving it for them
 * would turn one answer in a welcome screen into durable learning progress.
 */
export function prefsForExperience(current: Prefs, level: ExperienceLevel): Prefs {
	return {
		...current,
		sessionLengthMinutes: level === 'beginner' ? 10 : 20,
		revealDelayMs: level === 'beginner' ? 3000 : 1500
	};
}
