<script lang="ts">
	/*
	 * Essay two — the curriculum: the ladder, the frontier, spaced repetition,
	 * the daily workout, the crossing exercises and the readiness gate.
	 */

	// The stages, in the order the ladder meets them. `acc` is the signed
	// accidental count: positive sharps, negative flats.
	const STAGES = [
		{ key: 'C', acc: 0 },
		{ key: 'G', acc: 1 },
		{ key: 'F', acc: -1 },
		{ key: 'D', acc: 2 },
		{ key: 'B♭', acc: -2 },
		{ key: 'A', acc: 3 },
		{ key: 'E♭', acc: -3 },
		{ key: 'E', acc: 4 },
		{ key: 'A♭', acc: -4 },
		{ key: 'B', acc: 5 },
		{ key: 'D♭', acc: -5 },
		{ key: 'G♭', acc: -6 }
	].map((s, i) => ({
		...s,
		x: 24 + i * 44,
		y: 92 - s.acc * 12,
		label: s.acc === 0 ? 'home' : `${Math.abs(s.acc)}${s.acc > 0 ? '♯' : '♭'}`
	}));

	const stagePath = 'M ' + STAGES.map((s) => `${s.x + 15} ${s.y}`).join(' L ');

	const RUNGS = [
		['The scale', 'Seven notes. Everything else in the key is built from them.'],
		['The home chord', 'The first, third and fifth. Where the key rests.'],
		['The three main chords', 'I, IV and V. A very large amount of music is only these.'],
		['All seven triads', 'One chord on each note of the scale.'],
		['Adding the seventh', 'One more note on the home chord — folk turning to jazz.'],
		['All seven sevenths', 'The same seven chords, each with its seventh.'],
		['The relative minor', 'The same seven notes, started from the sixth degree.']
	];

	// A 12×7 lattice. `widths[r]` is how many keys rung r is open in, counted in
	// stage order; the array is non-increasing.
	function lattice(widths: number[], ox: number, oy: number, cell = 15, gap = 3) {
		const out: Array<{ x: number; y: number; on: boolean }> = [];
		for (let r = 0; r < 7; r++) {
			for (let s = 0; s < 12; s++) {
				out.push({
					x: ox + s * (cell + gap),
					y: oy + r * (cell + gap),
					on: s < (widths[r] ?? 0)
				});
			}
		}
		return out;
	}

	const CELL = 15;
	const FRONTIER = lattice([5, 3, 3, 2, 1, 1, 1], 0, 0);
	// The same sixteen cells spent as a prefix: two whole keys (14), then two
	// rungs of a third — widths [3,3,2,2,2,2,2].
	const PREFIX = lattice([3, 3, 2, 2, 2, 2, 2], 0, 0);

	const DEEPEN_BEFORE = lattice([3, 1, 0, 0, 0, 0, 0], 0, 0, 13, 3);
	const DEEPEN_AFTER = lattice([4, 2, 1, 0, 0, 0, 0], 0, 0, 13, 3);

	const DIRECTIONS = [
		['see_play', 'Here is the symbol — play it.', 1.0],
		['hear_play', 'Here is the sound — play it back.', 1.0],
		['hear_name', 'Here is the sound — name it.', 1.15],
		['degree_play', '“IV — E♭” — play it, then name what you played.', 1.6],
		['pivot_play', 'One chord in two keys — play the cadence out.', 1.55]
	];

	const WEIGHTS = [...DIRECTIONS]
		.map(([name, , w]) => ({ name: name as string, w: w as number }))
		.sort((a, b) => b.w - a.w);

	// The four near relations out of C major. Laid out N/E/S/W rather than by
	// true circle position, so the labels never collide — this figure is about
	// the relations, not their geometry.
	const NEAR = [
		{ name: 'G', pc: 7, x: 160, y: 52, tag: 'dominant', sub: 'up a fifth', ly: 28 },
		{ name: 'F', pc: 5, x: 160, y: 250, tag: 'subdominant', sub: 'down a fifth', ly: 280 },
		{ name: 'Am', pc: 9, x: 264, y: 150, tag: 'relative', sub: 'same notes', ly: 188 },
		{ name: 'Cm', pc: 0, x: 56, y: 150, tag: 'parallel', sub: '3 notes move', ly: 188 }
	];
