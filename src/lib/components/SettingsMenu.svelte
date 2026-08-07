<script lang="ts">
	import { connectMidi, forgetMidi, midi } from '$lib/midi/shared.svelte';
	import type { Prefs } from '$lib/settings';

	/*
	 * The cog.
	 *
	 * Everything that used to be scattered across page headers — which keyboard,
	 * how long to hold a chord back, how long a session runs — lives here, on
	 * every screen. Device management in particular has to be reachable from
	 * anywhere: a piano switched on mid-session should not mean navigating to a
	 * specific page to be noticed.
	 */

	let { prefs }: { prefs: Prefs } = $props();

	let open = $state(false);
	let saving = $state(false);
	let saved = $state(false);
	let problem = $state<string | null>(null);

	// svelte-ignore state_referenced_locally
	let draft = $state<Prefs>({ ...prefs });

	let panel = $state<HTMLDivElement>();

	const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(prefs));

	const statusLabel = $derived.by(() => {
		if (midi.status === 'ready') {
			const device = midi.devices.find((d) => d.id === midi.selectedId);
			return device ? device.name : 'no device';
		}
		if (midi.status === 'requesting') return 'asking…';
		if (midi.status === 'idle') return 'not connected';
		return 'unavailable';
	});

	const dotColour = $derived(
		midi.status === 'ready' && midi.devices.length
			? 'var(--pc-5)'
			: midi.status === 'ready' || midi.status === 'idle'
				? 'var(--color-ink-dim)'
				: 'var(--pc-0)'
	);

	function onWindowPointerDown(event: PointerEvent) {
		if (!open) return;
		if (panel && !panel.contains(event.target as Node)) open = false;
	}

	async function save() {
		saving = true;
		problem = null;
		try {
			const response = await fetch('/api/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ prefs: draft })
			});
			if (!response.ok) throw new Error(await response.text());
			// Apply immediately to the running session rather than waiting for a reload.
			midi.windowMs = draft.chordClusterWindowMs;
			midi.latencyOffsetMs = draft.midiLatencyOffsetMs;
			saved = true;
			setTimeout(() => (saved = false), 1600);
		} catch (e) {
			problem = e instanceof Error ? e.message : 'Could not save';
		} finally {
			saving = false;
		}
	}
</script>

<svelte:window
	onpointerdown={onWindowPointerDown}
	onkeydown={(e) => e.key === 'Escape' && (open = false)}
/>

