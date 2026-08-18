<script lang="ts">
	import type { Badge } from '$lib/effects/badges';
	import { BADGE_TIERS, nextTier, type Streak } from '$lib/effects/streak';

	/*
	 * The shelf.
	 *
	 * Six badges, one per rung of the ladder, always all six on show: the ones
	 * you have and the ones you have not, in order, with the streak each will
	 * cost you. A collection that only displayed what you had already earned
	 * would be a trophy cabinet, and this is meant to be a ladder — the whole
	 * use of it is seeing that twenty is next and that fifty exists.
	 *
	 * An earned badge wears the colour of the chord it was won on. That is the
	 * one honest source of colour available here: hue means pitch everywhere in
	 * this app and cannot be handed a second meaning, so rather than inventing
	 * bronze, silver and gold, a badge simply remembers the chord that clinched
	 * it. It also makes the shelf a record of what you have actually been
	 * playing — a row of greens is a lot of time on F.
	 *
	 * The badge you are climbing towards fills its outline as you go, which is
	 * the only moving part.
	 *
	 * Since M9 the six sockets are **this tune's**. Six empty ones under a chart
	 * you have not played yet is the point: the shelf is a ladder here, and it
	 * says that twenty is next and that fifty exists. The profile inverts that
	 * and shows only what was won, because thirty tunes' worth of empty sockets
	 * would be a scolding with a grid layout.
	 */

	let {
		shelf,
		streak,
		chartName,
		best,
		bestHere
	}: {
		/** This tune's badges, by tier. */
		shelf: Record<string, Badge>;
		/** The run under way, for the progress ring. */
		streak: Streak;
		chartName: string;
		/** The best ever and the best on this tune, out of the runs that set them. */
		best: number;
		bestHere: number;
	} = $props();

	/* A pointy-top hexagon, drawn once and worn by all six. */
	const W = 52;
	const H = 58;
	const HEX = `M ${W / 2} 2 L ${W - 2} ${H / 4 + 1} L ${W - 2} ${(H * 3) / 4 - 1} L ${W / 2} ${H - 2} L 2 ${(H * 3) / 4 - 1} L 2 ${H / 4 + 1} Z`;

	/*
	 * Two different "next"s, which is a distinction worth keeping.
	 *
	 * `climbing` is the rung the run under way is heading for, and it only
	 * exists while something is actually running. `chasing` is the first badge
	 * still missing from the shelf, which is a goal whether or not you are
	 * playing. Collapsing them marked an earned badge as next and told someone
	 * with five badges and a best of thirty-four that they were three away from
	 * their first.
	 */
	const climbing = $derived(streak.count > 0 ? nextTier(streak.count) : null);
	const chasing = $derived(BADGE_TIERS.find((tier) => !shelf[tier.id]) ?? null);

	/** How far the run under way has got towards the rung above it, 0–100 for the arc. */
	const progress = $derived.by(() => {
		if (!climbing) return 0;
		const previous = [...BADGE_TIERS].reverse().find((tier) => tier.from <= streak.count);
		const floor = previous?.from ?? 0;
		const span = climbing.from - floor;
		return span <= 0 ? 0 : Math.min(100, Math.max(0, ((streak.count - floor) / span) * 100));
	});

	/** Local format, and nothing at all rather than "Invalid Date". */
	function when(iso: string): string {
		const date = new Date(iso);
		if (!iso || Number.isNaN(date.getTime())) return '';
		return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function describe(id: string, name: string, from: number): string {
		const badge = shelf[id];
		if (!badge) return `${name} — not yet earned. Land ${from} chords in a row on this tune.`;
		const day = when(badge.at);
		const key = badge.key ? ` in ${badge.key.replace('b', '♭')}` : '';
		return `${name} — ${badge.count} in a row${key}${day ? ` on ${day}` : ''}.`;
	}
</script>

<section class="shelf" aria-label="Streak badges">
	<header class="shelf-head">
		<h2 class="shelf-title">Streaks</h2>
		<dl class="shelf-bests">
			<div>
				<dt>best ever</dt>
				<dd>{best || '—'}{best ? '×' : ''}</dd>
			</div>
			<div>
				<dt>on {chartName}</dt>
				<dd>{bestHere || '—'}{bestHere ? '×' : ''}</dd>
			</div>
		</dl>
	</header>

	<ul class="badges">
		{#each BADGE_TIERS as tier (tier.id)}
			{@const badge = shelf[tier.id]}
			{@const isNext = chasing?.id === tier.id}
			{@const isClimbing = climbing?.id === tier.id}
			<li
				class="badge"
				class:is-earned={Boolean(badge)}
				class:is-next={isNext}
				style:--tone={badge ? `var(--pc-${badge.pc})` : 'var(--color-ground-line)'}
				style:--tone-ink={badge ? `var(--pc-${badge.pc}-ink)` : 'var(--color-ink-dim)'}
				style:--tone-deep={badge ? `var(--pc-${badge.pc}-deep)` : 'var(--color-ground-line)'}
				title={describe(tier.id, tier.name, tier.from)}
			>
				<svg class="badge-art" viewBox="0 0 {W} {H}" aria-hidden="true">
					<path class="badge-shape" d={HEX} />
					{#if isClimbing}
						<!-- The one moving part on the shelf: the outline of the rung
						     above fills as the run under way climbs towards it. -->
						<path
							class="badge-progress"
							d={HEX}
							pathLength="100"
							style:stroke-dasharray="{progress} 100"
						/>
					{/if}
					<text class="badge-count" x={W / 2} y={H / 2 + 6} text-anchor="middle">{tier.from}</text>
				</svg>
				<span class="badge-name">{tier.name}</span>
			</li>
		{/each}
	</ul>

	<p class="shelf-hint">
		{#if climbing}
			{climbing.from - streak.count} more in a row for <strong>{climbing.name}</strong>.
		{:else if bestHere === 0}
			Land chords back to back to start a streak. Three in a row is the first badge on this tune.
		{:else if chasing}
			<strong>{chasing.name}</strong> is next: {chasing.from} in a row.
		{:else}
			Every badge earned on {chartName}. There is nothing above legendary.
		{/if}
	</p>
</section>

<style>
	.shelf {
		margin-top: 0.85rem;
		padding: 0.85rem 1rem 0.95rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 11px;
		background: color-mix(in oklab, var(--color-ground-raised) 60%, transparent);
	}

	.shelf-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 0.4rem 1.4rem;
	}

	.shelf-title {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.shelf-bests {
		display: flex;
		gap: 1.4rem;
	}

	.shelf-bests div {
		display: flex;
		align-items: baseline;
		gap: 0.4rem;
	}

	.shelf-bests dt {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.shelf-bests dd {
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 1.05rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.badges {
		display: flex;
		flex-wrap: wrap;
		gap: 0.55rem 0.7rem;
		margin-top: 0.75rem;
	}

	.badge {
		display: flex;
		width: 3.6rem;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
	}

	.badge-art {
		display: block;
		width: 100%;
		height: auto;
	}

	/*
	 * Unearned is an empty socket rather than a greyed-out badge: the shape is
	 * there, the number it costs is there, and the colour is the only thing
	 * missing. Round joins because a hexagon drawn with mitred corners looks
	 * like a warning sign.
	 */
	.badge-shape {
		fill: color-mix(in oklab, var(--color-ground) 80%, transparent);
		stroke: var(--color-ground-line);
		stroke-width: 2;
		stroke-linejoin: round;
	}

	.badge.is-earned .badge-shape {
		fill: var(--tone);
		stroke: var(--tone-deep);
		stroke-width: 3;
	}

	.badge-progress {
		fill: none;
		stroke: var(--color-ink-muted);
		stroke-width: 2.5;
		stroke-linejoin: round;
		stroke-linecap: round;
		transition: stroke-dasharray 240ms ease;
	}

	.badge-count {
		fill: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 17px;
		font-variant-numeric: tabular-nums;
	}

	.badge.is-earned .badge-count {
		fill: var(--tone-ink);
	}

	.badge-name {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		line-height: 1.15;
		text-align: center;
	}

	.badge.is-earned .badge-name {
		color: var(--color-ink-muted);
	}

	.badge.is-next .badge-name {
		color: var(--color-ink);
	}

	.shelf-hint {
		margin-top: 0.7rem;
		color: var(--color-ink-dim);
		font-size: 0.76rem;
		line-height: 1.45;
	}

	.shelf-hint strong {
		color: var(--color-ink-muted);
	}

	@media (prefers-reduced-motion: reduce) {
		.badge-progress {
			transition: none;
		}
	}
</style>
