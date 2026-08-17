<script lang="ts">
	import { pitchClass } from '$lib/music/note';
	import { playProgression, stopAll } from '$lib/audio/engine';
	import {
		BARS_PER_ROW,
		draftVoicings,
		emptyBar,
		emptyGrid,
		looksLikeChart,
		parseIntoGrid,
		readGrid,
		type Grid
	} from '$lib/curriculum/editor';

	/*
	 * Writing a chart down.
	 *
	 * The text box this replaces asked you to type pipe characters, choose a key
	 * whose consequences were invisible, and find out afterwards which lines it
	 * had not understood. Every one of those is the same problem — the checking
	 * happened after the committing — so all of it moved to the keystroke.
	 *
	 * A bar is a cell. Under each cell sits the numeral it will be stored as,
	 * which is the only honest way to show what the written key is doing: change
	 * the key and the numerals move where you can watch them. Under the grid sits
	 * what comes back out again, because storing a chart is a round trip and it
	 * is not lossless for every symbol anyone can write.
	 *
	 * A component rather than a page, deliberately. Songwriting mode is the same
	 * grid with nothing in it.
	 */

	type Props = {
		keys: string[];
		keyLabel: (k: string) => string;
		initialKey?: string;
		/** Submitted values kept across a failed save. */
		initial?: { name?: string; text?: string; key?: string; mode?: string; bpm?: number } | null;
		onCancel: () => void;
	};

	let { keys, keyLabel, initialKey = 'C', initial = null, onCancel }: Props = $props();

	/*
	 * The props seed the fields and then let go of them. A refused save comes
	 * back with what was typed so nothing is lost, but from the first keystroke
	 * afterwards the editor owns its own state — a form that kept re-reading the
	 * server's copy would fight the person typing into it.
	 */
	// svelte-ignore state_referenced_locally
	let name = $state(initial?.name ?? '');
	// svelte-ignore state_referenced_locally
	let writtenKey = $state(initial?.key ?? initialKey);
	// svelte-ignore state_referenced_locally
	let mode = $state<'major' | 'minor'>(initial?.mode === 'minor' ? 'minor' : 'major');
	// svelte-ignore state_referenced_locally
	let bpm = $state(initial?.bpm ?? 140);
	let notes = $state('');
	// svelte-ignore state_referenced_locally
	let grid = $state<Grid>(initial?.text ? parseIntoGrid(initial.text) : emptyGrid());
	let hearing = $state(false);

	const reading = $derived(readGrid(grid, writtenKey));
	/** The chords as typed, which is what the server is sent. */
	const source = $derived(grid.map((row) => row.map((bar) => bar.text)));

	/*
	 * Pasting a chart in still works, because it is how a tune arrives from an
	 * email or a transcription and how anyone who touch-types would rather work.
	 * It fills the grid instead of being the grid: paste, then fix what is wrong
	 * where you can see it.
	 */
	function onPaste(event: ClipboardEvent, r: number, c: number) {
		const text = event.clipboardData?.getData('text') ?? '';
		if (!looksLikeChart(text)) return;

		event.preventDefault();
		const pasted = parseIntoGrid(text);
		// Pasting into the first cell replaces the chart; anywhere else, only the
		// row you are standing in, so one line can be re-pasted without losing the
		// rest of the form.
		if (r === 0 && c === 0) grid = pasted;
		else grid = [...grid.slice(0, r), ...pasted, ...grid.slice(r + 1)];
	}

	const addRow = () => (grid = [...grid, Array.from({ length: BARS_PER_ROW }, emptyBar)]);

	const addBar = (r: number) =>
		(grid = grid.map((row, i) => (i === r ? [...row, emptyBar()] : row)));

	const removeRow = (r: number) =>
		(grid = grid.length > 1 ? grid.filter((_, i) => i !== r) : [emptyGrid(1)[0]]);

	async function hear() {
		if (hearing) {
			await stopAll();
			hearing = false;
			return;
		}
		const voicings = draftVoicings(reading);
		if (voicings.length === 0) return;

		hearing = true;
		try {
			await playProgression(voicings, 60 / bpm);
		} finally {
			hearing = false;
		}
	}

	/** The tint a bar wears, from the root of its first chord. */
	const tintOf = (r: number, c: number): number | null => {
		const chord = reading.rows[r]?.[c]?.chords[0]?.chord;
		return chord ? pitchClass(chord.root) : null;
	};
