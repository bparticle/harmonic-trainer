<script lang="ts">
	import { onMount, tick } from 'svelte';
	import FifthsBoard from '$lib/practice/FifthsBoard.svelte';
	import {
		buildRound,
		FIFTHS_WAVES,
		MIXED_WAVE,
		sharesPosition,
		signatureLabel,
		type MajorKey,
		type Shot
	} from '$lib/practice/fifths';

	const STORAGE_KEY = 'roundel:fifths';
	const allKeys = FIFTHS_WAVES.flatMap((wave) => wave.keys);
	let wave = $state(0);
	let unlocked = $state(0);
	let bestMixed = $state(0);
	let phase = $state<'briefing' | 'play' | 'clear'>('briefing');
	let queue = $state.raw<Shot[]>([]);
	let total = $state(0);
	let score = $state(0);
	let streak = $state(0);
	let bestStreak = $state(0);
	let firstHits = $state(0);
	let startedAt = 0;
	const misses = new Set<Shot>();

	let result = $state.raw<{
		hit: boolean;
		firedAt: number;
		choice?: MajorKey;
		points: number;
		fast: boolean;
	} | null>(null);
	let heading = $state<HTMLHeadingElement>();
	let continueButton = $state<HTMLButtonElement>();
	const current = $derived(FIFTHS_WAVES[wave]);
	const shot = $derived(queue[0]);
	const openPositions = $derived(
		new Set(
			FIFTHS_WAVES.slice(0, wave + 1).flatMap((entry) => entry.keys.map((key) => key.position))
		)
	);
	const isPositionShot = $derived(shot?.kind === 'position' || shot?.kind === 'signature-position');
	const cleared = $derived(total - queue.length + (result?.hit ? 1 : 0));

	function savedProgress() {
		try {
			const { unlocked, bestMixed } = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
			return {
				unlocked:
					Number.isInteger(unlocked) && unlocked >= 0 && unlocked <= MIXED_WAVE
						? Number(unlocked)
						: 0,
				bestMixed: Number.isSafeInteger(bestMixed) && bestMixed > 0 ? Number(bestMixed) : 0
			};
		} catch {
			return { unlocked: 0, bestMixed: 0 };
		}
	}

	onMount(() => {
		({ unlocked, bestMixed } = savedProgress());
		wave = unlocked;
	});

	function saveProgress() {
		const saved = savedProgress();
		unlocked = Math.max(unlocked, saved.unlocked);
		bestMixed = Math.max(bestMixed, saved.bestMixed);
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify({ unlocked, bestMixed }));
		} catch {
			// The current game can continue when browser storage is unavailable.
		}
	}

	async function focusPrompt() {
		await tick();
		heading?.focus({ preventScroll: true });
		startedAt = performance.now();
	}

	function visit(next: number) {
		if (phase === 'play' || next > unlocked) return;
		wave = next;
		phase = 'briefing';
		void focusPrompt();
	}

	function launch() {
		queue = buildRound(wave);
		total = queue.length;
		score = streak = bestStreak = firstHits = 0;
		misses.clear();
		result = null;
		phase = 'play';
		void focusPrompt();
	}

	async function fire(position: number, choice?: MajorKey) {
		if (phase !== 'play' || result || !shot) return;
		const hit = choice ? choice === shot.target : position === shot.target.position;
		const firstHit = hit && !misses.has(shot);
		const fast = firstHit && wave === MIXED_WAVE && performance.now() - startedAt <= 3000;
		let points = 0;
		if (firstHit) {
			firstHits++;
			streak++;
			bestStreak = Math.max(bestStreak, streak);
			points = 100 + 20 * Math.min(streak - 1, 5) + (fast ? 50 : 0);
			score += points;
		} else if (!hit) {
			streak = 0;
			misses.add(shot);
		}
		result = { hit, firedAt: position, choice, points, fast };
		await tick();
		continueButton?.focus({ preventScroll: true });
	}

	function advance() {
		if (!result || !shot) return;
		queue = result.hit ? queue.slice(1) : [...queue.slice(1), shot];
		result = null;
		if (queue.length === 0) {
			phase = 'clear';
			unlocked = Math.max(unlocked, Math.min(wave + 1, MIXED_WAVE));
			if (wave === MIXED_WAVE) bestMixed = Math.max(bestMixed, score);
			saveProgress();
		}
		void focusPrompt();
	}

	function clockLabel(position: number) {
		return `${position || 12} o’clock`;
	}

	function directionLabel(direction: number) {
		return direction === 1 ? 'Clockwise' : 'Counterclockwise';
	}

	function promptTitle(shot: Shot): string {
		switch (shot.kind) {
			case 'signature-position':
				return signatureLabel(shot.target.signature);
			case 'name':
				return 'Which major key?';
			case 'neighbor':
				return `${directionLabel(shot.direction)} from ${shot.from.name}`;
			default:
				return `${shot.target.name} major`;
		}
	}

	function spellingHint(target: MajorKey): string {
		if (!sharesPosition(target)) return '';
		return ` Choose the key with ${target.signature > 0 ? 'sharps' : 'flats'}.`;
	}
