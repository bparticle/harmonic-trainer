<script lang="ts">
	import { page } from '$app/state';
	import './prose.css';

	/*
	 * Notes: how the app works, and the theory under it.
	 *
	 * A public reading section, reachable without an account — `isPublicRequest`
	 * in `hooks.server.ts` lets `/notes` through for GET. It sits outside the
	 * practice shell: the root layout renders these pages bare for a signed-out
	 * visitor, so this file supplies the only chrome they get — a line back to the
	 * app and to the index.
	 *
	 * Everything visual lives in `prose.css` beside this file. The palette is
	 * still injected by the root layout, so `--pc-*` is available and the one
	 * colour rule holds: hue means pitch here too.
	 */

	let { children } = $props();

	const onIndex = $derived(page.url.pathname === '/notes');
</script>

<div class="note-shell">
	<nav class="note-topbar" aria-label="Notes">
		<a href="/">← Roundel</a>
		<span class="sep" aria-hidden="true">/</span>
		{#if onIndex}
			<span class="here">Notes</span>
		{:else}
			<a href="/notes">Notes</a>
		{/if}
	</nav>

	{@render children()}
</div>
