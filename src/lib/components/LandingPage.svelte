<script lang="ts">
	const REPOSITORY = 'https://github.com/bparticle/harmonic-trainer';

	const pitches = [
		{ note: 'C', pc: 0 },
		{ note: 'G', pc: 7 },
		{ note: 'D', pc: 2 },
		{ note: 'A', pc: 9 },
		{ note: 'E', pc: 4 },
		{ note: 'B', pc: 11 },
		{ note: 'F♯', pc: 6 },
		{ note: 'D♭', pc: 1 },
		{ note: 'A♭', pc: 8 },
		{ note: 'E♭', pc: 3 },
		{ note: 'B♭', pc: 10 },
		{ note: 'F', pc: 5 }
	];

	const stack = [
		'SvelteKit 2 + Svelte 5',
		'TypeScript',
		'Tone.js',
		'Web MIDI',
		'Postgres + Drizzle',
		'Vitest',
		'Progressive Web App'
	];

	const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'C', 'D', 'E'];
</script>

<div class="landing-shell">
	<header class="site-header">
		<a class="brand" href="#top" aria-label="Harmonic Trainer home">
			<svg viewBox="0 0 40 40" aria-hidden="true">
				<circle cx="20" cy="20" r="13" class="mark-ring" />
				{#each pitches as pitch, i (pitch.note)}
					<circle
						cx={20 + Math.sin((i / 12) * Math.PI * 2) * 13}
						cy={20 - Math.cos((i / 12) * Math.PI * 2) * 13}
						r="2.7"
						style:fill={`var(--pc-${pitch.pc})`}
					/>
				{/each}
			</svg>
			<span>Harmonic Trainer</span>
		</a>

		<nav class="site-nav" aria-label="Project">
			<a href="#features">Features</a>
			<a href="#open-source">Open source</a>
			<a href="#stack">Stack</a>
		</nav>

		<div class="header-actions">
			<a class="source-link" href={REPOSITORY} target="_blank" rel="noreferrer">GitHub ↗</a>
			<a class="instance-link" href="/login">Open this instance</a>
		</div>
	</header>

	<main id="top">
		<section class="hero" aria-labelledby="hero-title">
			<div class="hero-copy">
				<p class="eyebrow entrance entrance-1">Open-source · instrument-first</p>
				<h1 id="hero-title" class="entrance entrance-2">
					Harmony is movement.<br />
					<span>Learn to move with it.</span>
				</h1>
				<p class="hero-deck entrance entrance-3">
					See chord progressions as shapes. Hear how they pull. Drill them in every key, then put
					them under your hands with a generated rhythm section.
				</p>
				<div class="hero-actions entrance entrance-4">
					<a class="primary-action" href={REPOSITORY} target="_blank" rel="noreferrer">
						<span>Explore the source</span><span aria-hidden="true">↗</span>
					</a>
					<a class="text-action" href="#tour">See it in motion <span aria-hidden="true">↓</span></a>
				</div>
				<p class="hero-note entrance entrance-5">MIT licensed · no telemetry · self-hosted</p>
			</div>

			<div class="hero-instrument entrance entrance-3" aria-label="Animated harmonic wheel">
				<div class="orbit-label orbit-label-a">ii</div>
				<div class="orbit-label orbit-label-b">V</div>
				<div class="orbit-label orbit-label-c">I</div>
				<svg class="hero-wheel" viewBox="0 0 620 620" role="img" aria-label="Circle of fifths">
					<circle cx="310" cy="310" r="225" class="wheel-track outer" />
					<circle cx="310" cy="310" r="151" class="wheel-track" />
					<circle cx="310" cy="310" r="76" class="wheel-track inner" />
					<g class="pitch-orbit">
						{#each pitches as pitch, i (pitch.note)}
							{@const angle = (i / 12) * Math.PI * 2 - Math.PI / 2}
							{@const x = 310 + Math.cos(angle) * 225}
							{@const y = 310 + Math.sin(angle) * 225}
							<g transform={`translate(${x} ${y})`}>
								<circle r="28" style:fill={`var(--pc-${pitch.pc})`} />
								<text
									class="pitch-label"
									style:fill={`var(--pc-${pitch.pc}-ink)`}
									text-anchor="middle"
									dy="0.34em">{pitch.note}</text
								>
							</g>
						{/each}
					</g>
					<path class="progression-path" d="M 180 180 Q 380 96 505 230 Q 408 354 310 461" />
					<circle class="moving-note" r="9">
						<animateMotion
							dur="5.5s"
							repeatCount="indefinite"
							path="M 180 180 Q 380 96 505 230 Q 408 354 310 461"
						/>
					</circle>
					<text x="310" y="290" text-anchor="middle" class="wheel-key-label">IN C</text>
					<text x="310" y="336" text-anchor="middle" class="wheel-chord-label">Dm⁷ → G⁷ → C△</text>
				</svg>
				<p class="instrument-caption">One shape. Twelve keys.</p>
			</div>
		</section>

		<div class="method-strip" aria-label="Learning method">
			<span>See</span><i aria-hidden="true"></i><span>Hear</span><i aria-hidden="true"></i><span
				>Drill</span
			><i aria-hidden="true"></i><span>Apply</span>
		</div>

		<section id="tour" class="tour" aria-labelledby="tour-title">
			<div class="section-heading">
				<p class="eyebrow">The whole loop</p>
				<h2 id="tour-title">Theory becomes useful<br />when it reaches the instrument.</h2>
				<p>
					No staff notation and no passive course. Harmonic Trainer keeps the same musical idea
					visible as you explore it, listen for it, practise it and improvise over it.
				</p>
			</div>

			<div class="preview-stage play-along-preview">
				<div class="preview-copy">
					<p class="step-number">01 / APPLY</p>
					<h3>A rhythm section that explains the changes.</h3>
					<p>
						Loop any bar, change key or tempo while it plays, and select a chord to reveal its
						function, compatible keys and scales for improvising.
					</p>
					<ul class="plain-list">
						<li>Walking bass, drums and optional comping</li>
						<li>Roman numerals and modulation markers</li>
						<li>Forms, cycles, public-domain standards and your charts</li>
					</ul>
				</div>

				<div class="product-window backing-window" aria-label="Play along interface preview">
					<div class="window-bar">
						<span class="window-brand">Harmonic</span>
						<span>Today</span><span>Play</span><b>Play along</b><span>Explore</span>
						<i></i>
					</div>
					<div class="backing-head">
						<div>
							<small>FORM · 12 BARS</small>
							<strong>Blues</strong>
						</div>
						<div class="transport">
							<i aria-hidden="true">▶</i><span>112 BPM</span>
						</div>
					</div>
					<div class="chord-grid">
						<div class="playhead" aria-hidden="true"></div>
						<div class="chord-cell c"><b>C⁷</b><small>I⁷</small></div>
						<div class="chord-cell c"><b>C⁷</b><small>I⁷</small></div>
						<div class="chord-cell f"><b>F⁷</b><small>IV⁷</small></div>
						<div class="chord-cell c"><b>C⁷</b><small>I⁷</small></div>
						<div class="chord-cell f"><b>F⁷</b><small>IV⁷</small></div>
						<div class="chord-cell f"><b>F⁷</b><small>IV⁷</small></div>
						<div class="chord-cell c"><b>C⁷</b><small>I⁷</small></div>
						<div class="chord-cell c"><b>C⁷</b><small>I⁷</small></div>
						<div class="chord-cell g"><b>G⁷</b><small>V⁷</small></div>
						<div class="chord-cell f"><b>F⁷</b><small>IV⁷</small></div>
						<div class="chord-cell c"><b>C⁷</b><small>I⁷</small></div>
						<div class="chord-cell g"><b>G⁷</b><small>V⁷</small></div>
					</div>
					<div class="study-panel">
						<div class="study-chord"><b>C⁷</b><span>I⁷ in C blues</span></div>
						<div>
							<small>TRY OVER THIS CHORD</small><span class="scale-chip">C mixolydian</span><span
								class="scale-chip">C blues</span
							>
						</div>
						<div class="context-copy">
							<small>CONTEXT</small>
							<p>Home dominant. It establishes the centre without fully settling.</p>
						</div>
					</div>
				</div>
			</div>

			<div class="preview-stage recognition-preview">
				<div class="product-window recognition-window" aria-label="Live chord recognition preview">
					<div class="window-bar">
						<span class="window-brand">Harmonic</span><b>Play</b><i></i><span>MIDI · connected</span
						>
					</div>
					<div class="recognition-body">
						<div class="mini-wheel" aria-hidden="true">
							<svg viewBox="0 0 320 320">
								<circle cx="160" cy="160" r="112" class="wheel-track" />
								{#each pitches as pitch, i (pitch.note)}
									{@const angle = (i / 12) * Math.PI * 2 - Math.PI / 2}
									<circle
										cx={160 + Math.cos(angle) * 112}
										cy={160 + Math.sin(angle) * 112}
										r={pitch.note === 'D' ||
										pitch.note === 'F' ||
										pitch.note === 'A' ||
										pitch.note === 'C'
											? 16
											: 8}
										style:fill={`var(--pc-${pitch.pc})`}
									/>
								{/each}
								<path class="recognised-shape" d="M 160 48 L 257 216 L 63 216 Z" />
							</svg>
						</div>
						<div class="recognised-chord">
							<small>YOU PLAYED</small>
							<strong>D<span>m7</span></strong>
							<p>D · F · A · C</p>
							<div class="confidence"><i></i><span>Clear match</span></div>
							<p class="reasoning">
								A minor seventh chord: root, minor third, fifth and minor seventh.
							</p>
						</div>
					</div>
					<div class="mini-keyboard" aria-hidden="true">
						{#each whiteKeys as key, i}
							<i class:lit={i === 1 || i === 3 || i === 5 || i === 7}></i>
						{/each}
					</div>
				</div>

				<div class="preview-copy">
					<p class="step-number">02 / SEE + HEAR</p>
					<h3>Play a voicing. See what your hands found.</h3>
					<p>
						Connect a MIDI keyboard and the wheel names the harmony as you play—with the notes,
						confidence and musical reasoning behind the answer.
					</p>
					<ul class="plain-list">
						<li>Live, ranked chord recognition</li>
						<li>Correct enharmonic spelling in every key</li>
						<li>On-screen keyboard when no instrument is connected</li>
					</ul>
				</div>
			</div>

			<div class="preview-stage session-preview">
				<div class="preview-copy">
					<p class="step-number">03 / DRILL</p>
					<h3>Practice that stays out of the way.</h3>
					<p>
						Spaced repetition brings the right progression back. Large cues and pedal controls keep
						attention on the keyboard, not the screen.
					</p>
					<ul class="plain-list">
						<li>Progressive twelve-key practice ladder</li>
						<li>Hands-free sustain-pedal and keyboard controls</li>
						<li>No daily streaks, no guilt for a day off</li>
					</ul>
				</div>

				<div class="product-window session-window" aria-label="Practice session preview">
					<div class="session-meta"><span>ii–V–I · E♭ major</span><span>06:42</span></div>
					<div class="session-cue">
						<small>PLAY</small>
						<strong>F<span>m7</span></strong>
						<p>then B♭⁷</p>
					</div>
					<div class="session-progress" aria-hidden="true"><i></i></div>
					<div class="session-keys" aria-label="Progression in the current session">
						<span style="--cue: var(--pc-5)"><b>F<span>m7</span></b><small>ii</small></span>
						<span style="--cue: var(--pc-10)"><b>B♭⁷</b><small>V</small></span>
						<span style="--cue: var(--pc-3)"><b>E♭△</b><small>I</small></span>
					</div>
					<p class="session-help">Play it cleanly · sustain pedal advances</p>
				</div>
			</div>
		</section>

		<section id="features" class="principles" aria-labelledby="principles-title">
			<div class="section-heading compact">
				<p class="eyebrow">Built around musical practice</p>
				<h2 id="principles-title">Strong opinions,<br />held for a reason.</h2>
			</div>
			<div class="principle-list">
				<article>
					<span>01</span>
					<h3>No staff notation. Anywhere.</h3>
					<p>
						Harmony appears as shapes, colour, chord symbols, Roman numerals, intervals and keys—the
						language many working musicians already use.
					</p>
				</article>
				<article>
					<span>02</span>
					<h3>Everything transposes.</h3>
					<p>
						Material is stored as relationships and resolved into a key at the last moment. One
						progression is genuinely one progression in all twelve keys.
					</p>
				</article>
				<article>
					<span>03</span>
					<h3>Your instrument stays central.</h3>
					<p>
						The app listens and explains; your keyboard makes the sound. Practice controls work from
						a sustain pedal, Space, or one large tap target.
					</p>
				</article>
				<article>
					<span>04</span>
					<h3>Suggestion, never judgement.</h3>
					<p>
						Spaced repetition and a practice ladder suggest what to revisit. They never lock
						material, manufacture urgency or turn music into a scoreboard.
					</p>
				</article>
			</div>
		</section>

		<section id="open-source" class="open-source" aria-labelledby="open-title">
			<div class="open-copy">
				<p class="eyebrow">Free software, personal by design</p>
				<h2 id="open-title">Your practice data<br />belongs on your machine.</h2>
				<p>
					Harmonic Trainer is a single-musician instance, not a platform. There are no user
					accounts, analytics scripts, cloud audio libraries or service you have to trust. Run it on
					a laptop, deploy your own copy, and change anything.
				</p>
				<div class="open-actions">
					<a
						class="primary-action light"
						href={`${REPOSITORY}#running-it-locally`}
						target="_blank"
						rel="noreferrer">Run it yourself <span aria-hidden="true">↗</span></a
					>
					<a
						class="text-action light"
						href={`${REPOSITORY}/blob/main/LICENSE`}
						target="_blank"
						rel="noreferrer">Read the MIT license</a
					>
				</div>
			</div>
			<div class="open-manifesto" aria-label="Project properties">
				<div><strong>0</strong><span>trackers</span></div>
				<div><strong>1</strong><span>musician per instance</span></div>
				<div><strong>12</strong><span>keys, always available</span></div>
				<div><strong>∞</strong><span>ways to make it yours</span></div>
			</div>
		</section>

		<section id="stack" class="stack-section" aria-labelledby="stack-title">
			<div class="stack-copy">
				<p class="eyebrow">Under the lid</p>
				<h2 id="stack-title">Small enough to understand.<br />Serious enough to trust.</h2>
				<p>
					The music core is pure TypeScript and extensively fixture-tested. Audio is generated in
					the browser. Pitch colour, note spelling and harmonic analysis are treated as system
					architecture—not decoration.
				</p>
			</div>
			<ul class="stack-list" aria-label="Technology stack">
				{#each stack as item, i (item)}
					<li><span>{String(i + 1).padStart(2, '0')}</span>{item}</li>
				{/each}
			</ul>
		</section>

		<section class="contribute" aria-labelledby="contribute-title">
			<div>
				<p class="eyebrow">Contributions welcome</p>
				<h2 id="contribute-title">Musical bugs are<br />the interesting ones.</h2>
			</div>
			<div class="contribute-copy">
				<p>
					If a chord is named incorrectly, a progression resolves oddly, or a bass line sounds
					wrong, bring the exact notes and expected result. The project favours readable code,
					tested musical logic and focused pull requests.
				</p>
				<div class="contribute-links">
					<a href={`${REPOSITORY}/blob/main/CONTRIBUTING.md`} target="_blank" rel="noreferrer"
						>Contribution guide ↗</a
					>
					<a href={`${REPOSITORY}/issues`} target="_blank" rel="noreferrer">Browse issues ↗</a>
					<a href={`${REPOSITORY}/blob/main/DECISIONS.md`} target="_blank" rel="noreferrer"
						>Architecture decisions ↗</a
					>
				</div>
			</div>
		</section>

		<section class="final-cta" aria-labelledby="final-title">
			<div class="final-pitches" aria-hidden="true">
				{#each pitches as pitch (pitch.note)}<i style:background={`var(--pc-${pitch.pc})`}
					></i>{/each}
			</div>
			<p class="eyebrow">See · hear · drill · apply</p>
			<h2 id="final-title">Take harmony off the page.</h2>
			<p>Build it into something you can recognise, reach for and play.</p>
			<div class="final-actions">
				<a class="primary-action" href={REPOSITORY} target="_blank" rel="noreferrer"
					>View on GitHub <span aria-hidden="true">↗</span></a
				>
				<a class="text-action" href="/login"
					>Enter this private instance <span aria-hidden="true">→</span></a
				>
			</div>
		</section>
	</main>

	<footer>
		<a class="brand footer-brand" href="#top">
			<svg viewBox="0 0 40 40" aria-hidden="true">
				<circle cx="20" cy="20" r="13" class="mark-ring" />
				{#each pitches as pitch, i (pitch.note)}
					<circle
						cx={20 + Math.sin((i / 12) * Math.PI * 2) * 13}
						cy={20 - Math.cos((i / 12) * Math.PI * 2) * 13}
						r="2.7"
						style:fill={`var(--pc-${pitch.pc})`}
					/>
				{/each}
			</svg>
			<span>Harmonic Trainer</span>
		</a>
		<p>Open source under the MIT license.</p>
		<div>
			<a href={REPOSITORY} target="_blank" rel="noreferrer">Source</a><a
				href={`${REPOSITORY}/issues`}
				target="_blank"
				rel="noreferrer">Issues</a
			><a href="/login">Sign in</a>
		</div>
	</footer>
</div>

<style>
	:global(html) {
		scroll-behavior: smooth;
	}
	.landing-shell {
		--page-x: clamp(1.25rem, 4vw, 4.5rem);
		--content: 82rem;
		overflow: clip;
		background: var(--color-ground);
		color: var(--color-ink);
	}
	.site-header {
		position: relative;
		z-index: 20;
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		width: min(calc(100% - var(--page-x) * 2), var(--content));
		min-height: 5rem;
		margin: 0 auto;
		border-bottom: 1px solid var(--color-ground-line);
	}
	.brand {
		display: inline-flex;
		min-width: 2.75rem;
		min-height: 2.75rem;
		align-items: center;
		gap: 0.7rem;
		width: fit-content;
		color: var(--color-ink);
		font-size: 0.94rem;
		font-weight: 650;
		letter-spacing: -0.02em;
		text-decoration: none;
	}
	.brand svg {
		width: 2rem;
		height: 2rem;
		flex: none;
	}
	.mark-ring,
	.wheel-track {
		fill: none;
		stroke: var(--color-ground-line);
		stroke-width: 1.2;
	}
	.site-nav {
		display: flex;
		gap: 1.8rem;
	}
	.site-nav a,
	.source-link {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.04em;
		text-decoration: none;
		transition: color 180ms cubic-bezier(0.25, 1, 0.5, 1);
	}
	.site-nav a:hover,
	.source-link:hover {
		color: var(--color-ink);
	}
	.header-actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 1.25rem;
	}
	.instance-link {
		min-height: 2.75rem;
		display: inline-flex;
		align-items: center;
		padding: 0 1rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 0.5rem;
		color: var(--color-ink);
		font-size: 0.78rem;
		font-weight: 600;
		text-decoration: none;
		transition:
			background 180ms cubic-bezier(0.25, 1, 0.5, 1),
			border-color 180ms cubic-bezier(0.25, 1, 0.5, 1),
			transform 120ms ease;
	}
	.instance-link:hover {
		background: var(--color-ground-raised);
		border-color: var(--color-ink-dim);
	}
	.instance-link:active,
	.primary-action:active {
		transform: scale(0.98);
	}
	.hero {
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 0.92fr) minmax(30rem, 1.08fr);
		align-items: center;
		width: min(calc(100% - var(--page-x) * 2), var(--content));
		min-height: min(50rem, calc(100dvh - 5rem));
		margin: 0 auto;
		padding: clamp(4.5rem, 9vw, 8rem) 0;
	}
	.hero-copy {
		position: relative;
		z-index: 2;
	}
	.eyebrow,
	.step-number {
		margin: 0;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.68rem;
		font-weight: 500;
		letter-spacing: 0.13em;
		text-transform: uppercase;
	}
	.hero h1 {
		max-width: 13ch;
		margin: 1.25rem 0 0;
		font-size: clamp(3.5rem, 6.9vw, 7.4rem);
		font-weight: 600;
		line-height: 0.88;
		letter-spacing: -0.068em;
	}
	.hero h1 span {
		color: var(--color-ink-muted);
	}
	.hero-deck {
		max-width: 35rem;
		margin: 2rem 0 0;
		color: var(--color-ink-muted);
		font-size: clamp(1.05rem, 1.4vw, 1.28rem);
		line-height: 1.55;
	}
	.hero-actions,
	.final-actions,
	.open-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1.5rem;
		margin-top: 2rem;
	}
	.primary-action {
		display: inline-flex;
		min-height: 3.25rem;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		padding: 0 1.25rem;
		border-radius: 0.55rem;
		background: var(--color-ink);
		color: var(--color-ground);
		font-size: 0.9rem;
		font-weight: 650;
		text-decoration: none;
		transition:
			transform 120ms ease,
			background 180ms cubic-bezier(0.25, 1, 0.5, 1);
	}
	.primary-action:hover {
		background: var(--color-ink-muted);
	}
	.text-action {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		color: var(--color-ink-muted);
		font-size: 0.86rem;
		text-underline-offset: 0.3rem;
		transition: color 180ms cubic-bezier(0.25, 1, 0.5, 1);
	}
	.text-action:hover {
		color: var(--color-ink);
	}
	.hero-note {
		margin: 1.4rem 0 0;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.66rem;
	}
	.hero-instrument {
		position: relative;
		justify-self: end;
		width: min(48vw, 43rem);
		aspect-ratio: 1;
	}
	.hero-wheel {
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.wheel-track.outer {
		stroke-width: 1.5;
	}
	.wheel-track.inner {
		stroke-dasharray: 4 8;
	}
	.pitch-label {
		font-family: var(--font-display);
		font-size: 15px;
		font-weight: 700;
	}
	.progression-path {
		fill: none;
		stroke: var(--color-ink-muted);
		stroke-width: 2;
		stroke-dasharray: 3 9;
	}
	.moving-note {
		fill: var(--color-ink);
	}
	.wheel-key-label {
		fill: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 12px;
		letter-spacing: 0.14em;
	}
	.wheel-chord-label {
		fill: var(--color-ink);
		font-family: var(--font-display);
		font-size: 20px;
		font-weight: 600;
	}
	.instrument-caption {
		position: absolute;
		right: 3%;
		bottom: 13%;
		margin: 0;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.orbit-label {
		position: absolute;
		z-index: 2;
		display: grid;
		width: 2.7rem;
		height: 2.7rem;
		place-items: center;
		border: 1px solid var(--color-ground-line);
		border-radius: 50%;
		background: var(--color-ground-raised);
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		box-shadow: 0 0 0 0.45rem var(--color-ground);
	}
	.orbit-label-a {
		top: 12%;
		left: 8%;
	}
	.orbit-label-b {
		top: 24%;
		right: 4%;
	}
	.orbit-label-c {
		right: 26%;
		bottom: 8%;
	}
	.entrance {
		animation: enter 700ms cubic-bezier(0.16, 1, 0.3, 1) both;
	}
	.entrance-1 {
		animation-delay: 70ms;
	}
	.entrance-2 {
		animation-delay: 140ms;
	}
	.entrance-3 {
		animation-delay: 240ms;
	}
	.entrance-4 {
		animation-delay: 340ms;
	}
	.entrance-5 {
		animation-delay: 420ms;
	}
	@keyframes enter {
		from {
			opacity: 0;
			transform: translateY(18px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	.method-strip {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: clamp(0.75rem, 3vw, 3rem);
		min-height: 6.5rem;
		border-top: 1px solid var(--color-ground-line);
		border-bottom: 1px solid var(--color-ground-line);
		color: var(--color-ink);
		font-size: clamp(1rem, 2.2vw, 1.55rem);
		font-weight: 600;
		letter-spacing: -0.025em;
		text-transform: uppercase;
	}
	.method-strip i {
		width: 0.38rem;
		height: 0.38rem;
		border-radius: 50%;
		background: var(--pc-5);
	}
	.method-strip i:nth-of-type(2) {
		background: var(--pc-7);
	}
	.method-strip i:nth-of-type(3) {
		background: var(--pc-0);
	}
	.tour,
	.principles,
	.stack-section,
	.contribute,
	.final-cta {
		width: min(calc(100% - var(--page-x) * 2), var(--content));
		margin: 0 auto;
	}
	.tour {
		padding: clamp(6rem, 11vw, 10rem) 0;
	}
	.section-heading {
		display: grid;
		grid-template-columns: 0.45fr 1fr 0.7fr;
		align-items: start;
		gap: clamp(2rem, 5vw, 5rem);
	}
	.section-heading h2,
	.principles h2,
	.open-source h2,
	.stack-section h2,
	.contribute h2,
	.final-cta h2 {
		margin: -0.15em 0 0;
		font-size: clamp(2.4rem, 4.3vw, 4.8rem);
		font-weight: 600;
		line-height: 0.98;
		letter-spacing: -0.052em;
	}
	.section-heading > p:last-child,
	.stack-copy > p:last-child,
	.contribute-copy > p {
		max-width: 37rem;
		margin: 0;
		color: var(--color-ink-muted);
		font-size: 0.98rem;
		line-height: 1.7;
	}
	.preview-stage {
		display: grid;
		grid-template-columns: minmax(16rem, 0.7fr) minmax(0, 1.3fr);
		align-items: center;
		gap: clamp(3rem, 8vw, 8rem);
		margin-top: clamp(7rem, 13vw, 12rem);
	}
	.preview-copy h3 {
		max-width: 14ch;
		margin: 1.2rem 0 1.5rem;
		font-size: clamp(2rem, 3.1vw, 3.35rem);
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.045em;
	}
	.preview-copy > p:not(.step-number) {
		max-width: 33rem;
		margin: 0;
		color: var(--color-ink-muted);
		font-size: 0.94rem;
		line-height: 1.7;
	}
	.plain-list {
		display: grid;
		gap: 0.75rem;
		margin: 1.75rem 0 0;
		padding: 0;
		list-style: none;
		color: var(--color-ink-muted);
		font-size: 0.78rem;
	}
	.plain-list li {
		display: grid;
		grid-template-columns: 0.6rem 1fr;
		align-items: baseline;
		gap: 0.65rem;
	}
	.plain-list li::before {
		content: '';
		width: 0.32rem;
		height: 0.32rem;
		border-radius: 50%;
		background: var(--pc-5);
	}
	.product-window {
		position: relative;
		overflow: hidden;
		border: 1px solid var(--color-ground-line);
		border-radius: 0.8rem;
		background: var(--color-ground-raised);
		box-shadow: 1rem 1rem 0 color-mix(in oklab, var(--color-ground-overlay) 62%, transparent);
	}
	.window-bar {
		display: flex;
		min-height: 2.8rem;
		align-items: center;
		gap: 1rem;
		padding: 0 0.9rem;
		border-bottom: 1px solid var(--color-ground-line);
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.52rem;
	}
	.window-bar .window-brand {
		color: var(--color-ink);
		font-family: var(--font-display);
		font-size: 0.65rem;
		font-weight: 650;
	}
	.window-bar b {
		padding: 0.3rem 0.45rem;
		border-radius: 0.3rem;
		background: var(--color-ground-overlay);
		color: var(--color-ink);
		font-weight: 500;
	}
	.window-bar i {
		flex: 1;
	}
	.backing-window {
		aspect-ratio: 1.42;
		padding-bottom: 0.8rem;
		transform: rotate(1deg);
	}
	.backing-head {
		display: flex;
		align-items: end;
		justify-content: space-between;
		padding: 1.25rem 1.4rem 0.9rem;
	}
	.backing-head small,
	.study-panel small {
		display: block;
		margin-bottom: 0.2rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.48rem;
		letter-spacing: 0.08em;
	}
	.backing-head strong {
		font-size: 1.5rem;
	}
	.transport {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.52rem;
	}
	.transport > i {
		display: grid;
		width: 2rem;
		height: 2rem;
		place-items: center;
		border-radius: 50%;
		background: var(--color-ink);
		color: var(--color-ground);
		font-size: 0.6rem;
		font-style: normal;
	}
	.chord-grid {
		position: relative;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 0.3rem;
		padding: 0 1.4rem;
		overflow: hidden;
	}
	.chord-cell {
		position: relative;
		display: flex;
		min-height: 3rem;
		flex-direction: column;
		justify-content: center;
		padding: 0 0.7rem;
		overflow: hidden;
		border: 1px solid color-mix(in oklab, var(--cell) 50%, var(--color-ground-line));
		border-radius: 0.35rem;
		background: color-mix(in oklab, var(--cell) 15%, var(--color-ground));
	}
	.chord-cell b {
		color: var(--color-ink);
		font-size: 0.86rem;
	}
	.chord-cell small {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.48rem;
	}
	.chord-cell.c {
		--cell: var(--pc-0);
	}
	.chord-cell.f {
		--cell: var(--pc-5);
	}
	.chord-cell.g {
		--cell: var(--pc-7);
	}
	.playhead {
		position: absolute;
		z-index: 3;
		top: 0;
		left: 1.4rem;
		width: calc((100% - 2.8rem) / 4 - 0.3rem);
		height: calc((100% - 0.6rem) / 3);
		pointer-events: none;
		border: 1px solid var(--color-ink);
		border-radius: 0.35rem;
		animation: chartPlay 8s steps(1, end) infinite;
	}
	@keyframes chartPlay {
		0% {
			transform: translate(0, 0);
		}
		8.3% {
			transform: translate(calc(100% + 0.3rem), 0);
		}
		16.6% {
			transform: translate(calc(200% + 0.6rem), 0);
		}
		25% {
			transform: translate(calc(300% + 0.9rem), 0);
		}
		33.3% {
			transform: translate(0, calc(100% + 0.3rem));
		}
		41.6% {
			transform: translate(calc(100% + 0.3rem), calc(100% + 0.3rem));
		}
		50% {
			transform: translate(calc(200% + 0.6rem), calc(100% + 0.3rem));
		}
		58.3% {
			transform: translate(calc(300% + 0.9rem), calc(100% + 0.3rem));
		}
		66.6% {
			transform: translate(0, calc(200% + 0.6rem));
		}
		75% {
			transform: translate(calc(100% + 0.3rem), calc(200% + 0.6rem));
		}
		83.3% {
			transform: translate(calc(200% + 0.6rem), calc(200% + 0.6rem));
		}
		91.6% {
			transform: translate(calc(300% + 0.9rem), calc(200% + 0.6rem));
		}
	}
	.study-panel {
		display: grid;
		grid-template-columns: 0.6fr 1fr 1.3fr;
		align-items: center;
		gap: 1rem;
		margin: 0.8rem 1.4rem 0;
		padding: 0.8rem 0 0;
		border-top: 1px solid var(--color-ground-line);
	}
	.study-chord {
		display: flex;
		flex-direction: column;
	}
	.study-chord b {
		font-size: 1.6rem;
		line-height: 1;
	}
	.study-chord span {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.45rem;
	}
	.scale-chip {
		display: inline-flex;
		margin: 0.2rem 0.2rem 0 0;
		padding: 0.18rem 0.35rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 0.25rem;
		color: var(--color-ink-muted);
		font-size: 0.48rem;
	}
	.context-copy p {
		margin: 0;
		color: var(--color-ink-muted);
		font-size: 0.5rem;
		line-height: 1.4;
	}
	.recognition-preview {
		grid-template-columns: minmax(0, 1.25fr) minmax(16rem, 0.75fr);
	}
	.recognition-window {
		aspect-ratio: 1.5;
		transform: rotate(-1deg);
	}
	.recognition-body {
		display: grid;
		grid-template-columns: 1fr 0.8fr;
		min-height: calc(100% - 6rem);
		align-items: center;
		padding: 1rem 2rem 0.5rem;
	}
	.mini-wheel {
		height: 100%;
		min-height: 15rem;
	}
	.mini-wheel svg {
		width: 100%;
		height: 100%;
	}
	.recognised-shape {
		fill: color-mix(in oklab, var(--pc-2) 13%, transparent);
		stroke: var(--pc-2);
		stroke-width: 2;
		stroke-dasharray: 5 6;
		animation: shapePulse 2.8s cubic-bezier(0.25, 1, 0.5, 1) infinite;
		transform-origin: center;
	}
	@keyframes shapePulse {
		0%,
		100% {
			opacity: 0.55;
			transform: scale(0.98);
		}
		50% {
			opacity: 1;
			transform: scale(1.02);
		}
	}
	.recognised-chord small {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.52rem;
		letter-spacing: 0.1em;
	}
	.recognised-chord strong {
		display: block;
		margin: 0.5rem 0 0;
		color: var(--color-ink);
		font-size: clamp(3.5rem, 7vw, 6rem);
		font-weight: 600;
		line-height: 0.8;
		letter-spacing: -0.08em;
	}
	.recognised-chord strong span {
		color: var(--color-ink-muted);
		font-size: 0.45em;
		letter-spacing: -0.03em;
	}
	.recognised-chord > p {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.6rem;
	}
	.confidence {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-top: 1rem;
		color: var(--color-ink-muted);
		font-size: 0.58rem;
	}
	.confidence i {
		width: 0.42rem;
		height: 0.42rem;
		border-radius: 50%;
		background: var(--pc-5);
	}
	.recognised-chord .reasoning {
		max-width: 22ch;
		font-family: var(--font-display);
		font-size: 0.58rem;
		line-height: 1.45;
	}
	.mini-keyboard {
		display: grid;
		grid-template-columns: repeat(10, 1fr);
		height: 3.2rem;
		margin: 0 1rem 1rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 0.25rem;
		overflow: hidden;
	}
	.mini-keyboard i {
		border-right: 1px solid var(--color-ground-line);
		background: var(--color-ink);
	}
	.mini-keyboard i.lit {
		background: color-mix(in oklab, var(--pc-2) 48%, var(--color-ink));
	}
	.session-window {
		display: flex;
		aspect-ratio: 1.5;
		flex-direction: column;
		justify-content: space-between;
		padding: 1rem 1.5rem 1.2rem;
		transform: rotate(1deg);
	}
	.session-meta {
		display: flex;
		justify-content: space-between;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.55rem;
	}
	.session-cue {
		text-align: center;
	}
	.session-cue small {
		display: block;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.55rem;
		letter-spacing: 0.12em;
	}
	.session-cue strong {
		display: block;
		margin-top: 0.3rem;
		font-size: clamp(4.6rem, 9vw, 8.2rem);
		font-weight: 600;
		line-height: 0.8;
		letter-spacing: -0.08em;
	}
	.session-cue strong span {
		color: var(--color-ink-muted);
		font-size: 0.4em;
	}
	.session-cue p {
		margin: 0.9rem 0 0;
		color: var(--color-ink-muted);
		font-size: 0.75rem;
	}
	.session-progress {
		height: 2px;
		overflow: hidden;
		background: var(--color-ground-line);
	}
	.session-progress i {
		display: block;
		width: 34%;
		height: 100%;
		background: var(--pc-5);
		animation: sessionProgress 4s cubic-bezier(0.25, 1, 0.5, 1) infinite;
	}
	@keyframes sessionProgress {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(295%);
		}
	}
	.session-keys {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}
	.session-keys > span {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 0.55rem 0.7rem;
		border: 1px solid color-mix(in oklab, var(--cue) 45%, var(--color-ground-line));
		border-radius: 0.35rem;
		background: color-mix(in oklab, var(--cue) 12%, var(--color-ground));
	}
	.session-keys b {
		font-size: 0.7rem;
	}
	.session-keys b span {
		font-size: 0.7em;
		color: var(--color-ink-muted);
	}
	.session-keys small {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.48rem;
	}
	.session-help {
		margin: 0;
		text-align: center;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.48rem;
	}
	.principles {
		display: grid;
		grid-template-columns: 0.8fr 1.2fr;
		gap: clamp(4rem, 10vw, 10rem);
		padding: clamp(6rem, 11vw, 10rem) 0;
		border-top: 1px solid var(--color-ground-line);
	}
	.section-heading.compact {
		display: block;
	}
	.section-heading.compact h2 {
		margin-top: 1.2rem;
	}
	.principle-list {
		display: grid;
	}
	.principle-list article {
		display: grid;
		grid-template-columns: 2.2rem minmax(10rem, 0.8fr) 1.2fr;
		gap: 1rem;
		padding: 1.8rem 0;
		border-top: 1px solid var(--color-ground-line);
	}
	.principle-list article:last-child {
		border-bottom: 1px solid var(--color-ground-line);
	}
	.principle-list span {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.6rem;
	}
	.principle-list h3 {
		margin: 0;
		font-size: 1rem;
		line-height: 1.25;
	}
	.principle-list p {
		margin: 0;
		color: var(--color-ink-muted);
		font-size: 0.78rem;
		line-height: 1.65;
	}
	.open-source {
		display: grid;
		grid-template-columns: 1.1fr 0.9fr;
		min-height: 44rem;
		background: var(--pc-4);
		color: var(--pc-4-ink);
	}
	.open-copy {
		display: flex;
		flex-direction: column;
		justify-content: center;
		padding: clamp(4rem, 8vw, 8rem) max(var(--page-x), calc((100vw - var(--content)) / 2));
	}
	.open-copy .eyebrow {
		color: color-mix(in oklab, var(--pc-4-ink) 68%, var(--pc-4));
	}
	.open-copy h2 {
		margin-top: 1.2rem;
	}
	.open-copy > p:not(.eyebrow) {
		max-width: 38rem;
		margin: 2rem 0 0;
		color: color-mix(in oklab, var(--pc-4-ink) 78%, var(--pc-4));
		line-height: 1.7;
	}
	.primary-action.light {
		background: var(--pc-4-ink);
		color: var(--pc-4);
	}
	.primary-action.light:hover {
		background: color-mix(in oklab, var(--pc-4-ink) 85%, var(--pc-4));
	}
	.text-action.light {
		color: var(--pc-4-ink);
	}
	.open-manifesto {
		display: grid;
		grid-template-columns: 1fr 1fr;
		border-left: 1px solid color-mix(in oklab, var(--pc-4-ink) 25%, var(--pc-4));
	}
	.open-manifesto div {
		display: flex;
		flex-direction: column;
		justify-content: end;
		padding: clamp(2rem, 5vw, 4.5rem);
		border-right: 1px solid color-mix(in oklab, var(--pc-4-ink) 25%, var(--pc-4));
		border-bottom: 1px solid color-mix(in oklab, var(--pc-4-ink) 25%, var(--pc-4));
	}
	.open-manifesto strong {
		font-size: clamp(3.5rem, 7vw, 7rem);
		font-weight: 600;
		line-height: 0.8;
		letter-spacing: -0.06em;
	}
	.open-manifesto span {
		margin-top: 1rem;
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.stack-section {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: clamp(4rem, 10vw, 11rem);
		padding: clamp(7rem, 12vw, 11rem) 0;
	}
	.stack-copy h2 {
		margin-top: 1.2rem;
	}
	.stack-copy > p:last-child {
		margin-top: 2rem;
	}
	.stack-list {
		margin: 0;
		padding: 0;
		border-top: 1px solid var(--color-ground-line);
		list-style: none;
	}
	.stack-list li {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		min-height: 4rem;
		border-bottom: 1px solid var(--color-ground-line);
		color: var(--color-ink);
		font-size: 1rem;
	}
	.stack-list span {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.58rem;
	}
	.contribute {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: clamp(4rem, 10vw, 11rem);
		padding: clamp(5rem, 9vw, 8rem) 0;
		border-top: 1px solid var(--color-ground-line);
	}
	.contribute h2 {
		margin-top: 1.2rem;
	}
	.contribute-links {
		display: flex;
		flex-direction: column;
		margin-top: 2rem;
		border-top: 1px solid var(--color-ground-line);
	}
	.contribute-links a {
		display: flex;
		min-height: 3.4rem;
		align-items: center;
		border-bottom: 1px solid var(--color-ground-line);
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-decoration: none;
		transition:
			color 180ms ease,
			padding 180ms cubic-bezier(0.25, 1, 0.5, 1);
	}
	.contribute-links a:hover {
		padding-left: 0.45rem;
		color: var(--color-ink);
	}
	.final-cta {
		position: relative;
		display: flex;
		min-height: 42rem;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 6rem 0;
		text-align: center;
	}
	.final-pitches {
		position: absolute;
		top: 4rem;
		display: flex;
		gap: 0.55rem;
	}
	.final-pitches i {
		width: 0.45rem;
		height: 0.45rem;
		border-radius: 50%;
	}
	.final-cta h2 {
		margin-top: 1.4rem;
		font-size: clamp(3.5rem, 7.8vw, 8rem);
	}
	.final-cta > p:not(.eyebrow) {
		margin: 1.5rem 0 0;
		color: var(--color-ink-muted);
	}
	.final-actions {
		justify-content: center;
	}
	footer {
		display: grid;
		grid-template-columns: 1fr auto 1fr;
		align-items: center;
		width: min(calc(100% - var(--page-x) * 2), var(--content));
		min-height: 8rem;
		margin: 0 auto;
		border-top: 1px solid var(--color-ground-line);
	}
	.footer-brand {
		font-size: 0.8rem;
	}
	footer p {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.58rem;
	}
	footer > div {
		display: flex;
		justify-content: end;
		gap: 1.4rem;
	}
	footer > div a {
		display: inline-flex;
		min-height: 2.75rem;
		align-items: center;
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.62rem;
	}
	@media (max-width: 1050px) {
		.site-header {
			grid-template-columns: 1fr auto;
		}
		.site-nav {
			display: none;
		}
		.hero {
			grid-template-columns: 1fr 1fr;
		}
		.hero-instrument {
			width: 50vw;
			margin-right: -8vw;
		}
		.section-heading {
			grid-template-columns: 0.4fr 1.1fr;
		}
		.section-heading > p:last-child {
			grid-column: 2;
		}
		.preview-stage {
			gap: 3rem;
		}
		.product-window {
			box-shadow: 0.65rem 0.65rem 0 var(--color-ground-overlay);
		}
		.backing-window {
			aspect-ratio: 1.18;
		}
		.study-panel {
			grid-template-columns: 0.65fr 1.35fr;
		}
		.context-copy {
			display: none;
		}
		.recognition-window,
		.session-window {
			aspect-ratio: 1.2;
		}
		.recognition-body {
			padding-inline: 1rem;
		}
		.mini-wheel {
			min-height: 11rem;
		}
		.open-source {
			grid-template-columns: 1fr;
		}
		.open-manifesto {
			min-height: 25rem;
			border-top: 1px solid color-mix(in oklab, var(--pc-4-ink) 25%, var(--pc-4));
			border-left: 0;
		}
	}
	@media (max-width: 760px) {
		.landing-shell {
			--page-x: 1.15rem;
		}
		.site-header {
			min-height: 4.5rem;
		}
		.brand span {
			display: none;
		}
		.source-link {
			display: none;
		}
		.instance-link {
			min-height: 2.75rem;
			padding-inline: 0.8rem;
			font-size: 0.7rem;
		}
		.hero {
			grid-template-columns: 1fr;
			min-height: auto;
			padding: 4.5rem 0 2rem;
		}
		.hero h1 {
			font-size: clamp(3.25rem, 16vw, 5.5rem);
		}
		.hero-instrument {
			justify-self: center;
			order: -1;
			width: min(105vw, 31rem);
			margin: -5rem -18vw -3rem auto;
			opacity: 0.8;
		}
		.hero-copy {
			margin-top: -1rem;
		}
		.orbit-label {
			width: 2.2rem;
			height: 2.2rem;
			font-size: 0.58rem;
		}
		.instrument-caption {
			display: none;
		}
		.method-strip {
			min-height: 5rem;
			gap: 0.7rem;
			font-size: 0.82rem;
		}
		.method-strip i {
			width: 0.25rem;
			height: 0.25rem;
		}
		.section-heading,
		.principles,
		.stack-section,
		.contribute {
			grid-template-columns: 1fr;
		}
		.section-heading {
			gap: 1.5rem;
		}
		.section-heading > p:last-child {
			grid-column: 1;
		}
		.preview-stage,
		.recognition-preview {
			grid-template-columns: 1fr;
			gap: 2.75rem;
			margin-top: 7rem;
		}
		.recognition-preview .product-window {
			order: 2;
		}
		.product-window {
			width: calc(100% - 0.7rem);
		}
		.backing-window {
			aspect-ratio: 0.88;
		}
		.window-bar span:not(.window-brand),
		.window-bar b {
			display: none;
		}
		.chord-grid {
			padding-inline: 0.75rem;
		}
		.playhead {
			left: 0.75rem;
			width: calc((100% - 1.5rem) / 4 - 0.3rem);
		}
		.backing-head {
			padding-inline: 0.75rem;
		}
		.study-panel {
			grid-template-columns: 0.7fr 1.3fr;
			margin-inline: 0.75rem;
		}
		.recognition-window {
			aspect-ratio: 0.72;
		}
		.recognition-body {
			grid-template-columns: 1fr;
			padding-top: 0.3rem;
		}
		.mini-wheel {
			min-height: 11rem;
			max-height: 13rem;
		}
		.recognised-chord {
			padding: 0 1rem 1rem;
		}
		.recognised-chord strong {
			font-size: 3.8rem;
		}
		.session-window {
			aspect-ratio: 1.05;
		}
		.session-cue strong {
			font-size: 5rem;
		}
		.principles {
			gap: 4rem;
		}
		.principle-list article {
			grid-template-columns: 2rem 1fr;
		}
		.principle-list p {
			grid-column: 2;
		}
		.open-source {
			min-height: auto;
		}
		.open-copy {
			padding: 5rem var(--page-x);
		}
		.open-manifesto {
			grid-template-columns: 1fr 1fr;
			min-height: 22rem;
		}
		.open-manifesto div {
			padding: 1.5rem;
		}
		.open-manifesto strong {
			font-size: 3.4rem;
		}
		.stack-section,
		.contribute {
			gap: 3rem;
		}
		.final-cta {
			min-height: 36rem;
		}
		.final-actions {
			flex-direction: column;
			gap: 1.1rem;
		}
		footer {
			grid-template-columns: 1fr auto;
			min-height: 7rem;
		}
		footer p {
			display: none;
		}
		footer > div {
			gap: 0.9rem;
		}
	}
	@media (max-width: 390px) {
		.hero-actions {
			align-items: flex-start;
			flex-direction: column;
		}
		.hero-wheel {
			transform: scale(0.92);
		}
		.chord-cell {
			padding-inline: 0.4rem;
		}
		.chord-cell b {
			font-size: 0.72rem;
		}
		.open-manifesto {
			grid-template-columns: 1fr;
		}
		.open-manifesto div {
			min-height: 9rem;
		}
		.principle-list article {
			gap: 0.7rem;
		}
		footer > div a:nth-child(2) {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		:global(html) {
			scroll-behavior: auto;
		}
		.entrance,
		.playhead,
		.recognised-shape,
		.session-progress i {
			animation: none !important;
		}
		.moving-note {
			display: none;
		}
	}
</style>