</script>

<svelte:head>
	<title>Fifths — Roundel</title>
	<meta
		name="description"
		content="Play the circle of fifths. Recall major keys, their positions, and their signatures."
	/>
</svelte:head>

<main class="fifths">
	<header class="masthead">
		<div>
			<h1>Fifths</h1>
			<p>Circle of fifths arcade</p>
		</div>
		<dl class="scoreboard">
			<div>
				<dt>Score</dt>
				<dd>{(phase === 'briefing' ? 0 : score).toLocaleString('en-US')}</dd>
			</div>
			<div>
				<dt>Streak</dt>
				<dd>{phase === 'briefing' ? 0 : streak}</dd>
			</div>
		</dl>
	</header>

	<div class="waves" role="group" aria-label="Waves">
		{#each FIFTHS_WAVES as entry, index (entry.name)}
			<button
				class="wave"
				class:current={index === wave}
				class:locked={index > unlocked}
				type="button"
				aria-current={index === wave ? 'step' : undefined}
				disabled={index > unlocked || phase === 'play'}
				onclick={() => visit(index)}
				><span class="wave-number">{index + 1}</span><span>{entry.name}</span></button
			>
		{/each}
	</div>

	<section class="arena" aria-label={current.name}>
		<div class="prompt">
			{#if phase === 'briefing'}
				<p class="caption">Wave {wave + 1} of {FIFTHS_WAVES.length}</p>
				<h2 bind:this={heading} tabindex="-1">{current.name}</h2>
				<p class="instruction">{current.brief}</p>
			{:else if phase === 'clear'}
				<p class="caption">{current.name}</p>
				<h2 bind:this={heading} tabindex="-1">
					{wave === MIXED_WAVE ? 'Circuit clear' : 'Wave clear'}
				</h2>
				<p class="instruction">{firstHits} of {total} first-try hits. Best streak {bestStreak}.</p>
			{:else if shot}
				<p class="caption">
					{#if isPositionShot}Find the position
					{:else if shot.kind === 'name'}Name the position
					{:else if shot.kind === 'signature'}Name the signature
					{:else}Follow the order{/if}
				</p>
				<h2 bind:this={heading} tabindex="-1" aria-describedby="fifths-instruction">
					{promptTitle(shot)}
				</h2>
				<p class="instruction" id="fifths-instruction">
					{#if shot.kind === 'position'}Fire at its place on the circle.
					{:else if shot.kind === 'signature-position'}Fire at the position with this key signature.
					{:else if shot.kind === 'name'}Name the marked spot.{spellingHint(shot.target)}
						<span class="sr-only">The mark is at {clockLabel(shot.target.position)}.</span>
					{:else if shot.kind === 'signature'}How many sharps or flats?
					{:else}Choose the next key in that direction.{spellingHint(shot.target)}{/if}
				</p>
			{/if}
		</div>

		<div class="dial">
			<FifthsBoard
				open={openPositions}
				briefing={phase === 'briefing'
					? current.keys
					: phase === 'clear'
						? wave === MIXED_WAVE
							? allKeys
							: current.keys
						: []}
				armed={phase === 'play' && isPositionShot && !result}
				marked={phase === 'play' && !result && shot?.kind === 'name'
					? shot.target.position
					: undefined}
				impact={result && shot
					? { firedAt: result.firedAt, target: shot.target, hit: result.hit }
					: undefined}
				onfire={(position) => void fire(position)}
			/>
		</div>

		<div class="controls">
			{#if phase === 'briefing'}
				{#if current.keys.length}
					<ul class="key-brief" aria-label="Keys in this wave">
						{#each current.keys as key (key.name)}
							<li style:--pitch="var(--pc-{key.pc})">
								<strong>{key.name}</strong>
								<span>{signatureLabel(key.signature)}</span>
							</li>
						{/each}
					</ul>
				{:else if bestMixed > 0}
					<p class="best">Personal best <strong>{bestMixed.toLocaleString('en-US')}</strong></p>
				{/if}
				<button class="action" type="button" onclick={launch}
					>Launch wave <span aria-hidden="true">↗</span></button
				>
			{:else if phase === 'clear'}
				{#if wave === MIXED_WAVE}
					<p class="best">Personal best <strong>{bestMixed.toLocaleString('en-US')}</strong></p>
					<button class="action" type="button" onclick={launch}
						>Play mixed circuit again <span aria-hidden="true">↻</span></button
					>
				{:else}
					<button class="action" type="button" onclick={() => visit(wave + 1)}
						>Next wave <span aria-hidden="true">↗</span></button
					>
					<button class="again" type="button" onclick={() => visit(wave)}>Replay wave</button>
				{/if}
			{:else if shot}
				{#if 'choices' in shot}
					<div class="choices" role="group" aria-label="Answers">
						{#each shot.choices as choice (choice.name)}
							<button
								class="choice"
								class:correct={result && choice === shot.target}
								class:incorrect={result && !result.hit && choice === result.choice}
								type="button"
								disabled={!!result}
								onclick={() => void fire(choice.position, choice)}
								>{shot.kind === 'signature'
									? signatureLabel(choice.signature)
									: choice.name}</button
							>
						{/each}
					</div>
				{/if}
				<div
					class="feedback"
					id="fifths-feedback"
					class:miss={result && !result.hit}
					aria-live="polite"
					aria-atomic="true"
				>
					{#if result}
						<p class="verdict">
							{result.hit ? 'Hit' : 'Miss · this shot will return'}
							{#if result.points > 0}<span>+{result.points}{result.fast ? ' · fast shot' : ''}</span
								>{/if}
						</p>
						<p>
							{shot.target.name} major · {clockLabel(shot.target.position)} · {signatureLabel(
								shot.target.signature
							).toLowerCase()}
						</p>
					{/if}
				</div>
				{#if result}
					<button
						class="action"
						type="button"
						bind:this={continueButton}
						aria-describedby="fifths-feedback"
						onclick={advance}
					>
						{cleared === total ? 'See results' : 'Next shot'} <span aria-hidden="true">→</span>
					</button>
				{:else if isPositionShot}
					<p class="keyboard-hint">Select a target, or Tab to the circle and use ← → and Enter.</p>
				{/if}
			{/if}
		</div>

		{#if phase === 'play'}
			<div class="wave-progress">
				<span>{cleared} / {total} cleared</span>
				<progress value={cleared} max={total} aria-label="Shots cleared"></progress>
			</div>
		{/if}
	</section>
</main>

<style>
	.fifths {
		--accent: oklch(0.86 0.09 92);
		--miss: oklch(0.76 0.12 28);
		margin-inline: auto;
		max-width: 72rem;
		padding: clamp(1.3rem, 4vw, 2.8rem) clamp(0.85rem, 4vw, 2rem) 2rem;
	}

	.masthead {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 0.7rem;
		padding-bottom: clamp(0.85rem, 2vw, 1.45rem);
	}

	.masthead h1 {
		font-size: clamp(2.45rem, 5.5vw, 4.75rem);
		font-weight: 650;
		letter-spacing: -0.075em;
		line-height: 0.94;
	}

	.masthead p {
		margin-top: 0.5rem;
		color: var(--color-ink-muted);
		font-size: clamp(0.85rem, 2vw, 1.07rem);
	}

	.scoreboard {
		display: flex;
		gap: clamp(0.7rem, 3vw, 2.3rem);
		font-family: var(--font-mono);
		text-align: right;
	}

	.scoreboard dt,
	.caption,
	.wave-progress,
	.keyboard-hint {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	.scoreboard dd {
		color: var(--accent);
		font-size: clamp(1.15rem, 3.4vw, 2.15rem);
		font-variant-numeric: tabular-nums;
		line-height: 1.18;
	}

	.waves {
		display: flex;
		flex-wrap: wrap;
		gap: 0 min(1.8vw, 1.35rem);
		border-block: 1px solid var(--color-ground-line);
	}

	.wave {
		display: flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.45rem;
		padding: 0.25rem 0.4rem;
		border-bottom: 1px solid transparent;
		color: var(--color-ink-muted);
		font-size: clamp(0.73rem, 1.7vw, 0.93rem);
		text-align: left;
	}

	.wave-number {
		display: grid;
		width: 1.2rem;
		aspect-ratio: 1;
		place-items: center;
		border: 1px solid var(--color-ground-line);
		border-radius: 50%;
		font: 0.68rem var(--font-mono);
	}

	.wave.locked {
		color: var(--color-ink-dim);
	}
	.wave:not(:disabled) {
		cursor: pointer;
	}
	.wave:not(:disabled):hover {
		background: var(--color-ground-raised);
	}
	.wave.current {
		border-color: var(--accent);
		color: var(--color-ink);
	}
	.wave.current .wave-number {
		border-color: var(--accent);
		color: var(--accent);
	}

	.arena {
		display: grid;
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
		grid-template-areas: 'dial prompt' 'dial controls' 'dial progress';
		grid-template-rows: auto 1fr auto;
		align-items: start;
		column-gap: clamp(1.2rem, 4vw, 4rem);
		padding-top: clamp(1.15rem, 3vw, 2.5rem);
	}

	.dial {
		grid-area: dial;
		width: 100%;
		max-width: 34rem;
		margin-inline: auto;
	}
	.prompt {
		grid-area: prompt;
		padding-top: clamp(0.6rem, 4vw, 2.8rem);
	}
	.controls {
		grid-area: controls;
	}

	.caption {
		margin-bottom: 0.36rem;
		color: var(--accent);
		letter-spacing: 0.055em;
		text-transform: uppercase;
	}

	.prompt h2 {
		font-size: clamp(1.9rem, 4.25vw, 3.55rem);
		font-weight: 650;
		letter-spacing: -0.058em;
		line-height: 1;
	}

	.prompt h2:focus {
		outline: none;
	}

	.instruction {
		max-width: 36ch;
		margin-block: 0.7rem 1.05rem;
		color: var(--color-ink-muted);
		font-size: clamp(0.91rem, 2vw, 1.1rem);
		line-height: 1.45;
	}

	.key-brief {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0 0.8rem;
		margin-bottom: 1.25rem;
	}

	.key-brief li,
	.best {
		display: flex;
		min-height: 2.35rem;
		align-items: center;
		gap: 0.55rem;
		border-top: 1px solid var(--color-ground-line);
		color: var(--color-ink-muted);
		font-size: 0.85rem;
	}

	.key-brief strong {
		min-width: 1.7rem;
		color: var(--pitch);
		font-size: 1.19rem;
	}
	.best {
		margin-bottom: 0.8rem;
	}
	.best strong {
		color: var(--accent);
		font-family: var(--font-mono);
	}

	.action,
	.again,
	.choice {
		min-height: 2.75rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 5px;
		padding: 0.55rem 0.85rem;
		font-weight: 650;
		touch-action: manipulation;
	}

	.action {
		display: inline-flex;
		align-items: center;
		gap: 1.45rem;
		border-color: var(--accent);
		background: var(--accent);
		color: var(--color-ground);
		cursor: pointer;
	}

	.action:hover {
		background: color-mix(in oklch, var(--accent) 84%, var(--color-ink));
	}
	.again {
		margin-left: 0.3rem;
		cursor: pointer;
	}
	.again:hover {
		background: var(--color-ground-raised);
	}

	.choices {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.45rem;
	}

	.choice {
		background: var(--color-ground-raised);
		text-align: left;
	}
	.choice:not(:disabled) {
		cursor: pointer;
	}
	.choice:not(:disabled):hover {
		border-color: var(--color-ink-muted);
	}
	.choice.correct {
		border-color: var(--accent);
		color: var(--accent);
	}
	.choice.incorrect {
		border-color: var(--miss);
		color: var(--miss);
	}

	.feedback:not(:empty) {
		margin-block: 0.85rem;
	}
	.feedback {
		color: var(--color-ink-muted);
		font-size: 0.92rem;
	}
	.verdict {
		color: var(--accent);
		font-weight: 650;
	}
	.miss .verdict {
		color: var(--miss);
	}
	.verdict span {
		margin-left: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}
	.keyboard-hint {
		margin-top: 0.4rem;
	}

	.wave-progress {
		grid-area: progress;
		display: flex;
		align-items: center;
		gap: 0.8rem;
		margin-top: 1.05rem;
	}

	.wave-progress progress {
		flex: 1;
		height: 0.35rem;
		border: 0;
		accent-color: var(--accent);
	}

	@media (max-width: 43rem) {
		.arena {
			grid-template-columns: minmax(0, 1fr);
			grid-template-areas: 'prompt' 'dial' 'controls' 'progress';
			grid-template-rows: auto;
			row-gap: 0.45rem;
		}

		.dial {
			max-width: 25rem;
		}
		.prompt {
			padding-top: 0;
		}
		.instruction {
			margin-bottom: 0.35rem;
		}
	}
</style>
