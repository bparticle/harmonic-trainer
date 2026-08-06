<script lang="ts">
	/*
	 * A block's timer.
	 *
	 * Visible but not nagging: it counts down as a thin ring rather than a
	 * number that pulls the eye, because the brief wants no punishment for
	 * running over. When it reaches zero it says so and stops — it does not
	 * force you off the block.
	 */

	let {
		seconds,
		running = true,
		onelapsed
	}: { seconds: number; running?: boolean; onelapsed?: () => void } = $props();

	// Seeded once and then owned by the interval; the effect below re-seeds it
	// whenever a new block hands over a different duration.
	// svelte-ignore state_referenced_locally
	let remaining = $state(seconds);
	let fired = false;

	$effect(() => {
		remaining = seconds;
		fired = false;
	});

	$effect(() => {
		if (!running) return;
		const id = setInterval(() => {
			remaining = Math.max(0, remaining - 1);
			if (remaining === 0 && !fired) {
				fired = true;
				onelapsed?.();
			}
		}, 1000);
		return () => clearInterval(id);
	});

	const progress = $derived(seconds > 0 ? remaining / seconds : 0);
	const minutes = $derived(Math.floor(remaining / 60));
	const secs = $derived(remaining % 60);

	const CIRCUMFERENCE = 2 * Math.PI * 15;
</script>

<div class="flex items-center gap-2" role="timer" aria-label="Time left in this block">
	<svg viewBox="0 0 34 34" width="26" height="26" aria-hidden="true">
		<circle cx="17" cy="17" r="15" fill="none" stroke="var(--color-ground-line)" stroke-width="2.5" />
		<circle
			cx="17"
			cy="17"
			r="15"
			fill="none"
			stroke={remaining === 0 ? 'var(--color-ink-dim)' : 'var(--color-ink-muted)'}
			stroke-width="2.5"
			stroke-linecap="round"
			stroke-dasharray={CIRCUMFERENCE}
			stroke-dashoffset={CIRCUMFERENCE * (1 - progress)}
			transform="rotate(-90 17 17)"
			style="transition: stroke-dashoffset 1s linear"
		/>
	</svg>
	<span class="text-ink-dim font-mono text-xs tabular-nums">
		{remaining === 0 ? 'time' : `${minutes}:${String(secs).padStart(2, '0')}`}
	</span>
</div>
