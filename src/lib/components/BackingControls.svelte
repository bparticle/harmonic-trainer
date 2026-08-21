<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { BackingTrack, type Part } from '$lib/audio/backing';
	import type { Groove } from '$lib/audio/groove';
	import { CHARTS, chartBySlug, realiseChart } from '$lib/curriculum/charts';
	import { parseKey } from '$lib/music/key';

	/*
	 * A rhythm section, in as little space as a session block can spare.
	 *
	 * The full controls — loop points, key, the mixer, the standards — live on the
	 * Play along page. In a session the key is already decided and the point is to
	 * play, so what is left is: which form, how fast, and go.
	 *
	 * Only the generic vehicles are offered here. A blues or a ii–V cycle is
	 * somewhere to apply the one thing this session was about; a thirty-two bar
	 * standard is a different activity, and choosing between thirteen charts is
	 * not what the last five minutes of a session are for.
	 */

	let {
		keyName,
		groove,
		defaultSlug = 'blues-12'
	}: { keyName: string; groove?: Groove; defaultSlug?: string } = $props();

	const MIN_BPM = 40;
	const MAX_BPM = 300;

	// Seeded from the prop and owned by the chips from then on: which form you
	// are playing over is your choice, not the session's, once you have made it.
	// svelte-ignore state_referenced_locally
	let slug = $state(defaultSlug);
	// svelte-ignore state_referenced_locally
	let bpm = $state(chartBySlug(defaultSlug)?.defaultBpm ?? 120);
	let playing = $state(false);
	let counting = $state(false);
	let liveBar = $state(0);

	const OFFERED = CHARTS.filter((c) => c.category === 'form' || c.category === 'cycle');

	const seed = $derived(chartBySlug(slug) ?? CHARTS[0]);
	const chart = $derived(realiseChart(seed, keyName));
	const nowPlaying = $derived(
		liveBar > 0
			? (chart.rows.flat().find((b) => b.number === liveBar)?.chords ?? []).map((c) => c.symbol)
			: []
	);

	const track = new BackingTrack();
	track.onBeat = (state) => (liveBar = state.playing ? state.bar : 0);
	track.onStart = () => (counting = false);

	// The chart's own groove unless the block asked for one. A blues in a session
	// should shuffle here for the same reason it shuffles on the play-along page.
	const activeGroove = $derived<Groove>(groove ?? seed.defaultGroove);

	const config = () => ({
		bars: chart.bars,
		bpm,
		groove: activeGroove,
		key: parseKey(keyName),
		beatsPerBar: chart.beatsPerBar,
		countInBars: 1
	});

	async function toggle() {
		if (playing) {
			track.stop();
			playing = false;
			counting = false;
		} else {
			counting = true;
			await track.start(config());
			playing = track.playing;
		}
	}

	function nudge(by: number) {
		bpm = Math.max(MIN_BPM, Math.min(MAX_BPM, bpm + by));
		track.setBpm(bpm);
	}

	function chooseChart(next: string) {
		slug = next;
		bpm = chartBySlug(next)?.defaultBpm ?? bpm;
		// The groove follows from the seed via `activeGroove`; only the tempo has
		// to be copied, because it is yours to nudge once it has arrived.
		if (playing) {
			counting = true;
			void track.start(config());
		}
	}

	function setMuted(part: Part, value: boolean) {
		track.setMuted(part, value);
	}

	/*
	 * The key can change under us if the session moves on, and the track has to
	 * follow. `untrack` keeps this depending on the key and nothing else — the
	 * body reads `playing`, and without it pressing play would re-run the effect
	 * and start a second track on top of the first.
	 */
	$effect(() => {
		const current = keyName;
		untrack(() => {
			if (playing) void track.start({ ...config(), key: parseKey(current) });
		});
	});

	onDestroy(() => track.dispose());
</script>

<div class="flex w-full max-w-2xl flex-col gap-3">
	<div class="flex flex-wrap justify-center gap-1.5">
		{#each OFFERED as option (option.slug)}
			<button
				type="button"
				class="chip"
				class:is-on={option.slug === slug}
				onclick={() => chooseChart(option.slug)}>{option.name}</button
			>
		{/each}
	</div>

	<button type="button" class="transport" onclick={toggle}>
		<span class="transport-mark" aria-hidden="true">{playing ? '■' : '▶'}</span>
		<span class="transport-text">
			{#if counting}
				Counting in…
			{:else if playing}
				{nowPlaying.join(' · ') || 'Playing'}
			{:else}
				Play · {keyName.replace('b', '♭')}
			{/if}
		</span>
	</button>

	<div class="flex flex-wrap items-center justify-center gap-2">
		<button type="button" class="stepper" onclick={() => nudge(-5)} aria-label="Slower">−</button>
		<span class="text-ink font-mono text-lg tabular-nums">{bpm}</span>
		<button type="button" class="stepper" onclick={() => nudge(5)} aria-label="Faster">+</button>

		<span class="bg-ground-line mx-2 h-6 w-px"></span>

		{#each [['comp', 'Comping'], ['metronome', 'Click']] as const as [part, label] (part)}
			<label class="toggle">
				<input type="checkbox" onchange={(e) => setMuted(part, !e.currentTarget.checked)} />
				{label}
			</label>
		{/each}

		<a class="more" href="/backing">Full setup →</a>
	</div>
</div>

<style>
	.chip {
		padding: 0.4rem 0.7rem;
		border-radius: 8px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground-raised);
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	.chip.is-on {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.transport {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
		padding: 1rem 1.3rem;
		border-radius: 12px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground-raised);
		color: var(--color-ink);
	}

	.transport:hover {
		background: var(--color-ground-overlay);
	}

	.transport-mark {
		font-size: 1.4rem;
		line-height: 1;
	}

	.transport-text {
		font-family: var(--font-mono);
		font-size: 1.05rem;
	}

	.stepper {
		width: 2.4rem;
		height: 2.4rem;
		border-radius: 8px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground-raised);
		color: var(--color-ink);
		font-size: 1.2rem;
		line-height: 1;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink-muted);
	}

	.more {
		margin-left: 0.4rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-ink-dim);
		transition: color 120ms ease;
	}

	.more:hover {
		color: var(--color-ink);
	}
</style>
