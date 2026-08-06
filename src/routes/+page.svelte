<script lang="ts">
	import { formatNote } from '$lib/music/note';
	import { spell } from '$lib/music/spell';
	import { key as makeKey } from '$lib/music/key';

	/*
	 * One button.
	 *
	 * No menus and no choosing: the session engine already decided the key, the
	 * cards and the new idea. Everything else on this page is a fact about where
	 * things stand, stated as a musical observation rather than a score.
	 */

	let { data } = $props();
	// The buttons own this once the page is up; settings only seed it.
	// svelte-ignore state_referenced_locally
	let length = $state<10 | 20 | 35>(data.settings.prefs.sessionLengthMinutes);

	const RING = [
		{ pc: 0, label: 'C' },
		{ pc: 7, label: 'G' },
		{ pc: 2, label: 'D' },
		{ pc: 9, label: 'A' },
		{ pc: 4, label: 'E' },
		{ pc: 11, label: 'B' },
		{ pc: 6, label: 'G♭' },
		{ pc: 1, label: 'D♭' },
		{ pc: 8, label: 'A♭' },
		{ pc: 3, label: 'E♭' },
		{ pc: 10, label: 'B♭' },
		{ pc: 5, label: 'F' }
	];

	const R = 120;
	const positions = RING.map((entry, i) => {
		const angle = (i / RING.length) * Math.PI * 2 - Math.PI / 2;
		return { ...entry, x: Math.cos(angle) * R, y: Math.sin(angle) * R };
	});

	const cold = $derived(new Set(data.coldestKeys));
	const resuming = $derived(Boolean(data.active));
</script>

<svelte:head><title>Harmonic Trainer</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-8">
	<div class="flex flex-1 flex-col items-center justify-center gap-10 py-6">
		<svg viewBox="-170 -170 340 340" class="no-select w-full max-w-[19rem]" role="img"
			aria-label="The twelve keys, with the coldest marked">
			<circle r={R} fill="none" stroke="var(--color-ground-line)" stroke-width="1" />
			{#each positions as p (p.pc)}
				{@const isCold = cold.has(p.label.replace('♭', 'b'))}
				<g transform="translate({p.x} {p.y})">
					<circle r="26" fill="var(--pc-{p.pc})" opacity={isCold ? 0.95 : 0.22} />
					<text
						y="1"
						text-anchor="middle"
						dominant-baseline="middle"
						font-size="17"
						font-weight="600"
						font-family="var(--font-display)"
						fill={isCold ? `var(--pc-${p.pc}-ink)` : 'var(--color-ink-dim)'}>{p.label}</text
					>
				</g>
			{/each}
		</svg>

		<form method="POST" action="?/start" class="flex flex-col items-center gap-4">
			<input type="hidden" name="length" value={length} />
			<button
				type="submit"
				class="bg-ink text-ground font-display rounded-2xl px-10 py-6 text-2xl font-semibold
				       tracking-tight transition-transform active:scale-[0.98]"
			>
				{resuming ? 'Carry on with today’s session' : 'Start today’s session'}
			</button>

			{#if !resuming}
				<div class="flex gap-1">
					{#each [10, 20, 35] as const as minutes (minutes)}
						<button
							type="button"
							class="border-ground-line hover:border-ink-dim rounded border px-3 py-1 font-mono text-xs transition-colors"
							class:is-selected={length === minutes}
							onclick={() => (length = minutes)}>{minutes} min</button
						>
					{/each}
				</div>
			{:else}
				<p class="text-ink-dim font-mono text-xs">
					Picked up where you left off, in {data.active?.plan.keyCenter}.
				</p>
			{/if}
		</form>
	</div>

	<dl class="border-ground-line grid grid-cols-2 gap-x-8 gap-y-3 border-t pt-6 sm:grid-cols-4">
		<div>
			<dt class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">due now</dt>
			<dd class="text-ink-muted mt-1 font-mono text-sm">{data.due} of {data.totalCards}</dd>
		</div>
		<div>
			<dt class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">this week</dt>
			<dd class="text-ink-muted mt-1 font-mono text-sm">{data.reviewsThisWeek} reviews</dd>
		</div>
		<div class="col-span-2">
			<dt class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">
				coldest keys
			</dt>
			<dd class="text-ink-muted mt-1 font-mono text-sm">
				{data.coldestKeys.join(' · ') || '—'}
			</dd>
		</div>
	</dl>
</main>

<style>
	.is-selected {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}
</style>