<div class="relative" bind:this={panel}>
	<button
		class="border-ground-line hover:border-ink-dim flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors"
		class:is-open={open}
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-label="Settings and MIDI"
	>
		<span class="dot" style:background={dotColour}></span>
		<span class="text-ink-muted hidden font-mono text-[0.7rem] sm:inline">{statusLabel}</span>
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" class="text-ink-muted">
			<path
				d="M8 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z M8 1.4l1 1.6a5.6 5.6 0 0 1 1.4.6l1.8-.4 1.2 2-1 1.5a5.6 5.6 0 0 1 0 1.6l1 1.5-1.2 2-1.8-.4a5.6 5.6 0 0 1-1.4.6L8 14.6l-1-1.6a5.6 5.6 0 0 1-1.4-.6l-1.8.4-1.2-2 1-1.5a5.6 5.6 0 0 1 0-1.6l-1-1.5 1.2-2 1.8.4A5.6 5.6 0 0 1 7 3l1-1.6Z"
				fill="none"
				stroke="currentColor"
				stroke-width="1.2"
				stroke-linejoin="round"
			/>
		</svg>
	</button>

	{#if open}
		<div
			class="border-ground-line bg-ground-raised absolute right-0 z-50 mt-2 w-80 rounded-xl border p-4 shadow-2xl"
			role="dialog"
			aria-label="Settings"
		>
			<section>
				<h2 class="text-ink-dim mb-2 font-mono text-[0.65rem] tracking-widest uppercase">
					Keyboard
				</h2>

				{#if midi.status === 'ready'}
					{#if midi.devices.length}
						<select
							class="border-ground-line bg-ground text-ink-muted w-full rounded border px-2 py-1.5 font-mono text-xs"
							value={midi.selectedId}
							onchange={(e) => midi.select(e.currentTarget.value)}
						>
							{#each midi.devices as device (device.id)}
								<option value={device.id}>{device.name}</option>
							{/each}
						</select>
					{:else}
						<p class="text-ink-dim font-mono text-xs">
							Connected, but nothing is plugged in. Switch the piano on and it will appear.
						</p>
					{/if}
				{:else if midi.status === 'idle'}
					<button
						class="bg-ink text-ground w-full rounded px-3 py-2 text-sm font-semibold"
						onclick={connectMidi}>Connect a keyboard</button
					>
					<p class="text-ink-dim mt-2 text-[0.7rem] leading-relaxed">
						The browser will ask permission once, then remember it.
					</p>
				{:else if midi.status === 'requesting'}
					<p class="text-ink-dim font-mono text-xs">Waiting for permission…</p>
				{:else}
					<p class="text-ink-muted text-xs leading-relaxed">{midi.unavailableReason}</p>
					{#if midi.status === 'denied'}
						<button
							class="border-ground-line hover:border-ink-dim mt-2 w-full rounded border px-3 py-1.5 font-mono text-xs transition-colors"
							onclick={connectMidi}>try again</button
						>
					{/if}
				{/if}

				{#if midi.pedalDown}
					<p class="text-ink-dim mt-2 font-mono text-[0.65rem] tracking-widest uppercase">
						pedal down
					</p>
				{/if}
			</section>

			<hr class="border-ground-line my-4" />

			<section class="flex flex-col gap-3">
				<label class="block">
					<span class="text-ink-dim mb-1 flex justify-between font-mono text-[0.7rem]">
						<span>reveal delay</span><span>{(draft.revealDelayMs / 1000).toFixed(1)}s</span>
					</span>
					<input
						type="range"
						min="0"
						max="6000"
						step="250"
						bind:value={draft.revealDelayMs}
						class="w-full"
					/>
				</label>

				<label class="block">
					<span class="text-ink-dim mb-1 flex justify-between font-mono text-[0.7rem]">
						<span>chord window</span><span>{draft.chordClusterWindowMs} ms</span>
					</span>
					<input
						type="range"
						min="30"
						max="250"
						step="10"
						bind:value={draft.chordClusterWindowMs}
						class="w-full"
					/>
				</label>

				<label class="block">
					<span class="text-ink-dim mb-1 flex justify-between font-mono text-[0.7rem]">
						<span>midi latency</span><span>{draft.midiLatencyOffsetMs} ms</span>
					</span>
					<input
						type="range"
						min="-200"
						max="200"
						step="5"
						bind:value={draft.midiLatencyOffsetMs}
						class="w-full"
					/>
				</label>

				<div>
					<span class="text-ink-dim mb-1 block font-mono text-[0.7rem]">session length</span>
					<div class="flex gap-1">
						{#each [10, 20, 35] as const as minutes (minutes)}
							<button
								class="border-ground-line hover:border-ink-dim flex-1 rounded border px-2 py-1 font-mono text-xs transition-colors"
								class:is-selected={draft.sessionLengthMinutes === minutes}
								onclick={() => (draft.sessionLengthMinutes = minutes)}>{minutes}</button
							>
						{/each}
					</div>
				</div>
			</section>

			<div class="mt-4 flex items-center gap-2">
				<button
					class="bg-ink text-ground flex-1 rounded px-3 py-2 text-sm font-semibold transition-opacity disabled:opacity-30"
					disabled={!dirty || saving}
					onclick={save}
				>
					{saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
				</button>
				<a
					href="/settings/wheel"
					class="text-ink-dim hover:text-ink px-2 font-mono text-[0.7rem] transition-colors"
					onclick={() => (open = false)}>wheel</a
				>
				<a
					href="/settings/colours"
					class="text-ink-dim hover:text-ink px-2 font-mono text-[0.7rem] transition-colors"
					onclick={() => (open = false)}>colours</a
				>
			</div>

			{#if problem}
				<p class="mt-2 font-mono text-xs" style="color: var(--pc-0)">{problem}</p>
			{/if}

			{#if midi.status === 'ready'}
				<button
					class="text-ink-dim hover:text-ink mt-3 font-mono text-[0.65rem] transition-colors"
					onclick={forgetMidi}>stop reconnecting automatically</button
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex: none;
	}

	.is-open,
	.is-selected {
		background: var(--color-ground-overlay);
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	input[type='range'] {
		accent-color: var(--color-ink-muted);
	}
</style>
