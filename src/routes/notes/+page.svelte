<script lang="ts">
	/*
	 * The index. Three essays, in the order the app works in: see the harmony,
	 * drill it, then name it and count what happened.
	 */

	const posts = [
		{
			slug: 'hue-means-pitch',
			kicker: 'See · the wheel',
			title: 'Hue means pitch, and nothing else',
			blurb:
				'Notes are spelled, never numbered. Twelve colours come from seven. The harmonic wheel is five circles of fifths stacked so a chord is a rigid shape you can rotate into any key.'
		},
		{
			slug: 'the-ladder',
			kicker: 'Drill · the exercises',
			title: 'The ladder, and why it widens before it deepens',
			blurb:
				'A curriculum with two axes instead of one walk. Cards that do not exist until you reach them. A workout composed fresh from the date, spaced repetition that knows some questions are harder than others, and a gate that will not set you a tune whose chords you have never been shown.'
		},
		{
			slug: 'naming-and-counting',
			kicker: 'Hear · apply · measure',
			title: 'Naming what you play, and counting it honestly',
			blurb:
				'Chord recognition that returns a ranked list with its reasons. Roman numerals with an explanation attached. A rhythm section generated from numerals so one chart plays in twelve keys. And a record where every number on screen traces to a row.'
		}
	];
</script>

<svelte:head>
	<title>Notes · Harmonic Trainer</title>
	<meta
		name="description"
		content="How the Harmonic Trainer works, and the music theory it is built on: the pitch-colour wheel, the exercise ladder, spaced repetition, chord recognition and roman-numeral analysis."
	/>
	<meta property="og:title" content="Notes · Harmonic Trainer" />
	<meta
		property="og:description"
		content="How the app works, and the music theory under it — written semi-technically, with diagrams."
	/>
	<meta property="og:type" content="website" />
</svelte:head>

<article class="note">
	<header class="note-hero">
		<p class="note-eyebrow">Notes · how it works</p>
		<h1>What the app is built on</h1>
		<p class="note-standfirst">
			The Harmonic Trainer is a practice tool for learning harmony at the piano — a wheel, a MIDI
			keyboard, ear training, spaced repetition and a generated rhythm section. These notes explain
			the machinery: the music theory it encodes, the parts it has derived from that theory, and how
			it turns practising into something it can measure. Semi-technical, with diagrams, and no staff
			notation anywhere.
		</p>
	</header>

	<div class="note-body">
		<section class="note-section">
			<p class="lede">
				One loop, worked from every side: <strong>see</strong> a progression on the wheel,
				<strong>hear</strong> the pull, <strong>drill</strong> it across all twelve keys, and
				<strong>apply</strong> it with a band behind you. Each essay takes one part of that loop and opens
				it up.
			</p>

			<div class="note-index-list">
				{#each posts as post (post.slug)}
					<a class="note-card" href={`/notes/${post.slug}`}>
						<span class="kicker">{post.kicker}</span>
						<h2>{post.title}</h2>
						<p>{post.blurb}</p>
					</a>
				{/each}
			</div>
		</section>

		<section class="note-section">
			<h2>A few things that are true everywhere</h2>
			<p>Three decisions run through all of it, and every essay leans on them:</p>
			<ul>
				<li>
					<strong>Notes are spelled, never numbered.</strong> A note is a letter, an alteration and an
					octave; its pitch class and MIDI number are derived from that, never the other way round. In
					E♭ major the fourth degree is A♭, and it stays A♭ through every transposition.
				</li>
				<li>
					<strong>Everything transposes.</strong> Musical material is stored once — as Roman numerals
					or as intervals — and resolved into a key at the last possible moment. &ldquo;The same blues
					in E♭&rdquo; is a parameter, not a second chart.
				</li>
				<li>
					<strong>Hue means pitch, and nothing else.</strong> There are twelve pitch-class colours and
					they are the app's only colour language. A key wears its tonic's colour; a chord quality, which
					has no pitch, is drawn in weight instead. If a screen looks grey and the only fix is a colour
					that stands for nothing, it stays grey.
				</li>
			</ul>
			<p>
				The project is free software under the AGPL. The music core is plain TypeScript with a few
				hundred hand-written test fixtures, and you can read all of it —
				<a href="https://github.com/bparticle/harmonic-trainer" target="_blank" rel="noreferrer"
					>the source is on GitHub</a
				>, and <code>DECISIONS.md</code> there records the reasoning behind nearly everything below.
			</p>
		</section>
	</div>
</article>
