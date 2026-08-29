<script lang="ts">
	/*
	 * Essay three — recognition, analysis, the play-along, and what gets counted.
	 */

	// Recognition: D F A C, read two ways, with the reasons attached.
	const CANDIDATES = [
		{
			symbol: 'Dm7',
			confidence: 0.72,
			why: ['root in the bass', 'every note diatonic to C major', 'a common chord in this idiom']
		},
		{
			symbol: 'F6',
			confidence: 0.55,
			why: [
				'3rd in the bass — a first inversion',
				'the same four notes, heard from F',
				'a sixth chord is less common than a minor seventh here'
			]
		},
		{
			symbol: 'Am7 (no 5)',
			confidence: 0.28,
			why: [
				'rootless reading: the 3rd, 5th and 7th with no A',
				'no ninth to prove the root was dropped on purpose'
			]
		}
	];

	// Guide-tone voice leading down a ii–V–I in C. Two voices; at each change one
	// holds and the other falls a semitone.
	const CHORDS = [
		{ x: 70, sym: 'Dm7', num: 'ii7' },
		{ x: 220, sym: 'G7', num: 'V7' },
		{ x: 370, sym: 'Cmaj7', num: 'Imaj7' }
	];
	// voiceHi = the 3rd-of-ii line; voiceLo = the 7th-of-ii line.
	const VOICE_HI = [
		{ x: 70, y: 46, label: 'F', role: '3' },
		{ x: 220, y: 46, label: 'F', role: '7' },
		{ x: 370, y: 58, label: 'E', role: '3' }
	];
	const VOICE_LO = [
		{ x: 70, y: 92, label: 'C', role: '7' },
		{ x: 220, y: 104, label: 'B', role: '3' },
		{ x: 370, y: 104, label: 'B', role: '7' }
	];
	const seg = (pts: { x: number; y: number }[]) =>
		pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

	// A plain twelve-bar blues in C, tinted by root.
	const BLUES = [
		{ n: 'I7', pc: 0 },
		{ n: 'IV7', pc: 5 },
		{ n: 'I7', pc: 0 },
		{ n: 'I7', pc: 0 },
		{ n: 'IV7', pc: 5 },
		{ n: 'IV7', pc: 5 },
		{ n: 'I7', pc: 0 },
		{ n: 'I7', pc: 0 },
		{ n: 'V7', pc: 7 },
		{ n: 'IV7', pc: 5 },
		{ n: 'I7', pc: 0 },
		{ n: 'V7', pc: 7 }
	];

	// A modulation from C to G, with the pivot walked back to.
	const MOD = [
		{ sym: 'Cmaj7', roman: 'Imaj7', key: 'C', pivot: '' },
		{ sym: 'Am7', roman: 'vi7', key: 'C', pivot: 'ii7 in G' },
		{ sym: 'D7', roman: 'V7', key: 'G', pivot: '' },
		{ sym: 'Gmaj7', roman: 'Imaj7', key: 'G', pivot: '' }
	];

	// The play-along: one set of numerals, three keys.
	const RESOLVED = [
		{
			key: 'C',
			chords: [
				{ s: 'C7', pc: 0 },
				{ s: 'F7', pc: 5 },
				{ s: 'G7', pc: 7 }
			]
		},
		{
			key: 'F',
			chords: [
				{ s: 'F7', pc: 5 },
				{ s: 'B♭7', pc: 10 },
				{ s: 'C7', pc: 0 }
			]
		},
		{
			key: 'A',
			chords: [
				{ s: 'A7', pc: 9 },
				{ s: 'D7', pc: 2 },
				{ s: 'E7', pc: 4 }
			]
		}
	];

	// Judging one bar of Dm7 heard in C major.
	const PLAYED = [
		{ note: 'D', kind: 'chord', scored: false, guide: false },
		{ note: 'F', kind: 'chord', scored: true, guide: true },
		{ note: 'C', kind: 'chord', scored: true, guide: true },
		{ note: 'B', kind: 'colour', scored: false, guide: false },
		{ note: 'G♯', kind: 'outside', scored: false, guide: false }
	];
</script>

