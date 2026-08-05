<script lang="ts">
	import '@fontsource-variable/space-grotesk';
	import '@fontsource/ibm-plex-mono/400.css';
	import '@fontsource/ibm-plex-mono/500.css';
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import { paletteToCssText } from '$lib/design/palette';

	let { children, data } = $props();

	// The twelve pitch colours are database-owned, so they are injected rather
	// than compiled into the stylesheet. Each swatch also carries a contrast-safe
	// ink colour computed from it, so text on a swatch is never unreadable —
	// including after the colour editor has been used.
	const paletteCss = $derived(paletteToCssText(data.settings.colorMap));
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#101218" />
	{@html `<style>:root{${paletteCss}}</style>`}
</svelte:head>

{@render children()}
