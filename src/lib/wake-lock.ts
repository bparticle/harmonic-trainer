/**
 * Screen Wake Lock, best-effort.
 *
 * A backing track stopping to look busy because the screen dimmed mid-chorus
 * defeats the point of a hands-free practice tool — you would have to touch
 * the screen to keep it awake, which is exactly what a sustain pedal and a
 * giant tap target exist to avoid.
 *
 * Every failure here is swallowed rather than surfaced: Safari before 16.4,
 * a browser that has never heard of the API, a permission denial. The
 * alternative to "it might not hold on every browser" is a broken practice
 * session on the browsers where it does not — asking for something optional
 * should never risk the thing that matters, which is the music.
 */
export class WakeLock {
	#sentinel: WakeLockSentinel | null = null;
	#wanted = false;

	constructor() {
		if (typeof document !== 'undefined') {
			document.addEventListener('visibilitychange', this.#onVisibilityChange);
		}
	}

	/**
	 * The spec releases the lock the instant a tab is hidden — switching apps
	 * on a phone, a notification stealing focus — which is correct; nothing
	 * should stay pinned awake in the background. The request here still
	 * stands, though, so the moment the tab is visible again with a track
	 * still playing, the lock is simply asked for again.
	 */
	#onVisibilityChange = () => {
		if (this.#wanted && document.visibilityState === 'visible') void this.#acquire();
	};

	/** Ask to stay awake. Safe to call repeatedly; a held lock is left alone. */
	async request(): Promise<void> {
		this.#wanted = true;
		await this.#acquire();
	}

	async #acquire(): Promise<void> {
		if (this.#sentinel) return;
		if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;

		try {
			this.#sentinel = await navigator.wakeLock.request('screen');
			this.#sentinel.addEventListener('release', () => {
				this.#sentinel = null;
			});
		} catch {
			// Most commonly the document was not visible at the moment of the
			// request. Nothing to recover: the visibilitychange handler will try
			// again the next time it can possibly succeed.
		}
	}

	/** Let the screen sleep again. */
	release(): void {
		this.#wanted = false;
		void this.#sentinel?.release();
		this.#sentinel = null;
	}

	dispose(): void {
		this.release();
		if (typeof document !== 'undefined') {
			document.removeEventListener('visibilitychange', this.#onVisibilityChange);
		}
	}
}
