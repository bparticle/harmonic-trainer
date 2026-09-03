<script lang="ts">
	import { connectMidi, forgetMidi, midi } from '$lib/midi/shared.svelte';
	import type { Prefs } from '$lib/settings';
	import InfoHint from './InfoHint.svelte';
	import UserAvatar from './UserAvatar.svelte';

	/*
	 * The signed-in player's identity control.
	 *
	 * The trigger belongs to the account; the panel then makes the practice
	 * profile and account settings obvious before exposing the shared controls.
	 * Device management still has to be reachable from anywhere: a piano switched
	 * on mid-session should not mean navigating to a specific page to be noticed.
	 */

	let {
		prefs,
		user,
		ontour
	}: { prefs: Prefs; user?: { name: string } | null; ontour?: () => void } = $props();
	const accountName = $derived(user?.name.trim() || 'Account');

	let open = $state(false);
	let saving = $state(false);
	let saved = $state(false);
	let problem = $state<string | null>(null);

	// svelte-ignore state_referenced_locally
	let draft = $state<Prefs>({ ...prefs });
	// svelte-ignore state_referenced_locally
	let baseline = $state<Prefs>({ ...prefs });
	// `prefs` is re-fetched (e.g. after onboarding writes tuned defaults via
	// invalidateAll) while this menu stays mounted in the persistent nav, so
	// draft/baseline must resync whenever the prop itself changes — otherwise
	// saving here silently overwrites the newer server value with the value
	// this component saw when it first mounted.
	// svelte-ignore state_referenced_locally
	let syncedPrefs = prefs;
	$effect(() => {
		if (prefs === syncedPrefs) return;
		syncedPrefs = prefs;
		draft = { ...prefs };
		baseline = { ...prefs };
	});

	let panel = $state<HTMLDivElement>();

	const dirty = $derived(JSON.stringify(draft) !== JSON.stringify(baseline));

	const statusLabel = $derived.by(() => {
		if (midi.status === 'ready') {
			const device = midi.devices.find((d) => d.id === midi.selectedId);
			return device ? device.name : 'no device';
		}
		if (midi.status === 'requesting') return 'permission…';
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
			baseline = { ...draft };
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
		type="button"
		class="account-trigger"
		class:is-open={open}
		onclick={() => (open = !open)}
		aria-expanded={open}
		aria-haspopup="dialog"
		aria-label={`${accountName}: profile, account and settings`}
	>
		<UserAvatar name={accountName} size={30} />
		<span class="account-copy">
			<strong>{accountName}</strong>
			<small>profile & settings</small>
		</span>
		<svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" class="chevron">
			<path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5" />
		</svg>
	</button>

	{#if open}
		<div
			class="border-ground-line bg-ground-raised absolute right-0 z-50 mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-xl border p-4 shadow-2xl"
			role="dialog"
			aria-label={`${accountName} account and settings`}
		>
			<section class="identity">
				<UserAvatar name={accountName} size={48} />
				<div class="min-w-0">
					<p>Signed in as</p>
					<h2>{accountName}</h2>
				</div>
			</section>

			<nav class="account-routes" aria-label="Account">
				<a href="/profile" onclick={() => (open = false)}>
					<span>
						<strong>Practice profile</strong>
						<small>Progress, keys and recent playing</small>
					</span>
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
						<path d="M3 8h9M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" />
					</svg>
				</a>
				<a href="/account" onclick={() => (open = false)}>
					<span>
						<strong>Account & password</strong>
						<small>Security and sign out</small>
					</span>
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
						<path d="M3 8h9M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" />
					</svg>
				</a>
				<button
					type="button"
					onclick={() => {
						open = false;
						ontour?.();
					}}
				>
					<span>
						<strong>Show me around</strong>
						<small>Replay the interactive tour</small>
					</span>
					<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
						<path d="M3 8h9M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" />
					</svg>
				</button>
			</nav>

			<hr class="border-ground-line my-4" />

			<section>
				<div class="mb-2 flex items-center justify-between gap-3">
					<h2 class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">Keyboard</h2>
					<p class="keyboard-status">
						<span class="dot" style:background={dotColour}></span>{statusLabel}
					</p>
				</div>

				{#if midi.status === 'ready'}
					{#if midi.devices.length}
						<label class="block">
							<span class="sr-only">MIDI input</span>
							<select
								class="border-ground-line bg-ground text-ink-muted w-full rounded border px-2 py-1.5 font-mono text-xs"
								value={midi.selectedId}
								onchange={(e) => midi.select(e.currentTarget.value)}
							>
								{#each midi.devices as device (device.id)}
									<option value={device.id}>{device.name}</option>
								{/each}
							</select>
						</label>
					{:else}
						<p class="text-ink-dim font-mono text-xs">No keyboard found. Switch it on.</p>
					{/if}
				{:else if midi.status === 'idle'}
					<button
						class="bg-ink text-ground w-full rounded px-3 py-2 text-sm font-semibold"
						onclick={connectMidi}>Connect a keyboard</button
					>
				{:else if midi.status === 'requesting'}
					<p class="text-ink-dim font-mono text-xs">Waiting for permission…</p>
				{:else}
					<p class="text-ink-muted text-xs leading-relaxed">{midi.unavailableReason}</p>
					{#if midi.status === 'denied'}
						<button
							class="border-ground-line hover:border-ink-dim mt-2 w-full rounded border px-3 py-1.5 font-mono text-xs transition-colors"
							onclick={connectMidi}>Try again</button
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
				<div class="block">
					<span class="text-ink-dim mb-1 flex justify-between font-mono text-[0.7rem]">
						<span class="flex items-center gap-1.5">
							<label for="settings-reveal-delay">Reveal delay</label>
							<InfoHint
								label="About reveal delay"
								text="Time to name a chord before the answer appears."
							/>
						</span>
						<span>{(draft.revealDelayMs / 1000).toFixed(1)}s</span>
					</span>
					<input
						id="settings-reveal-delay"
						type="range"
						min="0"
						max="6000"
						step="250"
						bind:value={draft.revealDelayMs}
						class="w-full"
					/>
				</div>

				<div class="block">
					<span class="text-ink-dim mb-1 flex justify-between font-mono text-[0.7rem]">
						<span class="flex items-center gap-1.5">
							<label for="settings-chord-window">Chord window</label>
							<InfoHint
								label="About chord window"
								text="How close notes must land to count as one chord."
							/>
						</span>
						<span>{draft.chordClusterWindowMs} ms</span>
					</span>
					<input
						id="settings-chord-window"
						type="range"
						min="30"
						max="250"
						step="10"
						bind:value={draft.chordClusterWindowMs}
						class="w-full"
					/>
				</div>

				<div class="block">
					<span class="text-ink-dim mb-1 flex justify-between font-mono text-[0.7rem]">
						<span class="flex items-center gap-1.5">
							<label for="settings-midi-latency">MIDI latency</label>
							<InfoHint label="About MIDI latency" text="Offsets timing from a delayed device." />
						</span>
						<span>{draft.midiLatencyOffsetMs} ms</span>
					</span>
					<input
						id="settings-midi-latency"
						type="range"
						min="-200"
						max="200"
						step="5"
						bind:value={draft.midiLatencyOffsetMs}
						class="w-full"
					/>
				</div>

				<div>
					<span class="text-ink-dim mb-1 block font-mono text-[0.7rem]">Default workout</span>
					<div class="flex gap-1">
						{#each [[10, 'short'], [20, 'standard'], [35, 'long']] as const as [minutes, label] (minutes)}
							<button
								class="border-ground-line hover:border-ink-dim flex-1 rounded border px-2 py-1 font-mono text-xs transition-colors"
								class:is-selected={draft.sessionLengthMinutes === minutes}
								onclick={() => (draft.sessionLengthMinutes = minutes)}>{label}</button
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
					onclick={() => (open = false)}>Wheel</a
				>
				<a
					href="/settings/colours"
					class="text-ink-dim hover:text-ink px-2 font-mono text-[0.7rem] transition-colors"
					onclick={() => (open = false)}>Colours</a
				>
			</div>

			{#if problem}
				<p class="mt-2 font-mono text-xs" style="color: var(--pc-0)">{problem}</p>
			{/if}

			{#if midi.status === 'ready'}
				<button
					class="text-ink-dim hover:text-ink mt-3 font-mono text-[0.65rem] transition-colors"
					onclick={forgetMidi}>Forget keyboard</button
				>
			{/if}
		</div>
	{/if}
</div>

<style>
	.account-trigger {
		display: flex;
		min-height: 42px;
		align-items: center;
		gap: 0.55rem;
		padding: 0.3rem 0.55rem 0.3rem 0.35rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 10px;
		background: var(--color-ground-raised);
		color: var(--color-ink-muted);
		transition:
			border-color 150ms ease,
			background 150ms ease,
			color 150ms ease;
	}

	.account-copy {
		display: flex;
		min-width: 0;
		flex-direction: column;
		align-items: flex-start;
		line-height: 1.05;
	}

	.account-copy strong {
		max-width: 5.5rem;
		overflow: hidden;
		color: var(--color-ink);
		font-size: 0.78rem;
		font-weight: 600;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.account-copy small {
		display: none;
		margin-top: 0.22rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.56rem;
		letter-spacing: 0.025em;
	}

	.chevron {
		flex: none;
		color: var(--color-ink-dim);
		transition: transform 160ms var(--ease-wheel);
	}

	.account-trigger.is-open .chevron {
		transform: rotate(180deg);
	}

	.identity {
		display: flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.15rem 0 0.85rem;
	}

	.identity p {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.61rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.identity h2 {
		overflow: hidden;
		margin-top: 0.15rem;
		color: var(--color-ink);
		font-size: 1.18rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.account-routes {
		display: grid;
		gap: 0.35rem;
	}

	.account-routes a,
	.account-routes button {
		display: flex;
		min-height: 52px;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.55rem 0.65rem;
		border-radius: 7px;
		color: var(--color-ink-muted);
		text-align: left;
		transition:
			background 140ms ease,
			color 140ms ease;
	}

	.account-routes a:first-child {
		background: var(--color-ground-overlay);
		color: var(--color-ink);
	}

	.account-routes span {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}

	.account-routes strong {
		font-size: 0.78rem;
		font-weight: 600;
	}

	.account-routes small {
		margin-top: 0.12rem;
		color: var(--color-ink-dim);
		font-size: 0.68rem;
	}

	.account-routes svg {
		flex: none;
	}

	.keyboard-status {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.62rem;
	}

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

	@media (hover: hover) {
		.account-trigger:hover {
			border-color: var(--color-ink-dim);
			background: var(--color-ground-overlay);
			color: var(--color-ink);
		}

		.account-routes a:hover,
		.account-routes button:hover {
			background: var(--color-ground-overlay);
			color: var(--color-ink);
		}
	}

	@media (min-width: 48rem) {
		.account-copy strong {
			max-width: 9rem;
		}

		.account-copy small {
			display: block;
		}
	}

	@media (pointer: coarse) {
		.account-trigger {
			min-height: 44px;
		}
	}
</style>
