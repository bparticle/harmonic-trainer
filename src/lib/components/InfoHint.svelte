<script lang="ts">
	let {
		text,
		label = 'More information',
		align = 'start'
	}: { text: string; label?: string; align?: 'start' | 'end' } = $props();
</script>

<details class="info" class:align-end={align === 'end'}>
	<summary aria-label={label}>
		<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
			<circle cx="8" cy="8" r="6.25" />
			<path d="M8 7.1v4M8 4.6h.01" />
		</svg>
	</summary>
	<p>{text}</p>
</details>

<style>
	.info {
		position: relative;
		display: inline-flex;
		flex: none;
		font: normal 400 0.72rem/1.45 var(--font-display);
		letter-spacing: normal;
		text-align: left;
		text-transform: none;
	}

	summary {
		display: grid;
		width: 1.55rem;
		height: 1.55rem;
		cursor: pointer;
		list-style: none;
		place-items: center;
		border: 1px solid var(--color-ground-line);
		border-radius: 50%;
		color: var(--color-ink-dim);
		transition:
			border-color 120ms ease,
			color 120ms ease;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	summary:hover,
	summary:focus-visible,
	.info[open] summary {
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	svg {
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-width: 1.2;
	}

	p {
		position: absolute;
		top: calc(100% + 0.4rem);
		left: 0;
		z-index: 70;
		width: min(17rem, calc(100vw - 2rem));
		margin: 0;
		padding: 0.65rem 0.75rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 8px;
		background: var(--color-ground-overlay);
		box-shadow: 0 10px 28px color-mix(in oklab, var(--color-ground) 75%, transparent);
		color: var(--color-ink-muted);
	}

	.align-end p {
		right: 0;
		left: auto;
	}
</style>