</script>

<form method="POST" action="?/create" class="editor">
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="panel-title">Add a chart</h2>
		<p class="hint">Stored as numerals, so typing it in once gives you all twelve keys.</p>
	</div>

	<div class="head">
		<label class="field-wrap grow">
			<span class="field-label">Chart name</span>
			<input bind:value={name} name="name" required class="field w-full" />
		</label>
		<label class="field-wrap">
			<span class="field-label">Written key</span>
			<select bind:value={writtenKey} name="key" class="field">
				{#each keys as k (k)}
					<option value={k}>{keyLabel(k)}</option>
				{/each}
			</select>
		</label>
		<label class="field-wrap">
			<span class="field-label">Mode</span>
			<select bind:value={mode} name="mode" class="field">
				<option value="major">major</option>
				<option value="minor">minor</option>
			</select>
		</label>
		<label class="field-wrap">
			<span class="field-label">Tempo</span>
			<input bind:value={bpm} name="bpm" type="number" min="40" max="300" class="field w-20" />
		</label>
	</div>

	<p class="hint">
		The key you say it is written in decides every numeral below. Change it and watch them move — if
		they stop making sense, the key is wrong.
	</p>

	<div class="grid-wrap">
		{#each grid as row, r (r)}
			<div class="row">
				{#each row as bar, c (c)}
					{@const cell = reading.rows[r]?.[c]}
					{@const tint = tintOf(r, c)}
					<div
						class="cell"
						class:is-empty={cell?.empty}
						class:has-problem={Boolean(cell?.problem) || cell?.chords.some((ch) => ch.problem)}
						style:--tint={tint === null ? 'var(--color-ground-line)' : `var(--pc-${tint})`}
					>
						<input
							bind:value={bar.text}
							onpaste={(e) => onPaste(e, r, c)}
							class="cell-input"
							placeholder="—"
							aria-label={cell?.number ? `Bar ${cell.number}` : `Row ${r + 1}, bar ${c + 1}`}
						/>
						<span class="cell-numeral">
							{#if cell?.empty}
								&nbsp;
							{:else}
								{cell?.chords.map((ch) => ch.numeral ?? '?').join(' ')}
							{/if}
						</span>
						{#if cell && !cell.empty && cell.chords.some((ch) => ch.read !== ch.written)}
							<span class="cell-read">
								reads as {cell.chords.map((ch) => ch.read ?? '?').join(' ')}
							</span>
						{/if}
					</div>
				{/each}
				<div class="row-tools">
					<button type="button" class="tool" onclick={() => addBar(r)} title="Add a bar to this row"
						>+bar</button
					>
					<button type="button" class="tool" onclick={() => removeRow(r)} title="Remove this row"
						>−row</button
					>
				</div>
			</div>
		{/each}
	</div>

	<div class="flex flex-wrap items-center gap-2">
		<button type="button" class="chip" onclick={addRow}>+ row</button>
		<span class="count">{reading.bars} bars</span>
	</div>

	{#if reading.problems.length}
		<div role="alert" class="report is-bad">
			<p class="report-title">Fix these before saving:</p>
			<ul>
				{#each reading.problems as problem (problem)}
					<li>{problem}</li>
				{/each}
			</ul>
		</div>
	{:else if reading.drift.length}
		<div role="alert" class="report is-bad">
			<p class="report-title">
				These bars come back as a different chord, so the app would play the one on the right:
			</p>
			<ul>
				{#each reading.drift as bar (bar.bar)}
					<li>bar {bar.bar}: {bar.written} → {bar.playback}</li>
				{/each}
			</ul>
			<p class="report-note">Write the chord another way, or leave it out.</p>
		</div>
	{:else if reading.bars > 0}
		<p class="report is-good" role="status">
			All {reading.bars} bars come back exactly as written.
		</p>
	{/if}

	<label class="field-wrap">
		<span class="field-label"
			>Notes <span class="text-ink-dim">— what it is for practising</span></span
		>
		<input bind:value={notes} name="notes" class="field w-full" placeholder="Yours." />
	</label>

	<!--
		The chords as typed, not the numerals derived from them. The server runs
		the same `readGrid` over this text and works the numerals out itself: a
		browser is not the authority on what a chord means, and deriving it twice
		from one source is what keeps the screen and the database honest about
		each other.
	-->
	<input type="hidden" name="grid" value={JSON.stringify(source)} />

	<div class="flex flex-wrap items-center gap-2">
		<button type="submit" class="chip is-on" disabled={!reading.ok}>Save chart</button>
		<button type="button" class="chip" onclick={hear} disabled={reading.bars === 0}>
			{hearing ? 'Stop' : 'Hear it'}
		</button>
		<button type="button" class="chip" onclick={onCancel}>Cancel</button>
	</div>
</form>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
		margin-bottom: 1.25rem;
		padding: 1rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 12px;
		background: var(--color-ground-raised);
	}

	.panel-title {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-ink-dim);
	}

	.hint {
		font-size: 0.72rem;
		line-height: 1.5;
		color: var(--color-ink-dim);
	}

	.head {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.field-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.field-label {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-dim);
	}

	.field {
		padding: 0.45rem 0.6rem;
		border-radius: 8px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground);
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.field:focus-visible {
		outline: 2px solid var(--color-ink);
		outline-offset: 2px;
	}

	.grid-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.row {
		display: flex;
		align-items: stretch;
		gap: 0.4rem;
	}

	/*
	 * A bar wears the colour of its root, exactly as it does on the chart itself.
	 * Nothing new is invented here — the tint is the same information, arriving
	 * while you type rather than after you save.
	 */
	.cell {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		padding: 0.4rem 0.5rem 0.3rem;
		border: 1px solid var(--color-ground-line);
		border-left: 3px solid var(--tint);
		border-radius: 8px;
		background: var(--color-ground);
	}

	.cell.is-empty {
		border-left-color: var(--color-ground-line);
		background: transparent;
	}

	.cell.has-problem {
		border-color: var(--color-ink-dim);
	}

	.cell-input {
		width: 100%;
		background: transparent;
		border: 0;
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 0.9rem;
	}

	.cell-input:focus {
		outline: none;
	}

	.cell-input:focus-visible {
		outline: 2px solid var(--color-ink);
		outline-offset: 3px;
		border-radius: 3px;
	}

	.cell-numeral {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--tint);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.cell-read {
		font-family: var(--font-mono);
		font-size: 0.62rem;
		color: var(--color-ink-dim);
	}

	.row-tools {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 0.2rem;
	}

	.tool,
	.chip {
		padding: 0.25rem 0.5rem;
		border-radius: 7px;
		border: 1px solid var(--color-ground-line);
		background: var(--color-ground-raised);
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

	.chip {
		padding: 0.35rem 0.7rem;
		font-size: 0.74rem;
	}

	.tool:hover,
	.chip:hover:not(:disabled) {
		color: var(--color-ink);
		border-color: var(--color-ink-dim);
	}

	.chip.is-on {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.chip:disabled {
		opacity: 0.4;
	}

	.count {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-ink-dim);
	}

	.report {
		padding: 0.6rem 0.75rem;
		border-radius: 8px;
		border: 1px solid var(--color-ground-line);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.6;
	}

	/*
	 * Nothing goes red. The chart page has never used colour to tell anyone off,
	 * and a chord you typed wrong while writing a tune down is not a mistake in
	 * playing — it is a sentence still being written.
	 */
	.report.is-bad {
		color: var(--color-ink-muted);
		border-color: var(--color-ink-dim);
	}

	.report.is-good {
		color: var(--color-ink-dim);
	}

	.report-title {
		color: var(--color-ink);
		margin-bottom: 0.2rem;
	}

	.report-note {
		margin-top: 0.3rem;
		color: var(--color-ink-dim);
	}
</style>
