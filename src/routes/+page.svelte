<script lang="ts">
	import { pitchClass } from '$lib/music/note';
	import { parseKey } from '$lib/music/key';
	import LandingPage from '$lib/components/LandingPage.svelte';

	/*
	 * Today: what would you like to practise?
	 *
	 * This page used to answer that question for you. One button, wired to
	 * wherever the ladder happened to be, with everything else folded away under
	 * a tab — which is fine on the day you agree with it and a dead end on the
	 * day you want to spend twenty minutes on the thing that went badly.
	 *
	 * So it is a picker now. Every key, every rung, every progression, all
	 * visible and all startable. The ladder is still here and still suggests the
	 * next step — that is the one marked — but it has never gated anything and
	 * now it does not hide anything either. Choosing something else does not
	 * move it: exploring and advancing are different decisions.
	 */

	let { data } = $props();

	// svelte-ignore state_referenced_locally
	let length = $state<10 | 20 | 35>(data.settings.prefs.sessionLengthMinutes);

	type Choice =
		{ kind: 'rung'; key: string; rung: string } | { kind: 'progression'; id: string; key: string };

	/*
	 * Starts on the ladder's own suggestion, so pressing play without touching
	 * anything does exactly what it used to. Seeded once and owned by the picker
	 * from then on — a reload is what changes the suggestion, not a keystroke.
	 */
	// svelte-ignore state_referenced_locally
	let choice = $state<Choice>({
		kind: 'rung',
		key: data.position.key,
		rung: data.position.rung.id
	});

	/** Which key's rungs are open. Opens where the ladder is; then it is yours. */
	// svelte-ignore state_referenced_locally
	let openKey = $state(data.position.key);

	const glyph = (s: string) => s.replace(/b/g, '♭').replace(/#/g, '♯');
	const tint = (keyName: string) =>
		`var(--pc-${pitchClass(parseKey(keyName.replace(/m$/, '')).tonic)})`;

	const resuming = $derived(Boolean(data.active));
	const reachedIndex = $derived(data.position.stageIndex);
	const openStage = $derived(data.stages.find((s) => s.key === openKey) ?? data.stages[0]);

	const isHere = (key: string, rung: string) =>
		key === data.position.key && rung === data.position.rung.id;

	const chosenRung = $derived.by(() => {
		const c = choice;
		return c.kind === 'rung' ? data.rungs.find((r) => r.id === c.rung) : undefined;
	});
	const chosenProgression = $derived.by(() => {
		const c = choice;
		return c.kind === 'progression' ? data.progressions.find((p) => p.id === c.id) : undefined;
	});

	/** What the button is about to do, said in full. */
	const summary = $derived(
		choice.kind === 'rung'
			? `${glyph(choice.key)} · ${chosenRung?.label ?? ''}`
			: `${chosenProgression?.name ?? ''} in ${glyph(choice.key)}`
	);

	const byLevel = $derived(
		Object.entries(data.progressionLevels).map(([level, name]) => ({
			level: Number(level),
			name,
			items: data.progressions.filter((p) => p.level === Number(level))
		}))
	);

	/** Which keys a progression offers. Reached ones first, then the rest. */
	const progressionKeys = $derived(
		data.stages.map((s, i) => ({ key: s.key, minor: s.relativeMinor, reached: i <= reachedIndex }))
	);

	const keyFor = (mode: string, stageKey: string) =>
		mode === 'minor'
			? (data.stages.find((s) => s.key === stageKey)?.relativeMinor ?? stageKey)
			: stageKey;
</script>

<svelte:head>
	<title
		>{data.public
			? 'Harmonic Trainer — see, hear, drill and apply harmony'
			: 'Harmonic Trainer'}</title
	>
	{#if data.public}
		<meta
			name="description"
			content="An open-source, instrument-first practice tool for seeing, hearing and mastering chord progressions in every key."
		/>
		<meta property="og:title" content="Harmonic Trainer" />
		<meta
			property="og:description"
			content="See harmony move. Hear it. Drill it in every key. Apply it at your instrument."
		/>
		<meta property="og:type" content="website" />
		<meta name="twitter:card" content="summary" />
	{/if}
</svelte:head>

{#if data.public}
	<LandingPage />
{:else}
	<main class="mx-auto flex max-w-4xl flex-col gap-7 px-6 py-8">
		<!-- Where you are, small, because it is context and not the point --------- -->
		<section class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
			<h1 class="font-display text-ink text-3xl leading-none font-semibold tracking-tight">
				{glyph(data.position.key)}
				<span class="text-ink-dim text-lg">/ {glyph(data.position.relativeMinor)}</span>
			</h1>
			<p class="text-ink-muted text-sm">
				{data.position.rung.label} · step {reachedIndex + 1} of {data.stages.length}
			</p>
			<p class="text-ink-dim ml-auto font-mono text-[0.7rem]">
				{data.due} due · {data.reviewsThisWeek} this week
			</p>
		</section>

		{#if !data.active}
			<details class="border-ground-line bg-ground-raised rounded-xl border p-4">
				<summary class="text-ink cursor-pointer font-mono text-sm font-semibold"
					>Choose something else</summary
				>
				<div class="mt-5 flex flex-col gap-7">
					<!-- The picker ---------------------------------------------------------- -->
					<section class="flex flex-col gap-4">
						<h2 class="panel-title">The keys</h2>

						<!-- Every key, always. Dim is "not suggested yet", never "not allowed". -->
						<div class="flex flex-wrap gap-1.5">
							{#each data.stages as stage, i (stage.key)}
								<button
									type="button"
									class="key"
									class:is-open={stage.key === openKey}
									class:is-ahead={i > reachedIndex}
									style:--tint={tint(stage.key)}
									onclick={() => (openKey = stage.key)}
									aria-pressed={stage.key === openKey}
								>
									<span class="key-name">{glyph(stage.key)}</span>
									<span class="key-minor">{glyph(stage.relativeMinor)}</span>
								</button>
							{/each}
						</div>

						<p class="text-ink-dim text-[0.78rem] leading-relaxed">
							{openStage.note}
							{#if data.stages.indexOf(openStage) > reachedIndex}
								<span class="text-ink-muted"
									>Further along than the ladder suggests — take it anyway if you want it.</span
								>
							{/if}
						</p>

						<!-- The rungs of whichever key is open ----------------------------- -->
						<ol class="grid gap-1.5 sm:grid-cols-2">
							{#each data.rungs as rung, i (rung.id)}
								{@const selected =
									choice.kind === 'rung' && choice.key === openKey && choice.rung === rung.id}
								{@const here = isHere(openKey, rung.id)}
								<li>
									<button
										type="button"
										class="rung w-full"
										class:is-selected={selected}
										style:--tint={tint(openKey)}
										onclick={() => (choice = { kind: 'rung', key: openKey, rung: rung.id })}
										aria-pressed={selected}
									>
										<span class="rung-index">{i + 1}</span>
										<span class="min-w-0 flex-1">
											<span class="rung-label">{rung.label}</span>
											<span class="rung-teaches">{rung.teaches}</span>
										</span>
										{#if here}
											<span class="badge">you are here</span>
										{/if}
									</button>
								</li>
							{/each}
						</ol>
					</section>

					<!-- Progressions, as their own thing ------------------------------------ -->
					<section class="border-ground-line flex flex-col gap-3 border-t pt-6">
						<h2 class="panel-title">Chord progressions</h2>
						<p class="text-ink-dim -mt-1 text-[0.78rem] leading-relaxed">
							Separate from the keys, on purpose. Pick one and a key — the same progression gets
							easier every time you meet it somewhere new.
						</p>

						{#each byLevel as group (group.level)}
							<div>
								<h3
									class="text-ink-dim mt-2 mb-1 font-mono text-[0.65rem] tracking-widest uppercase"
								>
									{group.name}
								</h3>
								<ul class="flex flex-col gap-1">
									{#each group.items as progression (progression.id)}
										{@const chosen = choice.kind === 'progression' && choice.id === progression.id}
										<li class="rounded-lg px-2.5 py-2" class:is-open-row={chosen}>
											<div class="flex items-baseline justify-between gap-3">
												<button
													type="button"
													class="text-left"
													onclick={() =>
														(choice = {
															kind: 'progression',
															id: progression.id,
															key: keyFor(progression.mode, openKey)
														})}
												>
													<span
														class="font-display text-sm font-semibold"
														style:color={chosen ? 'var(--color-ink)' : 'var(--color-ink-muted)'}
														>{progression.name}</span
													>
													<span class="text-ink-dim block text-[0.72rem] leading-snug"
														>{progression.describes}</span
													>
												</button>
											</div>

											{#if chosen}
												<div class="mt-2 flex flex-wrap gap-1">
													{#each progressionKeys as k (k.key)}
														{@const value = keyFor(progression.mode, k.key)}
														<button
															type="button"
															class="key-pill"
															class:is-selected={choice.kind === 'progression' &&
																choice.key === value}
															class:is-ahead={!k.reached}
															style:--tint={tint(k.key)}
															onclick={() =>
																(choice = { kind: 'progression', id: progression.id, key: value })}
															>{glyph(value)}</button
														>
													{/each}
												</div>
											{/if}
										</li>
									{/each}
								</ul>
							</div>
						{/each}
					</section>
				</div>
			</details>
		{/if}

		<!-- Do it --------------------------------------------------------------- -->
		<section
			class="border-ground-line bg-ground/95 sticky bottom-0 flex flex-col items-center gap-3 border-t pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur"
		>
			<p class="panel-title">{resuming ? 'Session in progress' : 'Suggested today'}</p>
			<p class="text-ink-muted max-w-lg text-center text-sm leading-relaxed">
				{#if data.active}
					Your saved session in {glyph(data.active.plan.keyCenter)} is ready where you left it.
				{:else}
					{choice.kind === 'rung'
						? (chosenRung?.instruction ?? '')
						: (chosenProgression?.listenFor ?? '')}
				{/if}
			</p>

			<form method="POST" action="?/start" class="flex w-full flex-col items-center gap-3">
				<input type="hidden" name="length" value={length} />
				<input
					type="hidden"
					name="progression"
					value={choice.kind === 'progression' ? choice.id : ''}
				/>
				<input
					type="hidden"
					name="progressionKey"
					value={choice.kind === 'progression' ? choice.key : ''}
				/>
				<input type="hidden" name="focusKey" value={choice.kind === 'rung' ? choice.key : ''} />
				<input type="hidden" name="focusRung" value={choice.kind === 'rung' ? choice.rung : ''} />

				<button type="submit" class="start">
					<span class="start-verb">{resuming ? 'Carry on' : 'Practise'}</span>
					<span class="start-what"
						>{resuming ? glyph(data.active?.plan.keyCenter ?? '') : summary}</span
					>
				</button>

				{#if !resuming}
					<div class="flex gap-1" aria-label="Session length">
						{#each [10, 20, 35] as const as m (m)}
							<button
								type="button"
								class="minutes"
								class:is-selected={length === m}
								onclick={() => (length = m)}>{m}m</button
							>
						{/each}
					</div>
				{/if}
			</form>

			<!-- Moving the ladder is a separate decision from what to play today, so
		     these sit outside the form that starts a session. -->
			{#if !resuming}
				<div class="flex flex-wrap items-center justify-center gap-3">
					<form method="POST" action="?/back">
						<button
							class="text-ink-dim hover:text-ink font-mono text-[0.7rem] transition-colors"
							disabled={reachedIndex === 0 && data.position.rungIndex === 0}>← step back</button
						>
					</form>
					{#if data.next}
						<form method="POST" action="?/advance">
							<button
								class="border-ground-line hover:border-ink-dim rounded-lg border px-2.5 py-1 font-mono text-[0.7rem] transition-colors"
								class:is-suggested={data.progress.looksSolid}
							>
								{data.progress.looksSolid ? 'ready for' : 'move on to'}
								{data.next.rung.id === 'scale' && data.next.key !== data.position.key
									? glyph(data.next.key)
									: data.next.rung.label.toLowerCase()} →
							</button>
						</form>
					{/if}
					{#if data.progress.reviews > 0}
						<span class="text-ink-dim font-mono text-[0.68rem]">
							{data.progress.correct}/{data.progress.reviews} right here
							{#if data.progress.looksSolid}· solid{/if}
						</span>
					{/if}
				</div>
			{/if}
		</section>
	</main>
{/if}

<style>
	.panel-title {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--color-ink-dim);
	}

	/* A key. Carries its tonic's colour, like every other pitch in the app. */
	.key {
		display: flex;
		min-width: 3.4rem;
		flex-direction: column;
		align-items: center;
		gap: 0.05rem;
		padding: 0.4rem 0.55rem;
		border-radius: 9px;
		border: 1px solid var(--color-ground-line);
		background: color-mix(in oklab, var(--tint) 10%, var(--color-ground-raised));
		transition:
			border-color 120ms ease,
			background 120ms ease,
			opacity 160ms ease;
	}

	.key-name {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.key-minor {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		color: var(--color-ink-dim);
	}

	.key:hover {
		border-color: var(--color-ink-dim);
	}

	.key.is-open {
		background: color-mix(in oklab, var(--tint) 30%, var(--color-ground-raised));
		border-color: var(--tint);
	}

	/* Not reached yet. Quieter, never disabled — the ladder suggests, it does not gate. */
	.key.is-ahead {
		opacity: 0.45;
	}

	.rung {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
		padding: 0.55rem 0.75rem;
		border-radius: 9px;
		border: 1px solid transparent;
		text-align: left;
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}

	.rung:hover {
		background: var(--color-ground-raised);
	}

	.rung.is-selected {
		background: color-mix(in oklab, var(--tint) 16%, var(--color-ground-raised));
		border-color: var(--tint);
	}

	.rung-index {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-dim);
		font-variant-numeric: tabular-nums;
	}

	.rung-label {
		display: block;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.rung-teaches {
		display: block;
		font-size: 0.72rem;
		line-height: 1.3;
		color: var(--color-ink-dim);
	}

	.badge {
		flex: none;
		padding: 0.1rem 0.4rem;
		border-radius: 999px;
		background: var(--color-ground-overlay);
		font-family: var(--font-mono);
		font-size: 0.58rem;
		color: var(--color-ink-muted);
		white-space: nowrap;
	}

	.key-pill {
		padding: 0.2rem 0.5rem;
		border-radius: 6px;
		border: 1px solid var(--color-ground-line);
		font-family: var(--font-mono);
		font-size: 0.66rem;
		color: var(--color-ink-muted);
	}

	.key-pill.is-selected {
		background: color-mix(in oklab, var(--tint) 30%, var(--color-ground-raised));
		border-color: var(--tint);
		color: var(--color-ink);
	}

	.key-pill.is-ahead {
		opacity: 0.5;
	}

	.is-open-row {
		background: var(--color-ground-raised);
	}

	/* The one big target, kept in view while you scroll the picker. */
	.start {
		display: flex;
		width: 100%;
		max-width: 30rem;
		flex-direction: column;
		align-items: center;
		gap: 0.1rem;
		border-radius: 16px;
		background: var(--color-ink);
		padding: 0.85rem 2rem;
		color: var(--color-ground);
		transition: transform 120ms ease;
	}

	.start:active {
		transform: scale(0.985);
	}

	.start-verb {
		font-family: var(--font-display);
		font-size: 1.25rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.start-what {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		opacity: 0.72;
	}

	.minutes {
		border: 1px solid var(--color-ground-line);
		border-radius: 6px;
		padding: 0.25rem 0.55rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-ink-muted);
		transition: border-color 120ms ease;
	}

	.minutes:hover {
		border-color: var(--color-ink-dim);
	}

	.minutes.is-selected {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.is-suggested {
		border-color: var(--pc-5);
		color: var(--color-ink);
	}

	button:disabled {
		opacity: 0.3;
	}
</style>
