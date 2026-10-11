<script lang="ts">
	import { tick } from 'svelte';
	import { page } from '$app/state';
	import ChartEditor from '$lib/components/ChartEditor.svelte';
	import { CHART_CATEGORIES, realiseChart, type ChartCategory } from '$lib/curriculum/charts';
	import { browseSongs, type BookSort } from '$lib/curriculum/songbook';
	import { GROOVES } from '$lib/audio/groove';
	import { formatKey, parseKey } from '$lib/music/key';
	import type { SongbookEntry } from './+page.server';

	let { data, form } = $props();
	const entries = $derived(data.entries as SongbookEntry[]);
	let search = $state('');
	let category = $state<ChartCategory | 'all'>('all');
	let artist = $state('all');
	let key = $state('all');
	let groove = $state('all');
	let readyOnly = $state(false);
	let sort = $state<BookSort>('title');
	let searchInput = $state<HTMLInputElement>();
	let editorPanel = $state<HTMLElement>();
	let returnFocus: HTMLElement | null = null;
	let confirming = $state<string | null>(null);
	const categories = $derived(
		(Object.keys(CHART_CATEGORIES) as ChartCategory[]).filter((c) =>
			entries.some((entry) => entry.category === c)
		)
	);
	const artists = $derived(
		[
			...new Set(
				entries.map((entry) => entry.artist).filter((name): name is string => Boolean(name))
			)
		].sort((a, b) => a.localeCompare(b))
	);
	const grooves = $derived(
		GROOVES.filter((g) => entries.some((entry) => entry.defaultGroove === g.id))
	);
	const KEYS = ['C', 'G', 'D', 'A', 'E', 'B', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F'];
	const keysInBook = $derived(KEYS.filter((k) => entries.some((entry) => entry.defaultKey === k)));
	const keyLabel = (name: string) => formatKey(parseKey(name));
	const grooveName = (id: string) => GROOVES.find((g) => g.id === id)?.name ?? id;
	const homeKey = (entry: SongbookEntry) =>
		entry.defaultKey
			? `${keyLabel(entry.defaultKey)}${entry.mode === 'minor' ? ' minor' : ''}`
			: 'Any key';
	const shown = $derived(
		browseSongs(entries, { search, category, artist, key, groove, readyOnly, sort })
	);
	const extraCount = $derived(
		Number(artist !== 'all') + Number(key !== 'all') + Number(groove !== 'all') + Number(readyOnly)
	);
	const filtered = $derived(Boolean(search.trim()) || category !== 'all' || extraCount > 0);
	function clearFilters() {
		search = '';
		category = 'all';
		artist = key = groove = 'all';
		readyOnly = false;
	}

	type Refused = {
		problems?: string[];
		id?: string;
		name?: string;
		artist?: string;
		text?: string;
		key?: string;
		mode?: string;
		bpm?: number;
		groove?: string;
		notes?: string;
		lyrics?: string[][];
	};
	// Seed a draft once; closing it clears the server's previous refusal.
	// svelte-ignore state_referenced_locally
	let refused = $state<Refused | null>((form as Refused | null) ?? null);
	// svelte-ignore state_referenced_locally
	let editing = $state<SongbookEntry | null>(
		entries.find((entry) =>
			refused?.id ? entry.id === refused.id : entry.slug === page.url.searchParams.get('edit')
		) ?? null
	);
	// svelte-ignore state_referenced_locally
	let writing = $state(Boolean(refused) && !refused?.id);
	const open = $derived(writing || editing !== null);
	function asTyped(entry: SongbookEntry): string {
		return realiseChart(entry, entry.defaultKey ?? 'C')
			.rows.map((row) => row.map((bar) => bar.chords.map((c) => c.symbol).join(' ')).join(' | '))
			.join('\n');
	}
	const editorInitial = $derived(
		refused ??
			(editing
				? {
						name: editing.name,
						artist: editing.artist,
						text: asTyped(editing),
						key: editing.defaultKey ?? 'C',
						mode: editing.mode,
						bpm: editing.defaultBpm,
						groove: editing.defaultGroove,
						lyrics: editing.lyrics,
						notes: editing.notes === 'Yours.' ? '' : editing.notes
					}
				: null)
	);
	async function startEditing(entry: SongbookEntry | null, event: MouseEvent) {
		returnFocus = event.currentTarget as HTMLElement;
		refused = null;
		editing = entry;
		writing = !entry;
		confirming = null;
		await tick();
		editorPanel?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
		editorPanel?.scrollIntoView({ block: 'start' });
	}
	async function close() {
		writing = false;
		editing = null;
		refused = null;
		await tick();
		if (returnFocus?.isConnected) returnFocus.focus();
		else searchInput?.focus();
	}
	function focusSearch(event: KeyboardEvent) {
		if (
			open ||
			event.defaultPrevented ||
			event.altKey ||
			event.ctrlKey ||
			event.metaKey ||
			event.key !== '/'
		)
			return;
		const target = event.target;
		if (
			target instanceof HTMLElement &&
			(target.isContentEditable || target.closest('input, textarea, select, button'))
		)
			return;
		event.preventDefault();
		searchInput?.focus();
	}
</script>

<svelte:head><title>Songbook · Roundel</title></svelte:head>
<svelte:window onkeydown={focusSearch} />
<main class="songbook">
	<header class="book-header">
		<div>
			<p class="eyebrow">Your repertoire</p>
			<h1>Songbook</h1>
			<p class="intro">Find a song. Make it yours. Play.</p>
		</div>
		{#if !open}<button type="button" class="primary" onclick={(event) => startEditing(null, event)}
				><span aria-hidden="true">＋</span> Add a chart</button
			>{:else}<button type="button" class="secondary" onclick={close}>← Back to songs</button>{/if}
	</header>
	{#if open}
		<section class="editor-panel" bind:this={editorPanel} aria-label="Chart editor">
			{#if editing && !editing.id}<p class="copy-note">
					This is a built-in chart. Save your changes as a personal copy in Yours.
				</p>{/if}
			{#key editing?.slug ?? 'new'}<ChartEditor
					keys={KEYS}
					{keyLabel}
					initialKey={editing?.defaultKey ?? 'C'}
					initial={editorInitial}
					editing={editing?.id ? { id: editing.id, name: editing.name } : null}
					onCancel={close}
				/>{/key}
			{#if refused?.problems?.length}<div role="alert" class="save-error">
					<p>Couldn't save your chart</p>
					<ul>
						{#each refused.problems as problem, index (index)}<li>{problem}</li>{/each}
					</ul>
				</div>{/if}
		</section>
	{:else}
		<section class="browse" aria-label="Find songs">
			<div class="search-wrap">
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="1.5"
					aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg
				>
				<input
					bind:this={searchInput}
					type="search"
					bind:value={search}
					placeholder="Search by song, artist or notes…"
					aria-label="Search by song, artist or notes"
				/>
				{#if search}<button
						class="clear-search"
						type="button"
						onclick={() => {
							search = '';
							searchInput?.focus();
						}}
						aria-label="Clear search">×</button
					>{:else}<kbd aria-hidden="true">/</kbd>{/if}
			</div>
			<div class="browse-controls">
				<div class="categories" role="group" aria-label="Song category">
					<button type="button" aria-pressed={category === 'all'} onclick={() => (category = 'all')}
						>All songs <span>{entries.length}</span></button
					>
					{#each categories as option (option)}<button
							type="button"
							aria-pressed={category === option}
							onclick={() => (category = option)}
							>{CHART_CATEGORIES[option]}
							<span>{entries.filter((entry) => entry.category === option).length}</span></button
						>{/each}
				</div>
				<label class="sort"
					>Sort by <select bind:value={sort}
						><option value="title">Song title</option><option value="artist">Artist</option><option
							value="simplest">Simplest first</option
						><option value="tempo">Tempo</option></select
					></label
				>
			</div>
			<details class="more-filters">
				<summary
					>More filters{#if extraCount}
						<span>({extraCount} active)</span>{/if}</summary
				>
				<div class="filter-fields">
					<label
						>Artist / composer<select bind:value={artist}
							><option value="all">All artists</option>{#each artists as option (option)}<option
									value={option}>{option}</option
								>{/each}</select
						></label
					>
					<label
						>Home key<select bind:value={key}
							><option value="all">All keys</option>{#each keysInBook as option (option)}<option
									value={option}>{keyLabel(option)}</option
								>{/each}</select
						></label
					>
					<label
						>Groove<select bind:value={groove}
							><option value="all">All grooves</option>{#each grooves as option (option.id)}<option
									value={option.id}>{option.name}</option
								>{/each}</select
						></label
					>
					<label class="ready-filter"
						><input type="checkbox" bind:checked={readyOnly} /> Ready to play only</label
					>
				</div>
			</details>
		</section>
		<div class="results-summary">
			<p role="status" aria-live="polite">
				{shown.length}
				{shown.length === 1 ? 'song' : 'songs'}{#if filtered}
					of {entries.length}{/if}
			</p>
			{#if filtered}<button class="text-button" type="button" onclick={clearFilters}
					>Clear filters</button
				>{/if}
		</div>
		{#if shown.length === 0}
			<div class="empty">
				<h2>No songs found</h2>
				<p>Try another song or artist, or clear your filters to see the whole songbook.</p>
				<button type="button" class="secondary" onclick={clearFilters}>Show all songs</button>
			</div>
		{:else}
			<div class="list-heading" aria-hidden="true">
				<span>Song / artist</span><span>Key</span><span>Groove / BPM</span><span>Practice</span
				><span>Actions</span>
			</div>
			<ul class="songs">
				{#each shown as entry (entry.slug)}
					<li class="song">
						<div class="song-row">
							<div class="song-title">
								<a href={`/backing?chart=${encodeURIComponent(entry.slug)}`}>{entry.name}</a>
								<p>
									{entry.artist ||
										(entry.category === 'form' || entry.category === 'cycle'
											? 'Practice pattern'
											: 'Artist not set')}
									{#if entry.id || entry.artist !== 'Traditional'}
										<span class="source"
											>· {entry.id ? 'Yours' : CHART_CATEGORIES[entry.category]}</span
										>
									{/if}
								</p>
							</div>
							<div class="song-key">{homeKey(entry)}</div>
							<div class="song-groove">
								{grooveName(entry.defaultGroove)}<span
									>{entry.defaultBpm} BPM · {entry.bars} bars</span
								>
							</div>
							<div class="song-readiness">
								{#if entry.ready}<span>✓ Ready</span>{:else}<span class="learn">To explore</span
									>{/if}
							</div>
							<div class="song-actions">
								<button
									type="button"
									class="edit-button"
									aria-label={entry.id ? `Edit ${entry.name}` : `Edit a copy of ${entry.name}`}
									onclick={(event) => startEditing(entry, event)}
									>{entry.id ? 'Edit' : 'Edit a copy'}</button
								><a
									class="play-button"
									href={`/backing?chart=${encodeURIComponent(entry.slug)}`}
									aria-label={`Play ${entry.name}`}>Play <span aria-hidden="true">→</span></a
								>
							</div>
						</div>
						<details class="song-details">
							<summary>Chart details</summary>
							<div class="detail-content">
								<p>{entry.notes === 'Yours.' ? 'Your personal chart.' : entry.notes}</p>
								{#if entry.wants.length}<p>
										Chords to explore: {entry.wants.join(', ')}. You can play this song now.
									</p>{/if}{#if entry.published}<p>Published {entry.published}.</p>{/if}
								{#if entry.id}{#if confirming === entry.id}<form
											method="POST"
											action="?/remove"
											class="delete-confirm"
										>
											<input type="hidden" name="id" value={entry.id} /><span
												>Delete this chart?</span
											><button class="secondary" type="submit">Delete chart</button><button
												type="button"
												class="text-button"
												onclick={() => (confirming = null)}>Keep chart</button
											>
										</form>{:else}<button
											type="button"
											class="text-button"
											onclick={() => (confirming = entry.id ?? null)}>Delete chart…</button
										>{/if}{/if}
							</div>
						</details>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</main>

<style>
	.songbook {
		max-width: 1320px;
		margin: 0 auto;
		padding: clamp(1.25rem, 4vw, 3rem) clamp(1rem, 3vw, 2.5rem) 4rem;
	}
	.book-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
		margin-bottom: 2rem;
	}
	.eyebrow {
		color: var(--color-ink-dim);
		font: 0.7rem var(--font-mono);
		letter-spacing: 0.1em;
		text-transform: uppercase;
		margin-bottom: 0.4rem;
	}
	h1 {
		font-size: clamp(2rem, 4vw, 3rem);
		font-weight: 600;
		letter-spacing: -0.045em;
		line-height: 1.1;
	}
	.intro {
		color: var(--color-ink-muted);
		font-size: 0.9rem;
		margin-top: 0.65rem;
	}
	button,
	summary {
		cursor: pointer;
	}
	.primary,
	.secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		min-height: 44px;
		border-radius: 0.4rem;
		padding: 0.65rem 1rem;
		font-size: 0.85rem;
		font-weight: 600;
	}
	.primary {
		background: var(--color-ink);
		color: var(--color-ground);
	}
	.primary:hover {
		background: var(--color-ink-muted);
	}
	.secondary {
		border: 1px solid var(--color-ground-line);
		color: var(--color-ink);
	}
	.secondary:hover {
		background: var(--color-ground-raised);
	}
	.browse {
		border-bottom: 1px solid var(--color-ground-line);
	}
	.search-wrap {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		padding: 0.55rem 1rem;
		background: var(--color-ground-raised);
		border: 1px solid var(--color-ground-line);
		border-radius: 0.5rem;
	}
	.search-wrap:focus-within {
		border-color: var(--color-ink-muted);
		outline: 2px solid var(--color-ink);
		outline-offset: 3px;
	}
	.search-wrap svg {
		width: 22px;
		height: 22px;
		flex-shrink: 0;
		color: var(--color-ink-muted);
	}
	.search-wrap input {
		width: 100%;
		min-width: 0;
		min-height: 40px;
		background: transparent;
		font-size: 1rem;
		color: var(--color-ink);
	}
	.search-wrap input:focus-visible {
		outline: none;
	}
	.search-wrap input::placeholder {
		color: var(--color-ink-dim);
	}
	.search-wrap input::-webkit-search-cancel-button {
		display: none;
	}
	kbd {
		border: 1px solid var(--color-ground-line);
		border-radius: 0.2rem;
		padding: 0.05rem 0.45rem;
		color: var(--color-ink-dim);
		font-size: 0.8rem;
	}
	.clear-search {
		min-width: 40px;
		min-height: 40px;
		font-size: 1.5rem;
		color: var(--color-ink-muted);
	}
	.browse-controls {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 0.75rem 1.5rem;
		margin-top: 1.25rem;
	}
	.categories {
		display: flex;
		flex-wrap: wrap;
		gap: 0.1rem 1rem;
	}
	.categories button {
		min-height: 44px;
		border-bottom: 2px solid transparent;
		color: var(--color-ink-muted);
		font-size: 0.85rem;
		padding: 0.6rem 0;
	}
	.categories button[aria-pressed='true'] {
		color: var(--color-ink);
		border-bottom-color: var(--color-ink);
	}
	.categories button:hover {
		color: var(--color-ink);
	}
	.categories span {
		margin-left: 0.2rem;
		font: 0.65rem var(--font-mono);
		color: var(--color-ink-dim);
	}
	.sort {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: var(--color-ink-dim);
	}
	select {
		min-height: 44px;
		color: var(--color-ink);
		border: 1px solid var(--color-ground-line);
		border-radius: 0.3rem;
		background: var(--color-ground-raised);
		padding: 0.45rem 0.6rem;
		font-size: 0.8rem;
		max-width: 100%;
	}
	.more-filters {
		padding: 0.65rem 0;
	}
	.more-filters summary {
		width: fit-content;
		padding: 0.35rem 0;
		color: var(--color-ink-muted);
		font-size: 0.75rem;
	}
	.filter-fields {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		padding: 0.7rem 0 0.5rem;
	}
	.filter-fields label {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		font-size: 0.75rem;
		color: var(--color-ink-muted);
		flex: 1 1 150px;
		min-width: 0;
	}
	.filter-fields .ready-filter {
		flex-direction: row;
		align-items: center;
		min-height: 44px;
		align-self: end;
	}
	.ready-filter input {
		width: 18px;
		height: 18px;
		accent-color: var(--color-ink);
	}
	.results-summary {
		display: flex;
		justify-content: space-between;
		align-items: center;
		min-height: 54px;
		gap: 1rem;
		font: 0.7rem var(--font-mono);
		color: var(--color-ink-dim);
	}
	.text-button {
		min-height: 44px;
		color: var(--color-ink-muted);
		text-decoration: underline;
		font-size: 0.75rem;
	}
	.text-button:hover {
		color: var(--color-ink);
	}
	.list-heading,
	.song-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 100px 145px 105px 180px;
		gap: 1rem;
		align-items: center;
	}
	.list-heading {
		padding: 0.65rem 0.75rem;
		border-bottom: 1px solid var(--color-ground-line);
		font: 0.65rem var(--font-mono);
		color: var(--color-ink-dim);
	}
	.list-heading span:last-child {
		text-align: right;
	}
	.song {
		border-bottom: 1px solid var(--color-ground-line);
		padding: 0.8rem 0.75rem 0.2rem;
	}
	.song:hover,
	.song:focus-within {
		background: color-mix(in oklab, var(--color-ground-raised) 60%, transparent);
	}
	.song-title {
		min-width: 0;
	}
	.song-title a {
		display: inline-block;
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}
	.song-title a:hover {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
	.song-title p {
		margin-top: 0.25rem;
		color: var(--color-ink-muted);
		font-size: 0.75rem;
		overflow-wrap: anywhere;
	}
	.source,
	.learn {
		color: var(--color-ink-dim);
	}
	.song-key,
	.song-groove {
		font-size: 0.8rem;
		color: var(--color-ink-muted);
	}
	.song-groove span {
		display: block;
		margin-top: 0.2rem;
		font: 0.65rem var(--font-mono);
		color: var(--color-ink-dim);
	}
	.song-readiness {
		font-size: 0.75rem;
	}
	.song-actions {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
	}
	.edit-button,
	.play-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-height: 44px;
		border-radius: 0.3rem;
		font-size: 0.75rem;
		white-space: nowrap;
	}
	.edit-button {
		color: var(--color-ink-muted);
		padding: 0.4rem 0.5rem;
	}
	.edit-button:hover {
		color: var(--color-ink);
		background: var(--color-ground-overlay);
	}
	.play-button {
		border: 1px solid var(--color-ground-line);
		color: var(--color-ink);
		padding: 0.4rem 0.75rem;
	}
	.play-button:hover {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
	}
	.song-details summary {
		width: fit-content;
		color: var(--color-ink-dim);
		font-size: 0.68rem;
		padding: 0.45rem 0;
	}
	.song-details summary:hover {
		color: var(--color-ink-muted);
	}
	.detail-content {
		padding: 0.5rem 0 0.75rem;
		max-width: 780px;
		font-size: 0.85rem;
		color: var(--color-ink-muted);
		line-height: 1.6;
	}
	.detail-content p + p {
		margin-top: 0.5rem;
	}
	.delete-confirm {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
		margin-top: 0.5rem;
	}
	.empty {
		padding: 3.5rem 0;
		max-width: 460px;
	}
	.empty h2 {
		font-size: 1.35rem;
		font-weight: 600;
	}
	.empty p {
		color: var(--color-ink-muted);
		margin: 0.65rem 0 1.25rem;
		line-height: 1.6;
	}
	.editor-panel {
		scroll-margin-top: 1rem;
		border-top: 1px solid var(--color-ground-line);
		padding-top: 1.5rem;
	}
	.copy-note {
		color: var(--color-ink-muted);
		font-size: 0.85rem;
		padding-bottom: 1.25rem;
	}
	.save-error {
		margin-top: 1rem;
		border: 1px solid var(--color-ground-line);
		padding: 1rem;
		font-size: 0.85rem;
	}
	@media (max-width: 1050px) {
		.list-heading,
		.song-row {
			grid-template-columns: minmax(0, 1fr) 85px 125px 175px;
		}
		.list-heading span:nth-child(4) {
			display: none;
		}
		.song-readiness {
			grid-column: 1;
			font-size: 0.68rem;
		}
		.song-actions {
			grid-column: 4;
			grid-row: 1;
		}
	}
	@media (max-width: 700px) {
		.book-header {
			align-items: flex-start;
		}
		.primary,
		.secondary {
			font-size: 0.75rem;
			padding: 0.6rem 0.75rem;
		}
		.intro {
			max-width: 180px;
			font-size: 0.8rem;
		}
		.search-wrap {
			gap: 0.5rem;
			padding: 0.45rem 0.65rem;
		}
		.search-wrap input {
			font-size: 0.85rem;
		}
		kbd {
			display: none;
		}
		.categories {
			gap: 0.05rem 0.85rem;
		}
		.sort {
			margin-top: 0.25rem;
		}
		.list-heading {
			display: none;
		}
		.song {
			padding: 1rem 0 0.35rem;
		}
		.song-row {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 0.5rem 1rem;
		}
		.song-title {
			grid-column: 1 / -1;
		}
		.song-key {
			grid-column: 1;
			grid-row: 2;
		}
		.song-groove {
			grid-column: 1;
			grid-row: 3;
			font-size: 0.75rem;
		}
		.song-groove span {
			display: inline;
			margin-left: 0.6rem;
		}
		.song-readiness {
			grid-column: 1;
			grid-row: 4;
		}
		.song-actions {
			grid-column: 2;
			grid-row: 2 / 5;
			gap: 0.25rem;
		}
		.edit-button {
			padding: 0.4rem;
		}
	}
	@media (max-width: 380px) {
		.song-actions {
			flex-direction: column-reverse;
		}
		.song-groove span {
			display: block;
			margin-left: 0;
		}
	}
</style>
