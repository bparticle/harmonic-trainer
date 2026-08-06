<script lang="ts">
	/*
	 * Where you are, and the one thing to do next.
	 *
	 * The ladder is visible on purpose: knowing that C has seven small steps and
	 * that you are on the third of them is worth more than any streak counter,
	 * and it makes the size of the whole thing feel finite.
	 */

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let length = $state<10 | 20 | 35>(data.settings.prefs.sessionLengthMinutes);
	let tab = $state<'ladder' | 'progressions'>('ladder');
	let progressionKey = $state('');

	const glyph = (s: string) => s.replace(/b/g, '♭').replace(/#/g, '♯');
	const resuming = $derived(Boolean(data.active));

	const reachedKeys = $derived(data.stages.slice(0, data.position.stageIndex + 1).map((s) => s.key));

	const byLevel = $derived(
		Object.entries(data.progressionLevels).map(([level, name]) => ({
			level: Number(level),
			name,
			items: data.progressions.filter((p) => p.level === Number(level))
		}))
	);
</script>

<svelte:head><title>Harmonic Trainer</title></svelte:head>

<main class="mx-auto flex min-h-[calc(100dvh-3.5rem)] max-w-3xl flex-col gap-8 px-6 py-8">
	<!-- Where you are ---------------------------------------------------- -->
	<section class="text-center">
		<p class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">
			Key {data.position.stageIndex + 1} of {data.stages.length}
		</p>
		<h1 class="font-display text-ink mt-1 text-6xl leading-none font-semibold tracking-tight">
			{glyph(data.position.key)}
			<span class="text-ink-dim text-2xl">/ {glyph(data.position.relativeMinor)}</span>
		</h1>
		<p class="text-ink-muted mt-2 text-sm">{data.position.accidentals}</p>
	</section>

	<!-- The rungs of this key --------------------------------------------- -->
	<section>
		<ol class="flex flex-col gap-1">
			{#each data.rungs as rung, i (rung.id)}
				{@const done = i < data.position.rungIndex}
				{@const current = i === data.position.rungIndex}
				<li
					class="flex items-baseline gap-3 rounded-lg px-3 py-2"
					class:is-current={current}
					class:is-done={done}
				>
					<span
						class="font-mono text-[0.7rem] tabular-nums"
						style:color={current
							? 'var(--color-ink)'
							: done
								? 'var(--pc-5)'
								: 'var(--color-ink-dim)'}
					>
						{done ? '✓' : i + 1}
					</span>
					<div class="min-w-0 flex-1">
						<span
							class="font-display block text-sm font-semibold"
							style:color={current ? 'var(--color-ink)' : 'var(--color-ink-muted)'}
							>{rung.label}</span
						>
						{#if current}
							<span class="text-ink-dim block text-[0.75rem] leading-snug">{rung.teaches}</span>
						{/if}
					</div>
				</li>
			{/each}
		</ol>
	</section>

	<!-- Do it -------------------------------------------------------------- -->
	<section class="flex flex-col items-center gap-3">
		<p class="text-ink-muted max-w-md text-center text-sm leading-relaxed">
			{data.position.rung.instruction}
		</p>

		<form method="POST" action="?/start" class="flex flex-col items-center gap-3">
			<input type="hidden" name="length" value={length} />
			<input type="hidden" name="progression" value={tab === 'progressions' ? progressionKey.split('|')[0] : ''} />
			<input type="hidden" name="progressionKey" value={progressionKey.split('|')[1] ?? ''} />
			<button
				type="submit"
				class="bg-ink text-ground font-display rounded-2xl px-10 py-5 text-xl font-semibold
				       tracking-tight transition-transform active:scale-[0.98]"
			>
				{resuming ? 'Carry on' : 'Practise this'}
			</button>
			<div class="flex gap-1">
				{#each [10, 20, 35] as const as m (m)}
					<button
						type="button"
						class="border-ground-line hover:border-ink-dim rounded border px-2.5 py-1 font-mono text-[0.7rem] transition-colors"
						class:is-selected={length === m}
						onclick={() => (length = m)}>{m}m</button
					>
				{/each}
			</div>
		</form>

		<!-- Moving on is a decision, not a threshold. -->
		<div class="mt-2 flex items-center gap-3">
			<form method="POST" action="?/back">
				<button
					class="text-ink-dim hover:text-ink font-mono text-[0.7rem] transition-colors"
					disabled={data.position.stageIndex === 0 && data.position.rungIndex === 0}
					>← back a step</button
				>
			</form>
			{#if data.next}
				<form method="POST" action="?/advance">
					<button
						class="border-ground-line hover:border-ink-dim rounded-lg border px-3 py-1.5 font-mono text-[0.7rem] transition-colors"
						class:is-suggested={data.progress.looksSolid}
					>
						{data.progress.looksSolid ? 'ready for' : 'skip to'}
						{data.next.rung.id === 'scale' && data.next.key !== data.position.key
							? glyph(data.next.key)
							: data.next.rung.label.toLowerCase()} →
					</button>
				</form>
			{/if}
		</div>

		{#if data.progress.reviews > 0}
			<p class="text-ink-dim font-mono text-[0.7rem]">
				{data.progress.correct} of {data.progress.reviews} right on this step
				{#if data.progress.looksSolid}· looks solid{/if}
			</p>
		{/if}
	</section>

	<!-- Progressions, as their own thing ----------------------------------- -->
	<section class="border-ground-line border-t pt-6">
		<div class="mb-3 flex items-center gap-2">
			{#each [['ladder', 'The keys'], ['progressions', 'Chord progressions']] as const as [id, label] (id)}
				<button
					class="rounded-lg px-3 py-1.5 font-mono text-xs transition-colors"
					class:is-selected={tab === id}
					onclick={() => (tab = id)}>{label}</button
				>
			{/each}
		</div>

		{#if tab === 'progressions'}
			<p class="text-ink-dim mb-4 text-[0.75rem] leading-relaxed">
				Separate from the keys, on purpose. Pick one and a key you already know — the same
				progression gets easier every time you meet it somewhere new.
			</p>

			{#each byLevel as group (group.level)}
				<h3 class="text-ink-dim mt-4 mb-1 font-mono text-[0.65rem] tracking-widest uppercase">
					{group.name}
				</h3>
				<ul class="flex flex-col gap-1">
					{#each group.items as progression (progression.id)}
						<li>
							<div class="hover:bg-ground-raised rounded-lg px-3 py-2 transition-colors">
								<div class="flex items-baseline justify-between gap-3">
									<span class="font-display text-ink text-sm font-semibold"
										>{progression.name}</span
									>
									<div class="flex flex-wrap justify-end gap-1">
										{#each reachedKeys as k (k)}
											{@const value = `${progression.id}|${progression.mode === 'minor' ? (data.stages.find((s) => s.key === k)?.relativeMinor ?? k) : k}`}
											<button
												class="border-ground-line hover:border-ink-dim rounded border px-1.5 py-0.5 font-mono text-[0.65rem] transition-colors"
												class:is-selected={progressionKey === value}
												onclick={() => {
													progressionKey = progressionKey === value ? '' : value;
													tab = 'progressions';
												}}>{glyph(value.split('|')[1])}</button
											>
										{/each}
									</div>
								</div>
								<p class="text-ink-dim mt-0.5 text-[0.72rem] leading-snug">
									{progression.describes}
								</p>
							</div>
						</li>
					{/each}
				</ul>
			{/each}
		{:else}
			<ol class="flex flex-wrap gap-1">
				{#each data.stages as stage, i (stage.key)}
					{@const reached = i <= data.position.stageIndex}
					<li
						class="border-ground-line rounded border px-2.5 py-1 font-mono text-xs"
						class:is-selected={i === data.position.stageIndex}
						style:opacity={reached ? 1 : 0.35}
					>
						{glyph(stage.key)}
					</li>
				{/each}
			</ol>
			<p class="text-ink-dim mt-3 text-[0.75rem] leading-relaxed">
				One accidental at a time, out from C. You are on {data.position.stageIndex + 1} of {data
					.stages.length}; the rest arrive when you are ready for them.
			</p>
		{/if}
	</section>

	<dl class="border-ground-line grid grid-cols-3 gap-x-6 border-t pt-5">
		<div>
			<dt class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">due</dt>
			<dd class="text-ink-muted mt-1 font-mono text-sm">{data.due} of {data.totalCards}</dd>
		</div>
		<div>
			<dt class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">this week</dt>
			<dd class="text-ink-muted mt-1 font-mono text-sm">{data.reviewsThisWeek}</dd>
		</div>
		<div>
			<dt class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">session</dt>
			<dd class="text-ink-muted mt-1 font-mono text-sm">{length} min</dd>
		</div>
	</dl>
</main>

<style>
	.is-selected,
	.is-current {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.is-done {
		opacity: 0.65;
	}

	.is-suggested {
		border-color: var(--pc-5);
		color: var(--color-ink);
	}

	button:disabled {
		opacity: 0.3;
	}
</style>
