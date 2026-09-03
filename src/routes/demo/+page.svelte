<script lang="ts">
	import PlayAlong from '$lib/components/PlayAlong.svelte';
	import { connectMidi, midi } from '$lib/midi/shared.svelte';

	/*
	 * The way in.
	 *
	 * The whole play-along page, running for somebody who has not signed in and
	 * may never. No account, no password, and no database: the built-in charts
	 * are code, and the palette falls back to the defaults for any request
	 * without a session, so this route works on an instance with no Postgres
	 * behind it at all.
	 *
	 * It is the real page rather than a tour of it. A visitor can connect a
	 * keyboard and be judged on what they play, which is the one thing here that
	 * no other tool does — a demo showing the transport and the chart without the
	 * scoring would just be a worse iReal Pro, and anybody who knows the category
	 * reads it that way immediately.
	 *
	 * Nothing is saved. There is no sign-up call anywhere on this page, because
	 * there is nothing yet to sign up to: until the hosted instance exists the
	 * only honest offer is the source, and that offer is a real one.
	 */

	const REPOSITORY = 'https://github.com/bparticle/roundel';

	let { data } = $props();

	/*
	 * The demo carries its own connect button.
	 *
	 * "Connect a keyboard" normally lives in the settings menu, which hangs off
	 * the app nav — and the nav is not rendered for a signed-out visitor. Without
	 * this the demo could only ever be played with the mouse, which is a demo of
	 * the wrong product.
	 *
	 * A visitor on Safari or an iPad reaches `unavailableReason` instead, and it
	 * says why in a sentence. That is the honest thing to show somebody who has
	 * just been told the app listens to their playing.
	 */
	const connected = $derived(midi.devices.find((d) => d.id === midi.selectedId) ?? null);
	const canConnect = $derived(midi.status === 'idle' || midi.status === 'denied');
	const midiLabel = $derived.by(() => {
		if (midi.status === 'ready') {
			return connected ? connected.name : 'Connected — switch the piano on';
		}
		if (midi.status === 'requesting') return 'Waiting for permission…';
		if (midi.status === 'denied') return 'Permission refused — try again';
		return 'Connect a keyboard';
	});
</script>

<svelte:head>
	<title>Demo · Roundel</title>
	<meta
		name="description"
		content="Play along with a generated rhythm section. No account needed."
	/>
</svelte:head>

<div class="demo-bar">
	<a class="home" href="/">
		<span aria-hidden="true">←</span>
		<span>Roundel</span>
	</a>

	<p>
		<strong>Live demo</strong> · nothing saved
	</p>

	<div class="midi">
		{#if midi.unavailableReason}
			<p class="midi-note">{midi.unavailableReason}</p>
		{:else if canConnect}
			<button type="button" class="connect" onclick={connectMidi}>{midiLabel}</button>
		{:else}
			<p class="midi-note" aria-live="polite">
				<i class:live={midi.status === 'ready'} aria-hidden="true"></i>{midiLabel}
			</p>
		{/if}
	</div>

	<a class="source" href={REPOSITORY} target="_blank" rel="noreferrer">Run it yourself ↗</a>
</div>

<PlayAlong demo colorMap={data.settings.colorMap} />

<style>
	.demo-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem 1.25rem;
		padding: 0.7rem clamp(0.75rem, 3vw, 1.5rem);
		border-bottom: 1px solid var(--color-ground-line);
		background: var(--color-ground-raised);
	}
	.demo-bar p {
		flex: 1 1 18rem;
		margin: 0;
		color: var(--color-ink-muted);
		font-size: 0.8rem;
		line-height: 1.45;
	}
	.demo-bar strong {
		color: var(--color-ink);
	}
	.home,
	.source {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.45rem;
		color: var(--color-ink);
		font-size: 0.82rem;
		font-weight: 600;
		text-decoration: none;
	}
	.source {
		padding: 0 0.85rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 0.5rem;
		font-weight: 500;
	}
	.midi {
		display: flex;
		align-items: center;
	}
	.connect {
		min-height: 2.75rem;
		padding: 0 0.9rem;
		border-radius: 0.5rem;
		background: var(--color-ink);
		color: var(--color-ground);
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
	}
	.connect:hover {
		background: var(--color-ink-muted);
	}
	.midi-note {
		display: flex;
		max-width: 26rem;
		align-items: center;
		gap: 0.45rem;
		margin: 0;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.4;
	}
	.midi-note i {
		width: 0.4rem;
		height: 0.4rem;
		flex: none;
		border-radius: 50%;
		background: var(--color-ink-dim);
	}
	.midi-note i.live {
		background: var(--pc-5);
	}
	.home:hover,
	.source:hover {
		color: var(--color-ink);
		background: var(--color-ground-overlay);
	}
	.home:hover {
		background: none;
		text-decoration: underline;
		text-underline-offset: 0.3rem;
	}
</style>
