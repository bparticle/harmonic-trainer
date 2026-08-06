<script lang="ts">
	/*
	 * Start here.
	 *
	 * The app will decide everything if you let it — key, cards, the one new
	 * idea. It will also get out of the way if you already know what you want to
	 * work on, because being overruled by a scheduler on the days you have a plan
	 * is how a practice tool ends up unused. Either way the same things get
	 * recorded, so steering costs nothing in what gets remembered.
	 */

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let length = $state<10 | 20 | 35>(data.settings.prefs.sessionLengthMinutes);
	let chosenKey = $state('');
	let focusId = $state('due');
	let showChoices = $state(false);

	const RING = [
		{ pc: 0, label: 'C' },
		{ pc: 7, label: 'G' },
		{ pc: 2, label: 'D' },
		{ pc: 9, label: 'A' },
		{ pc: 4, label: 'E' },
		{ pc: 11, label: 'B' },
		{ pc: 6, label: 'Gb' },
		{ pc: 1, label: 'Db' },
		{ pc: 8, label: 'Ab' },
		{ pc: 3, label: 'Eb' },
		{ pc: 10, label: 'Bb' },
		{ pc: 5, label: 'F' }
	];

	const R = 108;
	const positions = RING.map((entry, i) => {
		const angle = (i / RING.length) * Math.PI * 2 - Math.PI / 2;
		return { ...entry, x: Math.cos(angle) * R, y: Math.sin(angle) * R };
	});

	const cold = $derived(new Set(data.coldestKeys));
	const resuming = $derived(Boolean(data.active));
	const focus = $derived(data.focusAreas.find((f) => f.id === focusId));

	const glyph = (label: string) => label.replace('b', '♭').replace('#', '♯');

	const BLOCKS = [
		'Warm up',
		'Name what you play',
		'Ear drill',
		'One new thing',
		'Apply it',
		'Log'
	];

	const minutes = (seconds: number) =>
		seconds >= 60 ? `${Math.round(seconds / 60)}m` : `${seconds}s`;

	function pickKey(label: string) {
		chosenKey = chosenKey === label ? '' : label;
	}
</script>

<svelte:head><title>Harmonic Trainer</title></svelte:head>

<main class="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-5xl flex-col px-6 py-8">
	<div class="flex flex-1 flex-col items-center justify-center gap-8">
		<!-- The twelve keys, with the ones you avoid lit. Clicking one takes it. -->
		<svg
			viewBox="-150 -150 300 300"
			class="no-select w-full max-w-[17rem]"
			role="group"
			aria-label="Choose a key, or leave it to the app"
		>
			<circle r={R} fill="none" stroke="var(--color-ground-line)" stroke-width="1" />
			{#each positions as p (p.pc)}
				{@const isCold = cold.has(p.label)}
				{@const isChosen = chosenKey === p.label}
				<g
					transform="translate({p.x} {p.y})"
					role="button"
					tabindex="0"
					aria-label="Practise in {p.label}"
					aria-pressed={isChosen}
					class="key-node"
					onclick={() => pickKey(p.label)}
					onkeydown={(e) => e.key === 'Enter' && pickKey(p.label)}
				>
					<circle
						r="24"
						fill="var(--pc-{p.pc})"
						opacity={isChosen ? 1 : isCold ? 0.92 : 0.2}
					/>
					{#if isChosen}
						<circle r="29" fill="none" stroke="var(--color-ink)" stroke-width="2" />
					{/if}
					<text
						y="1"
						text-anchor="middle"
						dominant-baseline="middle"
						font-size="16"
						font-weight="600"
						font-family="var(--font-display)"
						fill={isChosen || isCold ? `var(--pc-${p.pc}-ink)` : 'var(--color-ink-dim)'}
						>{glyph(p.label)}</text
					>
				</g>
			{/each}
		</svg>

		<p class="text-ink-dim -mt-2 text-center font-mono text-xs">
			{#if chosenKey}
				Practising in {glyph(chosenKey)}.
				<button class="text-ink-muted hover:text-ink underline underline-offset-2"
					onclick={() => (chosenKey = '')}>let the app choose</button
				>
			{:else}
				The lit keys are the ones you have been avoiding. Tap one to take it.
			{/if}
		</p>

		<form method="POST" action="?/start" class="flex w-full flex-col items-center gap-4">
			<input type="hidden" name="length" value={length} />
			<input type="hidden" name="key" value={chosenKey} />
			<input type="hidden" name="focus" value={focusId} />

			<button
				type="submit"
				class="bg-ink text-ground font-display rounded-2xl px-10 py-6 text-2xl font-semibold
				       tracking-tight transition-transform active:scale-[0.98]"
			>
				{resuming ? 'Carry on with today’s session' : 'Start a session'}
			</button>

			{#if resuming}
				<p class="text-ink-dim font-mono text-xs">
					Picked up where you left off, in {data.active?.plan.keyCenter}.
				</p>
			{:else}
				<button
					type="button"
					class="text-ink-muted hover:text-ink font-mono text-xs transition-colors"
					onclick={() => (showChoices = !showChoices)}
					aria-expanded={showChoices}
				>
					{showChoices ? 'hide options' : `${length} min · ${focus?.label ?? 'whatever’s due'}`}
				</button>

				{#if showChoices}
					<div
						class="border-ground-line bg-ground-raised w-full max-w-xl rounded-xl border p-4"
					>
						<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
							Work on
						</h2>
						<div class="grid gap-1 sm:grid-cols-2">
							{#each data.focusAreas as area (area.id)}
								<button
									type="button"
									class="hover:bg-ground-overlay rounded px-3 py-2 text-left transition-colors"
									class:is-selected={focusId === area.id}
									onclick={() => (focusId = area.id)}
								>
									<span class="font-display text-ink block text-sm font-semibold"
										>{area.label}</span
									>
									<span class="text-ink-dim block text-[0.7rem] leading-snug"
										>{area.description}</span
									>
								</button>
							{/each}
						</div>

						<h2 class="text-ink-dim mt-4 mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
							Length
						</h2>
						<div class="flex gap-1">
							{#each [10, 20, 35] as const as m (m)}
								<button
									type="button"
									class="border-ground-line hover:border-ink-dim flex-1 rounded border px-3 py-1.5 font-mono text-xs transition-colors"
									class:is-selected={length === m}
									onclick={() => (length = m)}>{m} min</button
								>
							{/each}
						</div>
					</div>
				{/if}
			{/if}
		</form>

		<!-- What a session actually is, so it is not a surprise. -->
		<ol class="flex flex-wrap items-center justify-center gap-x-1 gap-y-2">
			{#each BLOCKS as block, i (block)}
				<li class="text-ink-dim flex items-center gap-1 font-mono text-[0.7rem]">
					<span class="text-ink-muted">{block}</span>
					<span class="text-ink-dim/70">{minutes(data.blockPreview[i])}</span>
					{#if i < BLOCKS.length - 1}<span class="text-ink-dim/50 px-1">›</span>{/if}
				</li>
			{/each}
		</ol>
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
				{data.coldestKeys.map(glyph).join(' · ') || '—'}
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

	.key-node {
		cursor: pointer;
	}

	.key-node circle {
		transition: opacity 160ms var(--ease-wheel);
	}

	.key-node:focus-visible {
		outline: 2px solid var(--color-ink-dim);
		outline-offset: 2px;
	}
</style>
