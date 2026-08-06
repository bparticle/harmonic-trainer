<script lang="ts">
	import '@fontsource-variable/space-grotesk';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/500.css';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { untrack } from 'svelte';
	import { page } from '$app/state';
	import AppNav from '$lib/components/AppNav.svelte';
	import { paletteToCssText } from '$lib/design/palette';
	import { midi, restoreMidi } from '$lib/midi/shared.svelte';

	let { children, data } = $props();

	// The twelve pitch colours are database-owned, so they are injected rather
	// than compiled into the stylesheet. Each swatch also carries a contrast-safe
	// ink colour computed from it, so text on a swatch is never unreadable —
	// including after the colour editor has been used.
	const paletteCss = $derived(paletteToCssText(data.settings.colorMap));

	/*
	 * MIDI is started once, here, and lives for as long as the tab does.
	 *
	 * `untrack` is load-bearing. `restoreMidi` reads `midi.status`, which made
	 * this effect depend on it — so connecting, which sets the status to
	 * `requesting`, re-ran the effect, fired its cleanup, and destroyed the
	 * connection before it could be established. Pressing "connect" appeared to
	 * do nothing at all.
	 *
	 * There is no cleanup for the same reason there is no teardown: the session
	 * is meant to outlive every page, and the only thing that ends it is closing
	 * the tab.
	 */
	$effect(() => {
		untrack(() => void restoreMidi());
	});

	// Keep a running session's clustering in step with the saved preferences.
	$effect(() => {
		midi.windowMs = data.settings.prefs.chordClusterWindowMs;
		midi.latencyOffsetMs = data.settings.prefs.midiLatencyOffsetMs;
	});

	/*
	 * Which keyboard to prefer, remembered across reloads and replugs.
	 *
	 * The name is stored rather than the id: Web MIDI ids are opaque and not
	 * stable, so an id cannot express "always use the Matriarch". Writing back
	 * happens whenever the choice changes, which is the only time it can.
	 */
	$effect(() => {
		midi.preferredName = data.settings.midiDevice;
	});

	$effect(() => {
		midi.onDeviceChosen((name) => {
			void fetch('/api/settings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ midiDevice: name })
			});
		});
		return () => midi.onDeviceChosen(null);
	});

	// The login screen is the one place without the shell.
	const bare = $derived(page.url.pathname.startsWith('/login'));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#101218" />
	{@html `<style>:root{${paletteCss}}</style>`}
</svelte:head>

{#if bare}
	{@render children()}
{:else}
	<AppNav prefs={data.settings.prefs} />
	{@render children()}
{/if}
