<script lang="ts">
	import { page } from '$app/state';
	import LiveNotes from './LiveNotes.svelte';
	import SettingsMenu from './SettingsMenu.svelte';
	import type { Key } from '$lib/music/key';
	import type { Prefs } from '$lib/settings';

	/*
	 * One header, everywhere.
	 *
	 * The same three destinations in the same order on every screen, with the
	 * current one marked. Pages used to carry their own headers with different
	 * links in different places, which made moving around feel like moving
	 * between separate tools rather than around one.
	 *
	 * Contrast is deliberate: the old links sat at the dimmest ink in the
	 * palette, which is fine for a caption and not fine for the only navigation
	 * in the app.
	 */

	let { prefs, context }: { prefs: Prefs; context?: Key } = $props();

	const LINKS = [
		{ href: '/', label: 'Today' },
		{ href: '/play', label: 'Play' },
		{ href: '/backing', label: 'Play along' },
		{ href: '/explore', label: 'Explore' }
	];

	const isCurrent = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<header class="border-ground-line bg-ground/90 sticky top-0 z-40 border-b backdrop-blur">
	<div class="mx-auto flex h-14 max-w-[1500px] items-center gap-5 px-5">
		<a href="/" class="font-display text-ink text-base font-semibold tracking-tight">Harmonic</a>

		<nav class="flex items-center gap-1" aria-label="Main">
			{#each LINKS as link (link.href)}
				<a
					href={link.href}
					class="nav-link"
					class:is-current={isCurrent(link.href)}
					aria-current={isCurrent(link.href) ? 'page' : undefined}>{link.label}</a
				>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-3">
			<LiveNotes {context} />
			<SettingsMenu {prefs} />
		</div>
	</div>
</header>

<style>
	.nav-link {
		padding: 0.35rem 0.7rem;
		border-radius: 7px;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.02em;
		/* Readable at rest, not merely present. */
		color: var(--color-ink-muted);
		transition:
			color 140ms ease,
			background 140ms ease;
	}

	.nav-link:hover {
		color: var(--color-ink);
		background: var(--color-ground-raised);
	}

	.nav-link.is-current {
		color: var(--color-ink);
		background: var(--color-ground-overlay);
	}
</style>
