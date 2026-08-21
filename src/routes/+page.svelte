<script lang="ts">
	import { pitchClass } from '$lib/music/note';
	import { parseKey } from '$lib/music/key';
	import LandingPage from '$lib/components/LandingPage.svelte';
	import { TASK_COUNT, type WorkoutSize } from '$lib/session/workout';
	import type { KeyStanding } from '$lib/session/warmth';

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
	 *
	 * **Why this page is colourful, and what the colour is allowed to mean.**
	 * It was grey, and the honest reason was that most of what it says has no
	 * pitch in it: a task, a rung, a count of reviews. Hue means pitch here, so
	 * none of those may be coloured to cheer the screen up. What does have a
	 * pitch is a *key*, and this page is mostly about twelve of them — so the
	 * keys are drawn at the size the subject deserves, each wearing its tonic's
	 * swatch, each filling with what the record actually holds in it. Twelve
	 * saturated colours is a strong image and every one of them is information.
	 * Everything without a pitch — the tasks, the ticks, the rung marks — stays
	 * in weight: ink, dim ink, a dashed outline.
	 *
	 * **An empty key is an invitation.** Ten of the twelve hold nothing on a
	 * record like this one, and they are drawn as a full-strength coloured
	 * outline waiting to be filled rather than as a faded gap, labelled *new*
	 * rather than 0. Nothing on this page is red, nothing counts days, and no
	 * number here can fall while you are away from the piano.
	 */

	let { data } = $props();

	/*
	 * Three sizes, not three lengths.
	 *
	 * The 10/20/35 picker measured something no block ever obeyed — nothing ended
	 * because a timer ran out, so the minutes were a promise the session could not
	 * keep. A workout is three, four or five tasks and every one of them is
	 * countable, which is why the preview beside this can be true.
	 */
	// svelte-ignore state_referenced_locally
	let size = $state<WorkoutSize>(data.size);
	const preview = $derived(data.previews[size] ?? []);

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
	const pcOf = (keyName: string) => pitchClass(parseKey(keyName.replace(/m$/, '')).tonic);
	const tint = (keyName: string) => `var(--pc-${pcOf(keyName)})`;
	/** Contrast-safe ink for text sitting on a swatch, computed from the swatch. */
	const tintInk = (keyName: string) => `var(--pc-${pcOf(keyName)}-ink)`;

	const resuming = $derived(Boolean(data.resume));
	const reachedIndex = $derived(data.position.stageIndex);
	const openStage = $derived(data.stages.find((s) => s.key === openKey) ?? data.stages[0]);
	const openStanding = $derived(data.keys.find((k) => k.key === openKey) ?? data.keys[0]);

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

	// -- The banner ---------------------------------------------------------
	//
	// One key, at the size the subject deserves, in its own colour. Which key
	// depends on what is about to happen: the workout in flight if there is one,
	// otherwise whatever the picker has pinned.

	const heroKey = $derived(resuming ? (data.resume?.keyCenter ?? 'C') : choice.key);

	/** The stage a key belongs to, whichever half of the pair was named. */
	const stageOf = (keyName: string) =>
		data.stages.find((s) => s.key === keyName || s.relativeMinor === keyName);

	/** The other half of the relative pair, which is the same seven notes. */
	const pairOf = (keyName: string) => {
		const stage = stageOf(keyName);
		if (!stage) return null;
		return keyName === stage.relativeMinor ? stage.key : stage.relativeMinor;
	};

	const heroStanding = $derived(
		data.keys.find((k) => k.key === stageOf(heroKey)?.key) ?? openStanding
	);

	/** Where the workout is up to, clamped for display when every task is done. */
	const resumeAt = $derived(
		data.resume ? Math.max(0, Math.min(data.resume.at, data.resume.tasks.length - 1)) : 0
	);

	const heroTitle = $derived.by(() => {
		if (data.resume) return data.resume.complete ? 'Every task is done' : 'Carry on where you were';
		return choice.kind === 'rung' ? (chosenRung?.label ?? '') : (chosenProgression?.name ?? '');
	});

	const heroLine = $derived.by(() => {
		if (data.resume) {
			return data.resume.complete
				? 'Go back to it and it will tell you what changed while it ran.'
				: 'Everything you finished is already on record. Nothing waits on you.';
		}
		return choice.kind === 'rung'
			? (chosenRung?.instruction ?? '')
			: (chosenProgression?.listenFor ?? '');
	});

	const onLadder = $derived(choice.kind === 'rung' && isHere(choice.key, choice.rung));

	const eyebrow = $derived(
		resuming
			? 'in progress'
			: onLadder
				? "today · the ladder's own suggestion"
				: 'today · your pick'
	);

	/** What a key has met of its seven, said as ground covered rather than as a mark. */
	const metLine = (standing: KeyStanding) =>
		standing.reached === 0 ? 'new ground' : `${standing.reached} of ${standing.rungs} met`;

	const percent = (fill: number) => `${Math.round(fill * 100)}%`;

	const held = (standing: KeyStanding) =>
		standing.fresh
			? `${glyph(standing.key)}: nowhere yet — somewhere to go`
			: `${glyph(standing.key)}: ${standing.chords.toLocaleString()} chords played`;
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

