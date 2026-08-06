<script lang="ts">
	import '@fontsource-variable/space-grotesk';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/500.css';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
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
	 * It used to be created per page, so every navigation dropped the connection
	 * and pages without a drill felt dead. Owning it at the root means the piano
	 * is simply live, everywhere, all the time.
	 */
	$effect(() => {
		void restoreMidi();
		return () => midi.destroy();
	});

	// Keep a running session's clustering in step with the saved preferences.
	$effect(() => {
		midi.windowMs = data.settings.prefs.chordClusterWindowMs;
		midi.latencyOffsetMs = data.settings.prefs.midiLatencyOffsetMs;
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
