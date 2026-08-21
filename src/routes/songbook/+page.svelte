<script lang="ts">
	import ChartEditor from '$lib/components/ChartEditor.svelte';
	import { CHART_CATEGORIES, type ChartCategory } from '$lib/curriculum/charts';
	import { GROOVES } from '$lib/audio/groove';
	import { formatKey, parseKey } from '$lib/music/key';
	import { realiseChart, type ChartSeed } from '$lib/curriculum/charts';
	import type { SongbookEntry } from './+page.server';

	/*
	 * The songbook.
	 *
	 * Everything there is to play, and the place a tune of your own gets written
	 * down. Both used to live on `/backing`: the list as a sidebar you collapsed
	 * to get it out of the way, and the editor *inside the practice area*, reached
	 * by a small link at the bottom of that list. Writing a chart replaced the
	 * chart, the transport and the score with a grid of text boxes.
	 *
	 * It read as bolted on because it was. Practising and cataloguing are
	 * different activities — one is done with your hands on the keys and the other
	 * with them on a keyboard — and this is the second one given a room.
	 *
	 * **What the filters are for.** Thirty-five tunes is past the point where a
	 * list is something you read; it becomes something you scroll past. So the
	 * list narrows: by words, by what kind of thing it is, by the rhythm section
	 * it opens with, by whether it is yours, and by whether you have been taught
	 * the chords in it.
	 *
	 * **Readiness is a signpost, never a lock.** Every tune here opens, in every
	 * key, whatever the ladder says. What the mark does is answer the question the
	 * list could not previously answer at all — *which of these can I actually
	 * play today* — and, on the ones you cannot, say which chord is in the way.
	 * The workout uses the same fact to decide where to set a mission; this is
	 * that fact made visible where tunes are chosen. A padlock would be a
	 * different product.
	 */

	let { data, form } = $props();

	const entries = $derived(data.entries as SongbookEntry[]);

	// --- narrowing down ------------------------------------------------------

	let search = $state('');
	let category = $state<ChartCategory | 'all'>('all');
	let groove = $state<string>('all');
	let readyOnly = $state(false);

	const grooveName = (id: string) => GROOVES.find((g) => g.id === id)?.name ?? id;

	/** The key a tune opens in, said the way the rest of the app says it. */
	const homeKey = (entry: SongbookEntry) => {
		if (!entry.defaultKey) return 'any key';
		const label = formatKey(parseKey(entry.defaultKey));
		return entry.mode === 'minor' ? `${label} minor` : label;
	};

	/*
	 * Only the categories and grooves that something is actually filed under.
	 *
	 * A filter offering a choice that empties the list is a filter that has lied
	 * to you once. Derived from the entries rather than from the vocabularies, so
	 * adding a chart in a new style adds the chip and removing the last one takes
	 * it away.
	 */
	const categories = $derived(
		(Object.keys(CHART_CATEGORIES) as ChartCategory[]).filter((c) =>
			entries.some((entry) => entry.category === c)
		)
	);

	const grooves = $derived(
		GROOVES.map((g) => g.id).filter((id) => entries.some((entry) => entry.defaultGroove === id))
	);

	const shown = $derived.by(() => {
		const words = search.trim().toLowerCase();
		return entries.filter((entry) => {
			if (category !== 'all' && entry.category !== category) return false;
			if (groove !== 'all' && entry.defaultGroove !== groove) return false;
			if (readyOnly && !entry.ready) return false;
			if (!words) return true;
			return entry.name.toLowerCase().includes(words) || entry.notes.toLowerCase().includes(words);
		});
	});

	const readyCount = $derived(entries.filter((entry) => entry.ready).length);

	const filtered = $derived(
		search.trim() !== '' || category !== 'all' || groove !== 'all' || readyOnly
	);

	function clearFilters() {
		search = '';
		category = 'all';
		groove = 'all';
		readyOnly = false;
	}

	// --- writing one down ----------------------------------------------------

	/*
	 * The editor opens over the list rather than beside it.
	 *
	 * A chart is a grid sixteen bars wide and the list is a column; trying to hold
	 * both at once is what made this feel cramped on the play-along page. Here
	 * there is no transport to displace, so the editor simply takes the room.
	 */
	/*
	 * A refused save comes back as a bag of what was typed, and `fail` widens its
	 * type to the fields every branch shares. Read loosely here rather than
	 * threaded through a type that would have to be kept in step with the action.
	 */
	type Refused = {
		problems?: string[];
		id?: string;
		name?: string;
		text?: string;
		key?: string;
		mode?: string;
		bpm?: number;
		groove?: string;
		notes?: string;
		lyrics?: string[][];
	};

	const refused = $derived(form as Refused | null);

	// svelte-ignore state_referenced_locally
	let editing = $state<SongbookEntry | null>(
		refused?.id ? (entries.find((entry) => entry.id === refused.id) ?? null) : null
	);
	// svelte-ignore state_referenced_locally
	let writing = $state(Boolean(refused) && !refused?.id);
	let confirming = $state<string | null>(null);

	const open = $derived(writing || editing !== null);

	const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
	const keyLabel = (name: string) => formatKey(parseKey(name));

	function close() {
		writing = false;
		editing = null;
	}

	/**
	 * A stored chart, turned back into the chord symbols it was typed as.
	 *
	 * The grid holds numerals, because that is what makes one typing play in all
	 * twelve keys — so editing it means resolving it back into the key it was
	 * written in first. Same round trip the play-along page used to do, moved here
	 * with the editor.
	 */
	function asTyped(entry: SongbookEntry): string {
		const seed = {
			slug: entry.slug,
			name: entry.name,
			style: entry.style,
			category: entry.category,
			mode: entry.mode,
			defaultBpm: entry.defaultBpm,
			defaultGroove: entry.defaultGroove,
			grid: entry.grid,
			lyrics: entry.lyrics,
			notes: entry.notes
		} as ChartSeed;

		return realiseChart(seed, entry.defaultKey ?? 'C')
			.rows.map((row) => row.map((bar) => bar.chords.map((c) => c.symbol).join(' ')).join(' | '))
			.join('\n');
	}

	/*
	 * What the editor opens holding.
	 *
	 * A refused save wins over the chart being edited, so a rejected edit reopens
	 * on what you typed rather than throwing it away and starting from the stored
	 * version again.
	 */
	const editorInitial = $derived(
		refused ??
			(editing
				? {
						name: editing.name,
						text: asTyped(editing),
						key: editing.defaultKey ?? 'C',
						mode: editing.mode,
						bpm: editing.defaultBpm,
						groove: editing.defaultGroove,
						lyrics: editing.lyrics,
						// The loader shows 'Yours.' where a chart has no notes. It is a
						// placeholder on the way out and must not become real text on the
						// way back in.
						notes: editing.notes === 'Yours.' ? '' : editing.notes
					}
				: null)
	);