</script>

<svelte:head>
	<title>The ladder · Notes · Roundel</title>
	<meta
		name="description"
		content="Roundel's curriculum: a two-axis ladder through the twelve keys, cards that do not exist until you reach them, spaced repetition that weights the hard questions, a workout composed from the date, and a gate that never sets a tune whose chords you have not been shown."
	/>
	<meta property="og:title" content="The ladder, and why it widens before it deepens" />
	<meta
		property="og:description"
		content="A curriculum with two axes instead of one walk, and a workout it composes fresh every morning."
	/>
	<meta property="og:type" content="article" />
</svelte:head>

<article class="note">
	<header class="note-hero">
		<p class="note-eyebrow">Notes · drill · the exercises</p>
		<h1>The ladder, and why it widens before it deepens</h1>
		<p class="note-standfirst">
			There is no scheduler deciding which of twelve keys to ambush you with. There is a ladder, you
			are somewhere on it, and it only ever suggests. What it suggests is shaped by a small pile of
			research on how practice actually sticks — and by one bug, years ago, that asked somebody
			about chords nobody had shown them.
		</p>
	</header>

	<div class="note-body">
		<section class="note-section">
			<p class="note-label">The keys</p>
			<h2>C first, then one accidental at a time</h2>

			<p>
				The order the ladder meets the keys in is the circle of fifths, opened outwards from C,
				alternating the sharp and flat sides. Each step adds exactly one accidental. This is how
				keys have been taught for about three hundred years, and it is a great deal gentler than
				jumping to B because a scheduler noticed it was cold.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="wide"
						viewBox="0 0 560 180"
						role="img"
						aria-label="Twelve keys along a line in learning order: C, G, F, D, B-flat, A, E-flat, E, A-flat, B, D-flat, G-flat. Sharp keys rise above the centre line, flat keys fall below it, further from centre as the accidentals pile up."
					>
						<line x1="20" y1="92" x2="545" y2="92" class="f-faint" stroke-opacity="0.2" />
						<path d={stagePath} class="f-line" stroke-width="1.25" fill="none" />
						{#each STAGES as s (s.key)}
							<circle
								cx={s.x + 15}
								cy={s.y}
								r="13"
								stroke="currentColor"
								fill="var(--color-ground-overlay)"
							/>
							<text
								x={s.x + 15}
								y={s.y + 4}
								text-anchor="middle"
								class="f-display"
								font-size="11"
								font-weight="600">{s.key}</text
							>
							<text
								x={s.x + 15}
								y={s.acc >= 0 ? s.y - 20 : s.y + 28}
								text-anchor="middle"
								class="f-mono f-dim"
								font-size="8.5">{s.label}</text
							>
						{/each}
						<text x="20" y="168" class="f-mono f-dim" font-size="9">learning order →</text>
					</svg>
				</div>
				<figcaption>
					The zigzag is the alternation: G adds one sharp, F one flat, D a second sharp, B♭ a second
					flat, and so on out to G♭ at six. That order is kept for a first meeting only — once you
					know a key, the reasons to visit it next are different, and the app has other orderings
					for the hands and for the ear.
				</figcaption>
			</figure>

			<h3>Seven small steps in each key</h3>
			<p>A rung is mostly the previous rung plus one idea. They overlap on purpose.</p>

			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>Rung</th><th>What it is</th></tr>
					</thead>
					<tbody>
						{#each RUNGS as [name, teaches], i (name)}
							<tr>
								<td class="num">{i + 1}</td>
								<td><strong>{name}.</strong> {teaches}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p>
				Chord progressions used to be rungs here too. They moved out into their own section, because
				learning what is in a key and learning how chords move within it are different jobs and
				mixing them made both muddier.
			</p>
		</section>

		<section class="note-section">
			<p class="note-label">The frontier</p>
			<h2>Two axes, not one walk</h2>

			<p class="lede">
				Depth is what you can do — the seven rungs. Breadth is where you can do it — the twelve
				keys. For a long time those were a single ordering: finish every rung of C, then every rung
				of G, then start on F. Everything you had reached was a <em>prefix</em> of that one walk.
			</p>

			<p>
				Three things followed, and none was a bug. The second key cost seven full steps of the
				first. Nothing outside the prefix existed, so there was nothing in another key to compare
				against. And the one drill that spreads its questions across keys had exactly one key to
				spread over on the second rung — the app was at its most blocked precisely when the learner
				was newest.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="wide"
						viewBox="0 0 560 220"
						role="img"
						aria-label="Two twelve-by-seven grids, each holding sixteen filled cells. On the left the filled cells form a tall block — two whole keys and two rungs of a third. On the right they form a wide staircase — five keys of the first rung, three of the next, tapering to one."
					>
						<text x="0" y="14" class="f-mono f-dim" font-size="10">TODAY'S RECORD — a prefix</text>
						<g transform="translate(0 26)">
							{#each PREFIX as c (`${c.x},${c.y}`)}
								<rect
									x={c.x}
									y={c.y}
									width={CELL}
									height={CELL}
									rx="2.5"
									class="f-faint"
									fill="currentColor"
									fill-opacity={c.on ? '0.9' : '0'}
									stroke-opacity={c.on ? '0' : '0.22'}
								/>
							{/each}
							<text x="0" y="150" class="f-mono f-dim" font-size="9">deep in one place</text>
						</g>

						<text x="320" y="14" class="f-mono f-dim" font-size="10">A FRONTIER — a staircase</text>
						<g transform="translate(320 26)">
							{#each FRONTIER as c (`${c.x},${c.y}`)}
								<rect
									x={c.x}
									y={c.y}
									width={CELL}
									height={CELL}
									rx="2.5"
									class="f-faint"
									fill="currentColor"
									fill-opacity={c.on ? '0.9' : '0'}
									stroke-opacity={c.on ? '0' : '0.22'}
								/>
							{/each}
							<text x="0" y="150" class="f-mono f-dim" font-size="9">shallow across several</text>
						</g>
					</svg>
				</div>
				<figcaption>
					The same sixteen open cells, spent two ways. The prefix goes deep in one key and leaves
					the function drill nothing to spread across; the frontier spends them on a staircase, so
					every rung you know has at least one other key to be heard against. Neither shape asks
					anything that has not been introduced — the frontier is still a set the app opened on
					purpose.
				</figcaption>
			</figure>

			<h3>Going deeper drags breadth along behind it</h3>
			<p>
				The widths array is <em>non-increasing</em>: a rung is never open in more keys than the rung
				above it. You cannot be four rungs deep in a key whose scale you have never played. Opening
				the next rung is a single move that also opens one more key of every rung above it — so the
				staircase builds itself, and it is impossible to be deep and narrow.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						viewBox="0 0 460 150"
						role="img"
						aria-label="Two small grids. Before: the first rung open in three keys, the second in one. After: the first rung in four keys, the second in two, and a third rung newly open in one key."
					>
						<text x="0" y="12" class="f-mono f-dim" font-size="10">BEFORE</text>
						<g transform="translate(0 22)">
							{#each DEEPEN_BEFORE as c (`${c.x},${c.y}`)}
								<rect
									x={c.x}
									y={c.y}
									width="13"
									height="13"
									rx="2"
									class="f-faint"
									fill="currentColor"
									fill-opacity={c.on ? '0.9' : '0'}
									stroke-opacity={c.on ? '0' : '0.2'}
								/>
							{/each}
						</g>

						<text x="235" y="66" class="f-display" font-size="20">→</text>

						<text x="270" y="12" class="f-mono f-dim" font-size="10">AFTER ONE MOVE</text>
						<g transform="translate(270 22)">
							{#each DEEPEN_AFTER as c (`${c.x},${c.y}`)}
								<rect
									x={c.x}
									y={c.y}
									width="13"
									height="13"
									rx="2"
									class="f-faint"
									fill="currentColor"
									fill-opacity={c.on ? '0.9' : '0'}
									stroke-opacity={c.on ? '0' : '0.2'}
								/>
							{/each}
						</g>
					</svg>
				</div>
				<figcaption>
					One press of &ldquo;go deeper&rdquo;: a new rung opens in the first key, and the two rungs
					above it each gain a key. Do it seven times and you have the same seven rungs the old walk
					reached in seven steps — with twenty-one cells of breadth underneath them that the old
					walk never had.
				</figcaption>
			</figure>
		</section>

		<section class="note-section">
			<p class="note-label">The cards</p>
			<h2>Nothing exists until it is reached</h2>

			<p>
				The previous version made every card in every key up front — around three thousand of them,
				all due immediately, including altered dominants and quartal voicings. The scheduler
				dutifully served whatever was coldest, which is how a practice session ended up asking about
				chords nobody had been shown, in keys nobody had played. A comment at the top of the file
				still records what that felt like: <em
					>a good way to make someone feel stupid about an instrument they can already play.</em
				>
			</p>

			<p>
				Now a brand-new account owns exactly one rung's worth of cards: the C major scale. Each cell
				of the frontier generates a handful of cards — one per honest question it can ask — and a
				scale has fewer than a chord, because you cannot be asked to <em>name</em> a scale as a chord
				shape.
			</p>

			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>Direction</th><th>What it asks</th><th>Weight</th></tr>
					</thead>
					<tbody>
						{#each DIRECTIONS as [name, asks, w] (name)}
							<tr>
								<td class="num">{name}</td>
								<td>{asks}</td>
								<td class="num">{w}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="note-section">
			<p class="note-label">Spaced repetition</p>
			<h2>The scheduler is borrowed; the choice of what to ask is not</h2>

			<p>
				Scheduling is FSRS, from a library rather than hand-rolled — its edge cases around same-day
				reviews and retrievability at zero elapsed time are exactly where a home-made version is
				<em>silently</em> wrong, and a scheduler quietly mis-scheduling is the worst failure here because
				nothing on screen would ever reveal it. Two of its knobs are turned off: fuzz, which only matters
				for thousand-card decks, and sub-day learning steps, which mean nothing to an app you practise
				once a day.
			</p>

			<p>
				What the app owns is the decision about which <em>due</em> card to put in front of you. Overdue-ness
				dominates, then a per-direction weight, then whether the key is one you have been avoiding — a
				card barely due in a neglected key can outrank one slightly more overdue in a comfortable one.
				The weights are a selection preference, never a change to the algorithm: distorting FSRS's intervals
				would corrupt its model of your memory; changing which due card gets picked does not.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						viewBox="0 0 480 230"
						role="img"
						aria-label="A bar chart of the direction weights. degree_play is heaviest at 1.6, then pivot_play at 1.55, hear_name 1.15, and see_play and hear_play tied at 1.0."
					>
						{#each WEIGHTS as d, i (d.name)}
							<text x="0" y={20 + i * 26} class="f-mono" font-size="10">{d.name}</text>
							<rect
								x="120"
								y={10 + i * 26}
								width={(d.w - 0.8) * 320}
								height="14"
								rx="2"
								class="f-fill"
								opacity="0.85"
							/>
							<text
								x={120 + (d.w - 0.8) * 320 + 8}
								y={21 + i * 26}
								class="f-mono f-dim"
								font-size="9.5">{d.w.toFixed(2)}</text
							>
						{/each}
					</svg>
				</div>
				<figcaption>
					Play-to-name leads, because being able to play a thing you cannot name is the problem the
					whole app exists to fix, and a numeral with its key beside it is the question that asks
					it. The hinge is just behind: the only direction with two keys in it, and the only one
					whose answer is a chord you have to find rather than one you were shown.
				</figcaption>
			</figure>

			<p>
				Correctness is judged from the pitch classes; the grade is then set by how long it took.
				Latency is the measurement that matters, so it separates &ldquo;good&rdquo; from
				&ldquo;easy&rdquo; rather than a self-report nobody makes honestly under time pressure.
			</p>
		</section>

		<section class="note-section">
			<p class="note-label">The workout</p>
			<h2>Three to seven tasks, composed fresh from the date</h2>

			<p>
				Today is a workout, not a timer. Each task ends because its goal is met — ten questions
				answered, a bar of a tune cleared — rather than because a clock ran out. Composition is
				seeded on the calendar day and nothing else, so reloading resumes the same workout and
				tomorrow's is genuinely different.
			</p>

			<p>
				One rule decides what is in it: <strong>if the band can ask it, the band asks it.</strong>
			</p>

			<p>
				That rule is why the first task disappears. Reading a chord symbol and playing it is exactly
				what the play-along page asks all day with a rhythm section behind it — so it is worth
				asking here only while the symbol is still new, and a shape you have shown you can play
				drops out of the pool and does not come back until you fail it. On the morning after the
				ladder moves, the new shapes arrive first and the rest of the workout is unchanged: meeting
				the material is not one of the day's exercises, so it does not take one away.
			</p>

			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>Task</th><th>What it asks</th></tr>
					</thead>
					<tbody>
						<tr>
							<td><strong>On sight</strong></td>
							<td
								>Six symbols, read and played. Only shapes you have not shown you can play yet, so
								most mornings there are none.</td
							>
						</tr>
						<tr>
							<td><strong>Ear</strong></td>
							<td>Ten questions: listen and play it back, or listen and name it.</td>
						</tr>
						<tr>
							<td><strong>Function</strong></td>
							<td
								>Eight degrees, spread round-robin across keys: &ldquo;IV — E♭&rdquo;, played then
								named.</td
							>
						</tr>
						<tr>
							<td><strong>The hinge</strong></td>
							<td>Six key questions: one chord, doing a job in each of two keys.</td>
						</tr>
						<tr>
							<td><strong>Mission</strong></td>
							<td
								>The play-along page itself, under a key, a tempo floor, a groove and a bar to
								clear.</td
							>
						</tr>
						<tr>
							<td><strong>One new thing</strong></td>
							<td
								>A single unseen item — the next rung, a progression, a groove. Shown once, tried
								once.</td
							>
						</tr>
					</tbody>
				</table>
			</div>

			<p>
				A task never runs out of questions. The ear task fills its ten from the due pile first, then
				near-due, then any reached material it has not asked yet — so &ldquo;nothing due
				today&rdquo; is not a sentence it can produce, which is what a well-scheduled deck used to
				say most days. The function and crossing tasks then spread what they have across keys,
				because a numeral means the same thing in all twelve and eight of them in one key is a
				spelling drill wearing a Roman numeral.
			</p>
		</section>

		<section class="note-section">
			<p class="note-label">The crossings</p>
			<h2>Getting from one key to another, as a thing to practise</h2>

			<p>
				The ladder teaches what is <em>inside</em> a key. The progression library teaches how chords
				move <em>within</em> one. Nothing taught the third thing — how you get from one key to
				another and how you know when you have — because the curriculum had no object for it. A
				<code>Crossing</code> is that object: two keys and the relation between them.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="compact"
						viewBox="0 0 320 310"
						role="img"
						aria-label="C major at the centre, with its four near relations around it: the dominant G above, the subdominant F below, the relative A minor to the right, and the parallel C minor to the left."
					>
						{#each NEAR as n (n.tag)}
							<line x1="160" y1="150" x2={n.x} y2={n.y} class="f-faint" stroke-opacity="0.3" />
						{/each}

						<circle cx="160" cy="150" r="17" fill="var(--pc-0)" />
						<text
							x="160"
							y="155"
							text-anchor="middle"
							class="f-display"
							font-size="13"
							font-weight="700"
							fill="var(--pc-0-ink)">C</text
						>

						{#each NEAR as n (n.tag)}
							<circle cx={n.x} cy={n.y} r="15" fill={`var(--pc-${n.pc})`} />
							<text
								x={n.x}
								y={n.y + 4}
								text-anchor="middle"
								class="f-display"
								font-size="10.5"
								font-weight="700"
								fill={`var(--pc-${n.pc}-ink)`}>{n.name}</text
							>
							<text x={n.x} y={n.ly} text-anchor="middle" class="f-mono" font-size="9">{n.tag}</text
							>
							<text x={n.x} y={n.ly + 13} text-anchor="middle" class="f-mono f-dim" font-size="8"
								>{n.sub}</text
							>
						{/each}
					</svg>
				</div>
				<figcaption>
					The four near relations, in the order the research puts them: the relative first, because
					nothing moves; then the dominant, the move the whole system is built to make; the
					subdominant, which feels different going the other way; and the parallel last, where the
					tonic holds still but three notes move.
				</figcaption>
			</figure>

			<p>
				Three exercises came out of it and <strong>one of them is left</strong>. Two played cadences
				in an unnamed key and asked you to play the note they came home to — the probe-tone
				experiment turned into a drill, and a drill that turned out to be nobody&rsquo;s first
				morning. A single note is inside everyone&rsquo;s vocabulary, which was the argument for
				opening them on day one; but the <em>question</em> was three triads a beginner had never
				been shown, and a first workout that led with six of them taught nothing except that this
				app is too hard. They are withdrawn.
				<strong>Turn the corner</strong> survives: it gives you a chord that belongs to both keys
				and asks you to play the cadence that lands in the new one. It is read rather than heard,
				and it waits for the rung that teaches sevenths — because a pivot chord <em>is</em> a seventh,
				and an exercise that cannot arrive before its material is the rule the rest of this ladder has
				always kept.
			</p>

			<div class="evidence">
				<cite>Kornell &amp; Bjork 2008 · Birnbaum et al. 2013</cite>
				<p>
					Interleaving confusable categories helps you tell them apart, and the active ingredient is <strong
						>discrimination</strong
					> — putting two similar things side by side so the difference becomes visible. Twelve keys are
					about as confusable as categories get, which is why the crossing task spreads its six questions
					across as many keys as it can rather than asking about one key six times.
				</p>
			</div>

			<div class="evidence">
				<cite>Chenette 2021 · Music Theory Online 27.2</cite>
				<p>
					Aural curricula are over-fitted to notation, and what listeners report actually using is
					the bass line and the cadence. The key-planting cadence is three root-position triads
					falling home — IV–V–I — and nothing else.
				</p>
			</div>
		</section>

		<section class="note-section">
			<p class="note-label">The readiness gate</p>
			<h2>Never a tune whose chords you have not been shown</h2>

			<p>
				A mission is the real play-along page under a constraint — and only ever set on a tune the
				app can prove you are ready for. Not with a difficulty number typed onto each chart: a
				hand-written rating drifts the moment a grid is edited and cannot say <em>which</em> chord is
				the problem. Instead a chart derives its own demand from the grid it already has, the ladder and
				the library derive what they teach from the chords they already build, and a mission is set only
				where the second covers the first.
			</p>

			<p>There are four ways to be lost, so the demand has four axes:</p>

			<div class="table-wrap">
				<table>
					<thead>
						<tr><th>Axis</th><th>The question</th><th>Taught by</th></tr>
					</thead>
					<tbody>
						<tr>
							<td>Shape</td>
							<td>Can your hands make this chord at all?</td>
							<td>The seven rungs</td>
						</tr>
						<tr>
							<td>Device</td>
							<td
								>How does a chord colour its way out of the key — a blues seventh, a borrowed iv, a
								secondary dominant?</td
							>
							<td>The progressions, one per level</td>
						</tr>
						<tr>
							<td>Crossing</td>
							<td>Does the tune actually change key, and to where?</td>
							<td>The crossing exercises</td>
						</tr>
						<tr>
							<td>Tonality</td>
							<td>Is it in a major key or a minor one — and have you been shown a minor key?</td>
							<td>The relative-minor rung, and only that</td>
						</tr>
					</tbody>
				</table>
			</div>

			<p>
				Where what you know does not cover what a tune asks, there is no mission — and instead of a
				locked door, the workout names the nearest tune, says exactly what it wants that you have
				not met (&ldquo;a dominant seventh, and a move to the dominant&rdquo;) and which progression
				teaches it. A page that can only say <em>not yet</em> is a locked door; a page that can say
				<em>you have not met a dominant seventh</em> is a curriculum.
			</p>
		</section>

		<footer class="note-foot">
			<p class="note-label">Keep reading</p>
			<div class="note-more">
				<a href="/notes/naming-and-counting">
					<span class="kicker">Next · hear · apply</span>
					<span class="title">Naming what you play, and counting it honestly</span>
				</a>
				<a href="/notes/hue-means-pitch">
					<span class="kicker">Back · see</span>
					<span class="title">Hue means pitch, and nothing else</span>
				</a>
			</div>
		</footer>
	</div>
</article>