<svelte:head>
	<title>Naming what you play · Notes · Harmonic Trainer</title>
	<meta
		name="description"
		content="How the Harmonic Trainer names chords, analyses progressions, generates a rhythm section from Roman numerals, judges what you play against a chord's guide tones, and keeps a record where every number traces to a row."
	/>
	<meta property="og:title" content="Naming what you play, and counting it honestly" />
	<meta
		property="og:description"
		content="Ranked chord recognition, Roman numerals with an explanation attached, a band generated from numerals, and a record with no daily streak."
	/>
	<meta property="og:type" content="article" />
</svelte:head>

<article class="note">
	<header class="note-hero">
		<p class="note-eyebrow">Notes · hear · apply · measure</p>
		<h1>Naming what you play, and counting it honestly</h1>
		<p class="note-standfirst">
			Being able to play a thing you cannot name is the problem the whole app is pointed at. Closing
			that gap needs three things that are usually done badly: a chord namer that admits when it is
			unsure, an analysis that explains itself, and a score that measures playing rather than
			busyness.
		</p>
	</header>

	<div class="note-body">
		<section class="note-section">
			<p class="note-label">Recognition</p>
			<h2>A ranked list, with the reasoning attached</h2>

			<p class="lede">
				Play D, F, A and C together and ask what it is. There is no single answer: it is genuinely
				both D minor seventh and F sixth, and which one it <em>is</em> depends on the bass, the key and
				what came before. Returning one name would be a guess wearing a confident face.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="wide"
						viewBox="0 0 520 220"
						role="img"
						aria-label="The notes D, F, A, C read three ways. D minor seventh scores 0.72, F sixth scores 0.55, and a rootless A minor seventh scores 0.28, each with a short list of reasons."
					>
						<text x="0" y="16" class="f-mono f-dim" font-size="10">PLAYED · D F A C</text>
						{#each CANDIDATES as c, i (c.symbol)}
							<text x="0" y={48 + i * 58} class="f-display" font-size="15" font-weight="600"
								>{c.symbol}</text
							>
							<rect
								x="120"
								y={38 + i * 58}
								width={c.confidence * 260}
								height="12"
								rx="2"
								class="f-fill"
								opacity={0.35 + c.confidence * 0.5}
							/>
							<text
								x={120 + c.confidence * 260 + 8}
								y={48 + i * 58}
								class="f-mono f-dim"
								font-size="10">{c.confidence.toFixed(2)}</text
							>
							{#each c.why as reason, j (reason)}
								<text x="120" y={62 + i * 58 + j * 12} class="f-mono f-dim" font-size="8.5"
									>· {reason}</text
								>
							{/each}
						{/each}
					</svg>
				</div>
				<figcaption>
					A confidence, an interpretation — tertian, shell, rootless, quartal, upper-structure — and
					the reasons in plain language. The fifth of a chord costs almost nothing when it is
					missing; the third and seventh cost a lot, because they are what make the chord that
					chord. A rootless reading needs a ninth or a thirteenth as evidence that the root was
					dropped on purpose rather than just absent.
				</figcaption>
			</figure>
		</section>

		<section class="note-section">
			<p class="note-label">Analysis</p>
			<h2>The label is the part that never sticks</h2>

			<p>
				Knowing a chord is <code>V7/vi</code> matters far less than knowing it is &ldquo;the
				dominant of the vi chord, borrowed from A minor for one bar&rdquo; — that is the sentence
				that makes it playable in another key tomorrow. So every chord gets a Roman numeral
				<em>and</em> an explanation, and the analysis knows the difference between a secondary dominant,
				a tritone substitute, a backdoor cadence, a borrowed chord, the blues IV, and a chord that is
				simply chromatic.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="wide"
						viewBox="0 0 540 120"
						role="img"
						aria-label="Twelve bars of a blues in C, one cell each, tinted by root: I7 mostly, IV7 in bars two, five, six and ten, V7 in bars nine and twelve. Every chord is a dominant seventh."
					>
						{#each BLUES as bar, i (i)}
							<rect
								x={4 + i * 44}
								y="18"
								width="40"
								height="44"
								rx="4"
								fill={`var(--pc-${bar.pc})`}
								fill-opacity="0.22"
								stroke={`var(--pc-${bar.pc})`}
								stroke-opacity="0.5"
							/>
							<text
								x={24 + i * 44}
								y="45"
								text-anchor="middle"
								class="f-display"
								font-size="11"
								font-weight="600">{bar.n}</text
							>
							<text x={24 + i * 44} y="78" text-anchor="middle" class="f-mono f-dim" font-size="8"
								>{i + 1}</text
							>
						{/each}
						<text x="4" y="104" class="f-mono f-dim" font-size="9"
							>every chord a dominant seventh — in no key is that &ldquo;correct&rdquo;, and it is
							most of a century of music</text
						>
					</svg>
				</div>
				<figcaption>
					The plain twelve-bar blues. The analysis reads I7 and IV7 here as the <em
						>blues dominant</em
					> — a seventh where the key asks for none — rather than filing them as chromatic accidents,
					because that is the category that has a scale and a sound attached to it.
				</figcaption>
			</figure>

			<h3>Guide tones do the work, and they swap</h3>
			<p>
				The third and the seventh carry a chord's quality; the root is what the bass has, and the
				fifth carries no information. Down a ii–V–I, those two voices barely move — at each change
				one holds and the other falls a semitone — and they trade roles: the seventh of one chord
				becomes the third of the next. It works identically in all twelve keys, which is exactly why
				it is worth learning as a shape rather than as notes.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						viewBox="0 0 460 170"
						role="img"
						aria-label="Two voices moving through D minor seventh, G seventh and C major seventh. One voice goes F, F, E; the other goes C, B, B. At each chord change exactly one voice drops a semitone and the other holds."
					>
						<path d={seg(VOICE_HI)} class="f-line" stroke-width="1.5" fill="none" />
						<path d={seg(VOICE_LO)} class="f-line" stroke-width="1.5" fill="none" />
						{#each [...VOICE_HI, ...VOICE_LO] as p, i (i)}
							<circle
								cx={p.x}
								cy={p.y}
								r="13"
								stroke="currentColor"
								fill="var(--color-ground-overlay)"
							/>
							<text
								x={p.x}
								y={p.y + 4}
								text-anchor="middle"
								class="f-display"
								font-size="11"
								font-weight="600">{p.label}</text
							>
						{/each}
						{#each CHORDS as c (c.sym)}
							<text x={c.x} y="140" text-anchor="middle" class="f-display" font-size="12"
								>{c.sym}</text
							>
							<text x={c.x} y="156" text-anchor="middle" class="f-mono f-dim" font-size="9"
								>{c.num}</text
							>
						{/each}
					</svg>
				</div>
				<figcaption>
					F is the third of Dm7, the seventh of G7, and falls to E, the third of Cmaj7. C is the
					seventh of Dm7, falls to B, the third of G7, and holds as the seventh of Cmaj7. Two notes,
					small moves, and the whole cadence.
				</figcaption>
			</figure>

			<h3>Modulation is found by looking for the arrival</h3>
			<p>
				A chart is scanned for a complete ii–V–I landing on a chord that is not the current tonic.
				When one is found, the detector walks <em>backwards</em> for the pivot: the last chord that is
				diatonic in both keys — its own comment calls it &ldquo;the chord where the ear has already changed
				key without knowing it yet&rdquo;. On the wheel it is the cell the two key-shapes share.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						viewBox="0 0 520 150"
						role="img"
						aria-label="Four chords: C major seventh, A minor seventh, D seventh, G major seventh. A minor seventh is marked as the pivot — vi in C, and ii in G — and the key label changes from C to G there."
					>
						{#each MOD as ch, i (ch.sym)}
							<rect
								x={20 + i * 122}
								y="30"
								width="104"
								height="54"
								rx="6"
								class="f-line"
								fill="currentColor"
								fill-opacity={ch.pivot ? '0.1' : '0'}
								stroke-dasharray={ch.pivot ? '5 4' : '0'}
							/>
							<text
								x={72 + i * 122}
								y="54"
								text-anchor="middle"
								class="f-display"
								font-size="13"
								font-weight="600">{ch.sym}</text
							>
							<text x={72 + i * 122} y="72" text-anchor="middle" class="f-mono f-dim" font-size="9"
								>{ch.roman}</text
							>
							<text x={72 + i * 122} y="102" text-anchor="middle" class="f-mono" font-size="9"
								>key of {ch.key}</text
							>
							{#if ch.pivot}
								<text x={72 + i * 122} y="20" text-anchor="middle" class="f-mono" font-size="8.5"
									>pivot · {ch.pivot}</text
								>
							{/if}
						{/each}
						<text x="20" y="130" class="f-mono f-dim" font-size="9"
							>the ii–V–I into G is the signal; the pivot is walked back to</text
						>
					</svg>
				</div>
				<figcaption>
					A bare V–I is not enough — E7–Am in C is a secondary dominant doing its job, not a move to
					A minor. It takes a resolved ii–V–I onto a stable new tonic. The same detector feeds the
					wheel's picture and a chart's readiness demand, so the two can never disagree about what
					counts as a key change.
				</figcaption>
			</figure>
		</section>

		<section class="note-section">
			<p class="note-label">The play-along</p>
			<h2>One chart, twelve keys, no audio files</h2>

			<p>
				Charts are stored as Roman numerals and resolved into a key at the last moment, which is
				what makes &ldquo;the same blues in E♭&rdquo; a parameter rather than a second chart. The
				rhythm section is <em>computed</em> from the resolved chords: a walking bass, drums, and comping
				that is off by default. Nothing is recorded, so every form plays in all twelve keys at any tempo
				without a single audio file existing.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="wide"
						viewBox="0 0 540 200"
						role="img"
						aria-label="One row of numerals — I7, IV7, V7 — resolved into three keys. In C: C7, F7, G7. In F: F7, B-flat 7, C7. In A: A7, D7, E7. Each chord is tinted by its root colour."
					>
						<text x="0" y="16" class="f-mono f-dim" font-size="10"
							>STORED · I7 &nbsp; IV7 &nbsp; V7</text
						>
						{#each RESOLVED as row, r (row.key)}
							<text x="0" y={52 + r * 46} class="f-mono" font-size="10">in {row.key}</text>
							{#each row.chords as chord, c (chord.s)}
								<rect
									x={70 + c * 150}
									y={34 + r * 46}
									width="132"
									height="30"
									rx="5"
									fill={`var(--pc-${chord.pc})`}
									fill-opacity="0.22"
									stroke={`var(--pc-${chord.pc})`}
									stroke-opacity="0.5"
								/>
								<text
									x={136 + c * 150}
									y={54 + r * 46}
									text-anchor="middle"
									class="f-display"
									font-size="13"
									font-weight="600">{chord.s}</text
								>
							{/each}
						{/each}
					</svg>
				</div>
				<figcaption>
					Every bar is tinted by its root, in the same twelve colours the wheel and the keyboard
					use, so a form's harmonic motion is visible before a note sounds. The walking line gives
					each of its four notes a different job: the first says which chord this is, the last says
					which chord is coming, and the middle two get you there without leaping.
				</figcaption>
			</figure>
		</section>

		<section class="note-section">
			<p class="note-label">The judging</p>
			<h2>Landed the chord, or did not — and nothing else is marked down</h2>

			<p>
				Two separate questions are answered every bar, and keeping them apart is the whole design.
				<strong>Did you land the chord?</strong> is scored, and it is measured on the guide tones —
				not the root, which the bass is playing, and not the fifth, which nobody misses.
				<strong>Where did your other notes sit?</strong> is reported and never scored, because chromatic
				approach notes and blue notes are good playing and an app that marked them down would be teaching
				the opposite of the truth.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						viewBox="0 0 500 170"
						role="img"
						aria-label="Five notes played over a D minor seventh bar. D and F and C are chord tones; F and C are the guide tones and are the only notes scored. B is a colour note, in the key but not the chord. G-sharp is outside the key. Colour and outside notes are counted but never marked down."
					>
						<text x="0" y="16" class="f-mono f-dim" font-size="10">OVER Dm7, HEARD IN C MAJOR</text>
						{#each PLAYED as p, i (p.note)}
							<rect
								x={i * 100}
								y="34"
								width="84"
								height="42"
								rx="6"
								class="f-line"
								fill="currentColor"
								fill-opacity={p.guide ? '0.16' : '0.04'}
							/>
							<text x={i * 100 + 42} y="60" text-anchor="middle" class="f-display" font-size="15"
								>{p.note}</text
							>
							<text
								x={i * 100 + 42}
								y="92"
								text-anchor="middle"
								class="f-mono f-dim"
								font-size="8.5">{p.kind}</text
							>
							<text x={i * 100 + 42} y="106" text-anchor="middle" class="f-mono" font-size="8.5"
								>{p.scored ? 'scored' : '—'}</text
							>
						{/each}
						<text x="0" y="150" class="f-mono f-dim" font-size="9"
							>guide tones found: 2 of 2 → landed. B and G♯ counted, never subtracted.</text
						>
					</svg>
				</div>
				<figcaption>
					Each chord comes back as <em>landed</em>, <em>partial</em> or <em>missed</em>, from how
					many of its guide tones were heard. A chord you played nothing over is dropped, not failed
					— resting through four bars to hear where the form has got to is something musicians do on
					purpose, and a score that fell every time you lifted your hands would be measuring how
					busy you are.
				</figcaption>
			</figure>
		</section>

		<section class="note-section">
			<p class="note-label">The record</p>
			<h2>Every number on screen traces to a row</h2>

			<p>
				Every run of the transport is written down: the chart, the key, the tempo, how long it
				actually ran, and one row per chord judged — what it was, what it was heard as, and how it
				went. Badges are kept per tune, so &ldquo;fifty in a row&rdquo; means fifty in a row on
				<em>this one</em>. A badge also waits for the form to have been all the way round before it
				lands, so looping two bars of a standard earns nothing however cleanly it goes.
			</p>

			<div class="rule">
				There is no stored &ldquo;best&rdquo;. A streak cannot outlive the transport, so the best
				ever is simply the highest any run reached — which means the number and the badges
				<strong>cannot drift apart.</strong>
			</div>

			<p>
				The profile opens with the twelve keys around the circle of fifths, each swatch filling with
				the chords judged in it, so the pale ones are the corners of the keyboard you have not been
				in. Hours played counts the transport running and not paused, plus practice tasks that
				finished; it never counts a page left open or a workout abandoned halfway. Where a figure
				would have to be estimated, there is no line at all.
			</p>

			<p>
				And there is no daily streak, no calendar of dots, no days-in-a-row counter. A chord streak
				measures playing. A daily streak would measure attendance, and this app has never told
				anyone off.
			</p>
		</section>

		<footer class="note-foot">
			<p class="note-label">Keep reading</p>
			<div class="note-more">
				<a href="/notes">
					<span class="kicker">Back to</span>
					<span class="title">All the notes</span>
				</a>
				<a href="/notes/hue-means-pitch">
					<span class="kicker">Start over · see</span>
					<span class="title">Hue means pitch, and nothing else</span>
				</a>
			</div>

			<div class="note-sources">
				<p class="note-label">Referenced</p>
				<ol>
					<li>
						Kornell, N., &amp; Bjork, R. A. (2008). Learning concepts and categories: Is spacing the
						enemy of induction? <em>Psychological Science</em>.
					</li>
					<li>
						Birnbaum, M. S., Kornell, N., Bjork, E. L., &amp; Bjork, R. A. (2013). Why interleaving
						enhances inductive learning. <em>Memory &amp; Cognition</em>.
					</li>
					<li>
						Krumhansl, C. L., &amp; Kessler, E. J. (1982). Tracing the dynamic changes in perceived
						tonal organization in a spatial representation of musical keys. <em
							>Psychological Review</em
						>.
					</li>
					<li>
						Chenette, T. (2021). What are the truly aural skills? <em>Music Theory Online</em>,
						27.2.
					</li>
					<li>Gordon, E. E. Music Learning Theory — tonal content learning sequence.</li>
					<li>
						Tillmann, B., Bharucha, J. J., &amp; Bigand, E. (2000). Implicit learning of tonality: A
						self-organizing approach. <em>Psychological Review</em>, 107.
					</li>
				</ol>
			</div>
		</footer>
	</div>
</article>