</script>

<svelte:head>
	<title>Songbook · Harmonic</title>
</svelte:head>

<div class="mx-auto flex max-w-[1500px] flex-col gap-6 px-3 py-6 sm:px-5">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="panel-title">Songbook</p>
			<h1 class="font-display text-ink text-2xl font-semibold tracking-tight">
				{entries.length} tunes
			</h1>
			<p class="lede mt-1 max-w-[60ch]">
				Forms, cycles, public-domain standards, traditionals, and anything you have typed in.
				<strong class="text-ink">{readyCount}</strong> of them use only chords the drill room has taught
				you so far — the rest are open too, and say what they would ask.
			</p>
		</div>

		{#if !open}
			<button type="button" class="write" onclick={() => (writing = true)}>
				<span class="write-verb">Write a chart down</span>
				<span class="write-what">chords as you would say them, in any key</span>
			</button>
		{/if}
	</header>

	{#if open}
		<!-- The editor, in a room of its own. See the note at the top of this file
		     for why it is no longer standing where the chart should be. -->
		<section class="border-ground-line bg-ground-raised rounded-xl border p-4">
			<div class="mb-3 flex items-baseline justify-between gap-3">
				<h2 class="panel-title">{editing ? `Editing ${editing.name}` : 'A new chart'}</h2>
				<button type="button" class="text-ink-dim text-xs underline" onclick={close}>close</button>
			</div>

			<ChartEditor
				keys={KEYS}
				{keyLabel}
				initialKey={editing?.defaultKey ?? 'C'}
				initial={editorInitial}
				editing={editing?.id ? { id: editing.id, name: editing.name } : null}
				onCancel={close}
			/>

			{#if refused?.problems?.length}
				<div role="alert" class="border-ground-line mt-4 rounded-lg border p-3">
					<p class="mb-1 text-sm font-semibold">The save was refused:</p>
					<ul class="flex flex-col gap-0.5">
						{#each refused.problems as problem (problem)}
							<li class="text-ink-muted font-mono text-xs">{problem}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</section>
	{/if}

	<!-- Narrowing down ------------------------------------------------------ -->
	<section class="filters" aria-label="Narrow the list">
		<input
			class="search"
			type="search"
			bind:value={search}
			placeholder="Search by name or by what it is for"
			aria-label="Search the songbook"
		/>

		<div class="chips" role="group" aria-label="Kind">
			<button
				type="button"
				class="chip"
				class:is-on={category === 'all'}
				onclick={() => (category = 'all')}>All</button
			>
			{#each categories as option (option)}
				<button
					type="button"
					class="chip"
					class:is-on={category === option}
					onclick={() => (category = option)}>{CHART_CATEGORIES[option]}</button
				>
			{/each}
		</div>

		<div class="chips" role="group" aria-label="Rhythm section">
			<button
				type="button"
				class="chip"
				class:is-on={groove === 'all'}
				onclick={() => (groove = 'all')}>Any groove</button
			>
			{#each grooves as option (option)}
				<button
					type="button"
					class="chip"
					class:is-on={groove === option}
					onclick={() => (groove = option)}>{grooveName(option)}</button
				>
			{/each}
		</div>

		<button
			type="button"
			class="chip"
			class:is-on={readyOnly}
			aria-pressed={readyOnly}
			onclick={() => (readyOnly = !readyOnly)}>Only what I can play</button
		>

		{#if filtered}
			<button type="button" class="text-ink-dim text-xs underline" onclick={clearFilters}
				>clear</button
			>
		{/if}
	</section>

	<!-- The list ------------------------------------------------------------ -->
	{#if shown.length === 0}
		<p class="lede">
			Nothing matches that. <button type="button" class="underline" onclick={clearFilters}
				>Clear the filters</button
			>
			to see all {entries.length}.
		</p>
	{:else}
		<p class="text-ink-dim font-mono text-xs">
			{shown.length} of {entries.length}, plainest first
		</p>

		<ul class="tunes">
			{#each shown as entry (entry.slug)}
				<li class="tune" class:is-waiting={!entry.ready}>
					<div class="tune-head">
						<a class="tune-name" href={`/backing?chart=${encodeURIComponent(entry.slug)}`}
							>{entry.name}</a
						>
						{#if entry.category === 'mine'}<span class="tag">yours</span>{/if}
					</div>

					<p class="tune-meta">
						{entry.bars} bars · {homeKey(entry)} · {grooveName(entry.defaultGroove)} at {entry.defaultBpm}{#if entry.published}
							· {entry.published}{/if}
					</p>

					<p class="tune-notes">{entry.notes}</p>

					<div class="tune-foot">
						{#if entry.ready}
							<span class="ready">ready</span>
						{:else}
							<!-- Never "locked". It says what the tune would ask, which is the
							     difference between a closed door and a next thing to learn. -->
							<span class="wants">wants {entry.wants.join(', ')}</span>
						{/if}

						<a class="action" href={`/backing?chart=${encodeURIComponent(entry.slug)}`}>play →</a>

						{#if entry.id}
							<button
								type="button"
								class="action"
								onclick={() => {
									editing = entry;
									writing = false;
									confirming = null;
								}}>edit</button
							>
							{#if confirming === entry.id}
								<form method="POST" action="?/remove" class="inline-flex items-center gap-2">
									<input type="hidden" name="id" value={entry.id} />
									<button class="action">yes, delete</button>
									<button type="button" class="action" onclick={() => (confirming = null)}
										>cancel</button
									>
								</form>
							{:else}
								<button type="button" class="action" onclick={() => (confirming = entry.id ?? null)}
									>delete</button
								>
							{/if}
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	/*
	 * Weight, not hue.
	 *
	 * Hue means pitch everywhere in this app and a tune is not a pitch, so nothing
	 * on this page is coloured — a tune you are ready for is drawn in full ink and
	 * one you are not in muted ink, and that is the whole visual vocabulary. In
	 * particular nothing here is red and nothing is a padlock: the difference
	 * between the two states is *how far away it is*, not whether you are allowed.
	 */

	.write {
		border: 1px solid var(--color-ground-line);
		border-radius: 0.75rem;
		padding: 0.6rem 0.9rem;
		text-align: left;
		background: var(--color-ground-raised);
	}

	.write:hover {
		border-color: color-mix(in oklab, var(--color-ink) 35%, transparent);
	}

	.write-verb {
		display: block;
		color: var(--color-ink);
		font-size: 0.9rem;
		font-weight: 600;
	}

	.write-what {
		display: block;
		color: var(--color-ink-dim);
		font-size: 0.72rem;
	}

	.filters {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.6rem;
	}

	.search {
		flex: 1 1 18rem;
		min-width: 0;
		border: 1px solid var(--color-ground-line);
		border-radius: 0.5rem;
		background: var(--color-ground-raised);
		padding: 0.4rem 0.6rem;
		color: var(--color-ink);
		font-size: 0.82rem;
	}

	.search::placeholder {
		color: var(--color-ink-dim);
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}

	.chip {
		border: 1px solid var(--color-ground-line);
		border-radius: 999px;
		padding: 0.2rem 0.6rem;
		color: var(--color-ink-muted);
		font-family: var(--font-mono, monospace);
		font-size: 0.68rem;
		text-transform: lowercase;
	}

	.chip:hover {
		color: var(--color-ink);
	}

	.chip.is-on {
		border-color: color-mix(in oklab, var(--color-ink) 45%, transparent);
		color: var(--color-ink);
	}

	.tunes {
		display: grid;
		gap: 0.6rem;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 21rem), 1fr));
	}

	.tune {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 0.75rem;
		padding: 0.7rem 0.8rem;
		background: var(--color-ground-raised);
	}

	/* Muted rather than greyed out: it is further away, not unavailable. */
	.tune.is-waiting {
		background: transparent;
	}

	.tune-head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.tune-name {
		color: var(--color-ink);
		font-size: 0.95rem;
		font-weight: 600;
		line-height: 1.2;
	}

	.tune-name:hover {
		text-decoration: underline;
	}

	.tune.is-waiting .tune-name {
		color: var(--color-ink-muted);
	}

	.tag {
		border: 1px solid var(--color-ground-line);
		border-radius: 999px;
		padding: 0 0.35rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono, monospace);
		font-size: 0.6rem;
	}

	.tune-meta {
		color: var(--color-ink-dim);
		font-family: var(--font-mono, monospace);
		font-size: 0.68rem;
	}

	.tune-notes {
		color: var(--color-ink-muted);
		font-size: 0.76rem;
		line-height: 1.45;
	}

	.tune-foot {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem 0.7rem;
		margin-top: 0.15rem;
		font-family: var(--font-mono, monospace);
		font-size: 0.68rem;
	}

	.ready {
		color: var(--color-ink);
	}

	.wants {
		flex: 1 1 100%;
		color: var(--color-ink-dim);
	}

	.action {
		color: var(--color-ink-muted);
		text-decoration: underline;
	}

	.action:hover {
		color: var(--color-ink);
	}
</style>
