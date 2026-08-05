<script lang="ts">
	let { data } = $props();

	/*
	 * A preview of the wheel's outermost ring: twelve pitch classes in
	 * circle-of-fifths order, each carrying its colour and its computed
	 * contrast-safe ink.
	 *
	 * The labels are literals here on purpose. Real spelling — why the fourth
	 * degree of Eb major is Ab and never G# — is the music core's job in M1, and
	 * this page must not quietly grow a second, wrong implementation of it.
	 */
	const RING = [
		{ pc: 0, label: 'C' },
		{ pc: 7, label: 'G' },
		{ pc: 2, label: 'D' },
		{ pc: 9, label: 'A' },
		{ pc: 4, label: 'E' },
		{ pc: 11, label: 'B' },
		{ pc: 6, label: 'G♭' },
		{ pc: 1, label: 'D♭' },
		{ pc: 8, label: 'A♭' },
		{ pc: 3, label: 'E♭' },
		{ pc: 10, label: 'B♭' },
		{ pc: 5, label: 'F' }
	];

	const R = 132;
	const NODE = 30;
	const positions = RING.map((entry, i) => {
		const angle = (i / RING.length) * Math.PI * 2 - Math.PI / 2;
		return { ...entry, x: Math.cos(angle) * R, y: Math.sin(angle) * R };
	});

	const facts = $derived([
		{ k: 'database', v: 'neon · connected' },
		{ k: 'tables', v: String(data.tableCount) },
		{ k: 'migrations', v: String(data.migrationCount) },
		{ k: 'palette', v: `12 swatches · ${data.gamutFailures} out of gamut` },
		{ k: 'session', v: `${data.settings.prefs.sessionLengthMinutes} min` },
		{
			k: 'wheel',
			v: `${data.settings.wheelConfig.rings} rings · offset ${data.settings.wheelConfig.ringOffsetSteps}`
		}
	]);
</script>

<svelte:head><title>Harmonic Trainer</title></svelte:head>

<main class="mx-auto flex min-h-dvh max-w-5xl flex-col px-6 py-8">
	<header class="flex items-baseline justify-between">
		<h1 class="font-display text-ink text-xl leading-none font-semibold tracking-tight">
			Harmonic&nbsp;Trainer
		</h1>
		<span class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">m0</span>
	</header>

	<div class="flex flex-1 items-center justify-center py-10">
		<svg
			viewBox="-190 -190 380 380"
			class="no-select w-full max-w-[26rem]"
			role="img"
			aria-label="The twelve pitch classes in circle-of-fifths order, coloured by pitch"
		>
			<circle r={R} fill="none" stroke="var(--color-ground-line)" stroke-width="1" />

			{#each positions as p (p.pc)}
				<g transform="translate({p.x} {p.y})">
					<circle r={NODE} fill="var(--pc-{p.pc})" />
					<text
						y="1"
						text-anchor="middle"
						dominant-baseline="middle"
						font-size="20"
						font-weight="600"
						font-family="var(--font-display)"
						fill="var(--pc-{p.pc}-ink)">{p.label}</text
					>
				</g>
			{/each}

			<text
				text-anchor="middle"
				y="-6"
				font-size="11"
				letter-spacing="3"
				font-family="var(--font-mono)"
				fill="var(--color-ink-dim)">CIRCLE OF</text
			>
			<text
				text-anchor="middle"
				y="12"
				font-size="11"
				letter-spacing="3"
				font-family="var(--font-mono)"
				fill="var(--color-ink-dim)">FIFTHS</text
			>
		</svg>
	</div>

	<dl class="border-ground-line grid grid-cols-2 gap-x-8 gap-y-3 border-t pt-6 sm:grid-cols-3">
		{#each facts as fact (fact.k)}
			<div>
				<dt class="text-ink-dim font-mono text-[0.65rem] tracking-widest uppercase">{fact.k}</dt>
				<dd class="text-ink-muted mt-1 font-mono text-sm">{fact.v}</dd>
			</div>
		{/each}
	</dl>
</main>