<!--
	One key tile: the swatch, the pair of names, and what the record holds.

	Rendered as a button in the picker and as a plain cell while a workout is in
	flight, because a strip you cannot start anything from must not look like one
	you can. Same tile either way, so the two are never drawn differently by
	accident.
-->
{#snippet tile(standing: KeyStanding)}
	<span class="key-swatch"><span class="key-fill"></span></span>
	<span class="key-name">{glyph(standing.key)}</span>
	<span class="key-minor">{glyph(standing.relativeMinor)}</span>
	<span class="key-count">{standing.fresh ? 'new' : standing.chords.toLocaleString()}</span>
{/snippet}

{#if data.public}
	<LandingPage />
{:else}
	<main class="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-8">
		<!--
			The banner: the one thing on this page worth looking at first, which is
			the thing about to be played. A whole panel of a single pitch colour,
			because it is a key and a key wears its tonic's swatch.
		-->
		<section class="hero" style:--tint={tint(heroKey)} style:--tint-ink={tintInk(heroKey)}>
			<div class="hero-key">
				<p class="hero-name">{glyph(heroKey)}</p>
				<p class="hero-pair">
					{#if pairOf(heroKey)}with {glyph(pairOf(heroKey) ?? '')}{/if}
				</p>
				<p class="hero-met">
					{#if data.resume}
						task {resumeAt + 1} of {data.resume.tasks.length}
					{:else}
						{metLine(heroStanding)}
					{/if}
				</p>
			</div>

			<div class="hero-body">
				<p class="panel-title">{eyebrow}</p>
				<h1 class="hero-title">{heroTitle}</h1>
				<p class="hero-line">{heroLine}</p>

				{#if data.resume}
					<ol class="tasks">
						{#each data.resume.tasks as item, i (i)}
							<li class="task" class:is-done={item.finished} class:is-next={i === resumeAt}>
								<span class="task-index">{item.finished ? '✓' : i + 1}</span>
								<span class="min-w-0 flex-1">
									<span class="task-title">{item.title}</span>
									<span class="task-line">{item.line}</span>
								</span>
							</li>
						{/each}
					</ol>
				{:else if preview.length}
					<ol class="tasks">
						{#each preview as item, i (i)}
							<li class="task">
								<span class="task-index">{i + 1}</span>
								<span class="min-w-0 flex-1">
									<span class="task-title">{item.title}</span>
									<span class="task-line">{item.line}</span>
								</span>
							</li>
						{/each}
					</ol>
					<p class="hero-note">
						Composed for today and different tomorrow. Choosing below pins what it is made of; it
						does not change how much of it there is.{#if data.due > 0}
							{' '}{data.due} question{data.due === 1 ? ' is' : 's are'} ready to come round again.
						{/if}
					</p>
				{/if}
			</div>
		</section>

		<!-- The twelve keys ----------------------------------------------------- -->
		<section class="flex flex-col gap-3">
			<h2 class="panel-title">The twelve keys</h2>
			<p class="lede">
				Each swatch fills with the chords the record has heard with that tonic. An outline is a key
				you have not been in yet, which makes it the most interesting thing on this page — press one
				and it becomes today's.
			</p>

			{#if resuming}
				<ul class="keys">
					{#each data.keys as standing (standing.key)}
						<li
							class="key is-static"
							class:is-fresh={standing.fresh}
							class:is-here={standing.here}
							style:--tint={tint(standing.key)}
							style:--fill={percent(standing.fill)}
							title={held(standing)}
						>
							{@render tile(standing)}
						</li>
					{/each}
				</ul>
				<p class="text-ink-dim text-[0.78rem] leading-relaxed">
					Where the record has been so far. The picker comes back when this workout is done.
				</p>
			{:else}
				<!-- Every key, always. Nothing here is gated; the ladder only suggests. -->
				<ul class="keys">
					{#each data.keys as standing (standing.key)}
						<li>
							<button
								type="button"
								class="key w-full"
								class:is-open={standing.key === openKey}
								class:is-fresh={standing.fresh}
								class:is-here={standing.here}
								style:--tint={tint(standing.key)}
								style:--fill={percent(standing.fill)}
								title={held(standing)}
								onclick={() => (openKey = standing.key)}
								aria-pressed={standing.key === openKey}
							>
								{@render tile(standing)}
							</button>
						</li>
					{/each}
				</ul>

				<p class="text-ink-dim text-[0.78rem] leading-relaxed">
					<span class="text-ink-muted">{glyph(openStage.key)}:</span>
					{openStage.note}
					{#if data.stages.indexOf(openStage) > reachedIndex}
						<span class="text-ink-muted"
							>Further along than the ladder suggests — take it anyway if you want it.</span
						>
					{/if}
				</p>

				<!-- The rungs of whichever key is open ----------------------------- -->
				<h3 class="panel-title mt-3">
					Seven steps in {glyph(openKey)} ·
					{#if openStanding.reached === 0}
						new ground, and any of them can be first
					{:else if openStanding.reached >= openStanding.rungs}
						all seven met, and any of them is worth another pass
					{:else}
						{openStanding.reached} met, and the rest are open whenever you want them
					{/if}
				</h3>
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
								class:is-met={i < openStanding.reached}
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
			{/if}
		</section>

		<!-- Progressions, as their own thing ------------------------------------ -->
		{#if !resuming}
			<section class="border-ground-line flex flex-col gap-3 border-t pt-6">
				<h2 class="panel-title">Chord progressions</h2>
				<p class="lede">
					Separate from the keys, on purpose. Pick one and a key — the same progression gets easier
					every time you meet it somewhere new.
				</p>

				{#each byLevel as group (group.level)}
					<div>
						<h3 class="text-ink-dim mt-2 mb-1 font-mono text-[0.65rem] tracking-widest uppercase">
							{group.name}
						</h3>
						<ul class="grid gap-1 sm:grid-cols-2">
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
													class:is-selected={choice.kind === 'progression' && choice.key === value}
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
		{/if}

		<!-- Do it --------------------------------------------------------------- -->
		<section
			class="border-ground-line bg-ground/95 sticky bottom-0 flex flex-col items-center gap-3 border-t pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] backdrop-blur"
		>
			<form method="POST" action="?/start" class="flex w-full flex-col items-center gap-3">
				<input type="hidden" name="size" value={size} />
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

				<button type="submit" class="start" style:--tint={tint(heroKey)}>
					<span class="start-verb">{resuming ? 'Carry on' : 'Practise'}</span>
					<span class="start-what">
						<span class="start-dot"></span>
						{#if data.resume}
							{glyph(data.resume.keyCenter)} · task {resumeAt + 1} of {data.resume.tasks.length}
						{:else}
							{summary}
						{/if}
					</span>
				</button>

				{#if !resuming}
					<div class="flex gap-1" aria-label="Workout size">
						{#each ['short', 'standard', 'long'] as const as option (option)}
							<button
								type="button"
								class="minutes"
								class:is-selected={size === option}
								onclick={() => (size = option)}>{option} · {TASK_COUNT[option]}</button
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
					<span class="text-ink-dim font-mono text-[0.68rem]">
						the ladder: {glyph(data.position.key)} · {data.position.rung.label.toLowerCase()}
						{#if data.progress.reviews > 0}
							· {data.progress.correct}/{data.progress.reviews} right here
						{/if}
					</span>
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

	.lede {
		max-width: 66ch;
		margin-top: -0.15rem;
		color: var(--color-ink-muted);
		font-size: 0.78rem;
		line-height: 1.55;
	}

	/*
	 * The banner.
	 *
	 * The one large field of colour on the page, and it is a key — so it is the
	 * one thing here entitled to a full-strength swatch. Text on it uses the
	 * contrast-safe ink derived from that swatch, which is why the colour editor
	 * cannot make this unreadable.
	 */
	.hero {
		display: grid;
		grid-template-columns: minmax(0, 9.5rem) minmax(0, 1fr);
		overflow: hidden;
		border: 1px solid var(--color-ground-line);
		border-radius: 18px;
		background: var(--color-ground-raised);
	}

	@media (max-width: 640px) {
		.hero {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.hero-key {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 1.1rem 1.2rem 1.15rem;
		background: var(--tint);
		color: var(--tint-ink);
	}

	.hero-name {
		font-family: var(--font-display);
		font-size: clamp(2.8rem, 8vw, 3.75rem);
		font-weight: 600;
		line-height: 0.92;
		letter-spacing: -0.03em;
	}

	.hero-pair,
	.hero-met {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		opacity: 0.78;
	}

	.hero-met {
		margin-top: auto;
		padding-top: 0.6rem;
	}

	.hero-body {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 1.05rem 1.25rem 1.2rem;
	}

	.hero-title {
		font-family: var(--font-display);
		font-size: clamp(1.4rem, 4vw, 1.95rem);
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.1;
		color: var(--color-ink);
	}

	.hero-line {
		max-width: 52ch;
		color: var(--color-ink-muted);
		font-size: 0.88rem;
		line-height: 1.5;
	}

	.hero-note {
		margin-top: 0.35rem;
		color: var(--color-ink-dim);
		font-size: 0.72rem;
		line-height: 1.45;
	}

	.tasks {
		margin-top: 0.5rem;
		border-top: 1px solid color-mix(in oklab, var(--color-ground-line) 60%, transparent);
	}

	/*
	 * A task in the preview.
	 *
	 * Drawn in weight and not in colour: a task is not a pitch, so it does not get
	 * one. The keys below carry their tonics' swatches and these deliberately do
	 * not, which is what keeps the colours on this page meaning one thing. A
	 * finished task is dimmed and ticked rather than crossed out or coloured —
	 * done and not-done are the only two states, and neither is a verdict.
	 */
	.task {
		display: flex;
		align-items: baseline;
		gap: 0.7rem;
		padding: 0.42rem 0.15rem;
		border-bottom: 1px solid color-mix(in oklab, var(--color-ground-line) 60%, transparent);
	}

	.task-index {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-dim);
		font-variant-numeric: tabular-nums;
	}

	.task-title {
		display: block;
		font-family: var(--font-display);
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-ink);
	}

	.task-line {
		display: block;
		font-size: 0.72rem;
		line-height: 1.35;
		color: var(--color-ink-dim);
	}

	.task.is-done .task-title {
		color: var(--color-ink-dim);
		font-weight: 500;
	}

	.task.is-done .task-index {
		color: var(--color-ink-muted);
	}

	.task.is-next .task-title {
		color: var(--color-ink);
	}

	.task.is-next .task-index {
		color: var(--color-ink);
	}

	/* The twelve keys, in the order the ladder meets them. */
	.keys {
		display: grid;
		gap: 0.4rem;
		grid-template-columns: repeat(12, minmax(0, 1fr));
	}

	@media (max-width: 760px) {
		.keys {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
	}

	.key {
		display: flex;
		width: 100%;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 0.35rem 0.2rem 0.4rem;
		border-radius: 10px;
		border: 1px solid transparent;
		transition:
			background 120ms ease,
			border-color 120ms ease;
	}

	.key:not(.is-static):hover {
		background: var(--color-ground-raised);
	}

	.key.is-open {
		background: color-mix(in oklab, var(--tint) 18%, var(--color-ground-raised));
		border-color: var(--tint);
	}

	/*
	 * A key's swatch: a column that fills from the bottom with what the record
	 * holds in it. The same figure the profile draws, on purpose — one fact, one
	 * picture of it, in both places.
	 *
	 * The outline is full-strength colour whether or not anything is inside it,
	 * which is the whole trick: a key you have never played reads as an empty
	 * glass rather than as a grey absence. Dashed, because a dashed fill is how
	 * this app has always drawn "nothing here yet", and never dimmed — the ladder
	 * suggests an order and this strip refuses to make the other eleven look
	 * unavailable.
	 */
	.key-swatch {
		display: flex;
		align-items: flex-end;
		width: 100%;
		height: 4.1rem;
		border: 2px solid var(--tint);
		border-radius: 7px;
		background: color-mix(in oklab, var(--tint) 9%, var(--color-ground));
		overflow: hidden;
	}

	.key-fill {
		width: 100%;
		height: var(--fill);
		background: var(--tint);
		transition: height 300ms var(--ease-wheel);
	}

	.key.is-fresh .key-swatch {
		border-style: dashed;
	}

	.key-name {
		font-family: var(--font-display);
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.1;
		color: var(--color-ink);
	}

	.key-minor {
		font-family: var(--font-mono);
		font-size: 0.56rem;
		color: var(--color-ink-dim);
	}

	.key-count {
		font-family: var(--font-mono);
		font-size: 0.58rem;
		color: var(--color-ink-dim);
		font-variant-numeric: tabular-nums;
	}

	/* "new" is the invitation, so it is not dimmer than the number beside it. */
	.key.is-fresh .key-count {
		color: var(--color-ink-muted);
		letter-spacing: 0.04em;
	}

	/* Where the ladder is standing. Ink, because standing somewhere is not a pitch. */
	.key.is-here .key-name::after {
		content: '';
		display: block;
		width: 1.1rem;
		height: 2px;
		margin: 0.15rem auto 0;
		border-radius: 2px;
		background: var(--color-ink);
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

	/* Met before, and startable exactly like the rest. Weight, never a colour. */
	.rung.is-met .rung-index {
		color: var(--color-ink);
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
		padding: 0.95rem 2rem;
		color: var(--color-ground);
		transition: transform 120ms ease;
	}

	.start:active {
		transform: scale(0.985);
	}

	.start-verb {
		font-family: var(--font-display);
		font-size: 1.35rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.start-what {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		opacity: 0.78;
	}

	/* The key this is about to start in, wearing its tonic's colour. */
	.start-dot {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 2px;
		background: var(--tint);
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

	/*
	 * "Ready for the next one" used to be drawn in --pc-5, which is F. Being
	 * ready is not a pitch, and a green that means "go" is exactly the colour
	 * standing for nothing the house rule refuses. It is weight now.
	 */
	.is-suggested {
		border-color: var(--color-ink);
		color: var(--color-ink);
	}

	button:disabled {
		opacity: 0.3;
	}

	@media (prefers-reduced-motion: reduce) {
		.key-fill {
			transition: none;
		}
	}
</style>
