import type { Target } from './match';

/**
 * The chord the app is currently asking you to play, for the whole app to see.
 *
 * The header shows what is sounding on every screen, and during a play-along
 * that row of colours is the fastest read of "am I on this chord?" available —
 * it is already where the eyes are. Without somewhere shared to put the target,
 * comparing those pills against the chart below is a job left to the person
 * playing, which is exactly the job they asked the app to do.
 *
 * Borrowed and given back, on the same terms as `midi.onChord`: the session and
 * the header outlive every page, so a page that sets this must clear it on the
 * way out or a screen nobody is looking at goes on marking notes against a
 * chord that stopped sounding some time ago.
 */
class HarmonicTarget {
	/** Null whenever nothing is asking for a particular chord, which is most of the time. */
	current = $state<Target | null>(null);

	set(target: Target | null) {
		this.current = target;
	}

	clear() {
		this.current = null;
	}
}

export const target = new HarmonicTarget();
