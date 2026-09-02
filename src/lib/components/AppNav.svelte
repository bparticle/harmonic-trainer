<script lang="ts">
	import { page } from '$app/state';
	import LiveNotes from './LiveNotes.svelte';
	import SettingsMenu from './SettingsMenu.svelte';
	import type { Key } from '$lib/music/key';
	import type { Prefs } from '$lib/settings';

	/*
	 * One header, everywhere.
	 *
	 * The same five destinations in the same order on every screen, with the
	 * current one marked. Pages used to carry their own headers with different
	 * links in different places, which made moving around feel like moving
	 * between separate tools rather than around one.
	 *
	 * Contrast is deliberate: the old links sat at the dimmest ink in the
	 * palette, which is fine for a caption and not fine for the only navigation
	 * in the app.
	 */

	let {
		prefs,
		context,
		user,
		ontour
	}: {
		prefs: Prefs;
		context?: Key;
		user?: { name: string } | null;
		ontour?: () => void;
	} = $props();

	const LINKS = [
		{ href: '/', label: 'Today' },
		{ href: '/play', label: 'Play' },
		{ href: '/backing', label: 'Play along' },
		{ href: '/songbook', label: 'Songbook' },
		{ href: '/explore', label: 'Explore' }
	];

	const isCurrent = (href: string) =>
		href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
</script>

<header class="border-ground-line bg-ground/90 sticky top-0 z-40 border-b backdrop-blur">
	<div class="mx-auto flex h-14 max-w-[1500px] items-center gap-2 px-3 sm:gap-5 sm:px-5">
		<a href="/" class="font-display text-ink hidden text-base font-semibold tracking-tight sm:block"
			>Harmonic</a
		>

		<!-- The links scroll rather than push: a fourth destination was enough to
		     make the whole page slide sideways on a narrow screen. -->
		<nav class="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto" aria-label="Main">
			{#each LINKS as link (link.href)}
				<a
					href={link.href}
					class="nav-link"
					class:is-current={isCurrent(link.href)}
					aria-current={isCurrent(link.href) ? 'page' : undefined}>{link.label}</a
				>
			{/each}
		</nav>

		<div class="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
			<div class="hidden sm:block"><LiveNotes {context} /></div>
			<SettingsMenu {prefs} {user} {ontour} />
		</div>
	</div>
</header>

<style>
	.no-scrollbar {
		scrollbar-width: none;
	}

	.no-scrollbar::-webkit-scrollbar {
		display: none;
	}

	.nav-link {
		flex: none;
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
