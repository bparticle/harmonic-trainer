<script lang="ts">
	/*
	 * Essay one — the music core and the wheel.
	 *
	 * Figures are hand-drawn SVG rather than the live components: they have to
	 * hold still and be read, and half of them describe a state the real wheel
	 * only passes through. Everything is `currentColor` except a genuine pitch
	 * swatch, which is `var(--pc-N)` — the one colour rule, kept.
	 *
	 * All geometry is resolved here in the script: Svelte only allows `{@const}`
	 * as a direct child of a block, not inside a bare `<svg>`.
	 */

	// The circle of fifths, clockwise from twelve o'clock: note name, pitch class.
	const FIFTHS = [
		{ name: 'C', pc: 0 },
		{ name: 'G', pc: 7 },
		{ name: 'D', pc: 2 },
		{ name: 'A', pc: 9 },
		{ name: 'E', pc: 4 },
		{ name: 'B', pc: 11 },
		{ name: 'F♯', pc: 6 },
		{ name: 'D♭', pc: 1 },
		{ name: 'A♭', pc: 8 },
		{ name: 'E♭', pc: 3 },
		{ name: 'B♭', pc: 10 },
		{ name: 'F', pc: 5 }
	];

	type Dot = { name: string; pc: number; x: number; y: number };

	function ring(cx: number, cy: number, r: number): Dot[] {
		return FIFTHS.map((note, i) => {
			const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
			return { ...note, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
		});
	}

	const point = (i: number, cx: number, cy: number, r: number) => {
		const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
		return { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r };
	};

	// Swatch strip: the twelve colours in pitch order, naturals tall.
	const SWATCHES = [...FIFTHS]
		.sort((a, b) => a.pc - b.pc)
		.map((s, i) => ({
			...s,
			natural: [0, 2, 4, 5, 7, 9, 11].includes(s.pc),
			x: 24 + i * 44
		}));

	// The wheel schematic: rings, faint spokes, and one bold spoke that spells C°7.
	const RINGS = [128, 96, 64, 34];
	const SPOKES = [...Array(12).keys()].map((i) => ({
		outer: point(i, 150, 150, 132),
		inner: point(i, 150, 150, 30)
	}));
	const DIM_SPOKE = [
		{ y: 150 - 128, pc: 0, name: 'C' },
		{ y: 150 - 96, pc: 3, name: 'E♭' },
		{ y: 150 - 64, pc: 6, name: 'G♭' },
		{ y: 150 - 34, pc: 9, name: 'A' }
	];

	// The rotation figure: ii–V–I roots as circle-of-fifths positions.
	const WHEEL = ring(200, 150, 118);
	const triPath = (positions: number[]) =>
		positions
			.map((p, i) => `${i === 0 ? 'M' : 'L'} ${WHEEL[p].x.toFixed(1)} ${WHEEL[p].y.toFixed(1)}`)
			.join(' ') + ' Z';
	const IN_C = triPath([2, 1, 0]); // Dm7 · G7 · C
	const IN_G = triPath([3, 2, 1]); // Am7 · D7 · G

	// Keyboard: one octave, C to C. The E♭ major scale is lit, spelled from the key.
	const WHITE = [
		{ x: 0, lit: true, label: 'C' },
		{ x: 34, lit: true, label: 'D' },
		{ x: 68, lit: false, label: '' },
		{ x: 102, lit: true, label: 'F' },
		{ x: 136, lit: true, label: 'G' },
		{ x: 170, lit: false, label: '' },
		{ x: 204, lit: false, label: '' },
		{ x: 238, lit: true, label: 'C' }
	];
	const BLACK = [
		{ x: 24, lit: false, label: '' },
		{ x: 58, lit: true, label: 'E♭' },
		{ x: 126, lit: false, label: '' },
		{ x: 160, lit: true, label: 'A♭' },
		{ x: 194, lit: true, label: 'B♭' }
	];

	// Brightness: the seven modes as a contiguous seven-of-twelve block that
	// slides one step darker (anticlockwise) each row.
	const MODES = [
		{ name: 'Lydian', start: 5 },
		{ name: 'Ionian — major', start: 4 },
		{ name: 'Mixolydian', start: 3 },
		{ name: 'Dorian', start: 2 },
		{ name: 'Aeolian — minor', start: 1 },
		{ name: 'Phrygian', start: 0 },
		{ name: 'Locrian', start: 11 }
	].map((m) => ({
		name: m.name,
		slots: [...Array(12).keys()].map((slot) => (((slot - m.start) % 12) + 12) % 12 < 7)
	}));
</script>

<svelte:head>
	<title>Hue means pitch · Notes · Roundel</title>
	<meta
		name="description"
		content="How Roundel represents music: notes spelled not numbered, twelve pitch-class colours derived from seven, and a wheel built from five stacked circles of fifths so that a chord is a rigid shape you can rotate into any key."
	/>
	<meta property="og:title" content="Hue means pitch, and nothing else" />
	<meta
		property="og:description"
		content="Notes spelled not numbered, twelve colours from seven, and a wheel where a chord is a shape you rotate."
	/>
	<meta property="og:type" content="article" />
</svelte:head>

<article class="note">
	<header class="note-hero">
		<p class="note-eyebrow">Notes · see · the wheel</p>
		<h1>Hue means pitch, and nothing else</h1>
		<p class="note-standfirst">
			Before the app can teach you anything it has to decide what a note is, what a key is, and what
			the colours on screen are allowed to mean. Those three decisions turn out to carry most of the
			design — and they are the reason a chord on the wheel is a shape you can pick up and put down
			in another key.
		</p>
	</header>

	<div class="note-body">
		<section class="note-section">
			<p class="note-label">The representation</p>
			<h2>A note is a letter, an alteration and an octave</h2>

			<p class="lede">
				It is not a number. Middle C is <code>{'{ letter: "C", alter: 0, octave: 4 }'}</code>, and
				its pitch class (0–11) and its MIDI number (60) are <em>derived</em> from that — never the other
				way round.
			</p>

			<p>
				This sounds like a technicality and is the single most load-bearing choice in the whole
				music core. The moment a note becomes an integer, the fact that distinguishes A♭ from G♯ is
				gone, and nothing downstream gets it back. They sound the same; they are not the same note.
				A♭ is a kind of A. G♯ is a kind of G. Which one you mean depends on the key, and the
				difference has to survive being transposed.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="compact"
						viewBox="0 0 316 210"
						role="img"
						aria-label="A one-octave piano keyboard. The seven keys of the E-flat major scale are outlined: E-flat, F, G, A-flat, B-flat, C, D. The fourth degree is marked A-flat, on the black key more often called G-sharp."
					>
						<g transform="translate(20 40)">
							{#each WHITE as key (key.x)}
								<rect
									x={key.x}
									y="0"
									width="32"
									height="150"
									rx="3"
									fill="currentColor"
									fill-opacity={key.lit ? '0.92' : '0.62'}
								/>
								{#if key.lit}
									<rect
										x={key.x}
										y="0"
										width="32"
										height="150"
										rx="3"
										fill="none"
										stroke="currentColor"
										stroke-width="2.5"
									/>
								{/if}
							{/each}
							{#each BLACK as key (key.x)}
								<rect
									x={key.x}
									y="0"
									width="19"
									height="94"
									rx="2"
									fill="var(--color-ground)"
									stroke="currentColor"
									stroke-opacity={key.lit ? '1' : '0.35'}
									stroke-width={key.lit ? '2.5' : '1'}
								/>
							{/each}

							<path
								d="M 160 -12 L 160 -4 L 179 -4 L 179 -12"
								class="f-faint"
								stroke-opacity="0.7"
								fill="none"
							/>
							<text x="169.5" y="-18" text-anchor="middle" class="f-mono" font-size="10"
								>degree 4 = A♭</text
							>
						</g>
					</svg>
				</div>
				<figcaption>
					The scale of E♭ major, built by stacking spelled intervals up from the tonic: E♭ F G A♭ B♭
					C D. The fourth step is a <em>kind of A</em>, so it is A♭ — even though the black key it
					lands on is more often called G♯. Store that note as the integer 8 and you have thrown the
					letter away.
				</figcaption>
			</figure>

			<h3>Intervals carry the same information</h3>
			<p>
				An interval is a <em>diatonic step count</em> paired with a semitone count, not just a
				number of semitones. A♭ and G♯ are the same distance from C in semitones, but one is a minor
				sixth — five steps — and the other an augmented fifth — four steps. Transpose a note up by
				each and you land on a different letter. Semitones alone cannot express that, which is why
				scales here are built by stacking named intervals from the tonic and never by picking notes
				off a chromatic list. It is also why G♭ major comes out with a C♭ in it: the fourth degree
				of G♭ <em>is</em> a kind of C, and the spelling follows.
			</p>
		</section>

		<section class="note-section">
			<p class="note-label">The palette</p>
			<h2>Twelve colours, and only seven of them are chosen</h2>

			<p>
				Every pitch class has a colour, and colour is the app's <strong>only</strong> colour language.
				The rule is strict: a colour has to be derived from a pitch or it does not get to be a colour.
				A key wears its tonic's colour. A badge wears the chord that earned it. Anything with no pitch
				in it — whether a chord landed, how many questions were graded, which task you are on — is drawn
				in weight instead: ink, dimmer ink, a dashed outline.
			</p>

			<div class="rule">
				The test of this rule is meant to be uncomfortable. If a screen looks grey and the only
				available fix is a colour that stands for nothing, <strong>it stays grey.</strong>
			</div>

			<p>
				Only the seven diatonic notes — C D E F G A B — have an authored colour, tuned in OKLCH so
				that dragging one in the colour editor changes its lightness without swinging its hue. The
				five chromatic notes are <em>interpolated</em>: each sits at the midpoint between its two
				neighbours, in colour exactly as it does on the wheel. Edit &ldquo;green&rdquo; and F♯
				follows it.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="wide"
						viewBox="0 0 560 140"
						role="img"
						aria-label="Twelve colour swatches in a row. The seven natural notes are tall and marked 'anchor'; the five sharps and flats between them are shorter and marked 'mid', each mixed from the two anchors on either side."
					>
						{#each SWATCHES as sw (sw.pc)}
							<rect
								x={sw.x}
								y={sw.natural ? 18 : 34}
								width="34"
								height={sw.natural ? 62 : 46}
								rx="4"
								fill={`var(--pc-${sw.pc})`}
							/>
							<text
								x={sw.x + 17}
								y="98"
								text-anchor="middle"
								class="f-display"
								font-size="11"
								font-weight="600">{sw.name}</text
							>
							<text x={sw.x + 17} y="114" text-anchor="middle" class="f-mono f-dim" font-size="8"
								>{sw.natural ? 'anchor' : 'mid'}</text
							>
						{/each}
					</svg>
				</div>
				<figcaption>
					Seven anchors, five midpoints. Interpolating two in-gamut colours does not give an
					in-gamut colour — F♯, halfway between green and blue, lands on a cyan sRGB cannot reach at
					that lightness — so the chroma is pulled in until it fits while the hue and lightness are
					held exactly. It still reads as &ldquo;between F and G&rdquo;.
				</figcaption>
			</figure>
		</section>

		<section class="note-section">
			<p class="note-label">The wheel</p>
			<h2>Five circles of fifths, stacked and turned</h2>

			<p class="lede">
				Angular position on the wheel is the circle of fifths. Moving inward one ring is a fixed
				number of fifths — three, by default — which works out as a minor third. Two consequences
				fall straight out of that, and both are on screen because they are the point.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="wide"
						viewBox="0 0 560 300"
						role="img"
						aria-label="A schematic of the wheel: four concentric rings and twelve radial spokes. One spoke is drawn bold, with four coloured dots down it labelled C, E-flat, G-flat, A — a C diminished seventh chord. A note says the fifth ring repeats the first."
					>
						{#each RINGS as r (r)}
							<circle cx="150" cy="150" {r} class="f-faint" fill="none" />
						{/each}
						{#each SPOKES as s, i (i)}
							<line
								x1={s.inner.x}
								y1={s.inner.y}
								x2={s.outer.x}
								y2={s.outer.y}
								class="f-faint"
								stroke-opacity="0.16"
							/>
						{/each}

						<line x1="150" y1="18" x2="150" y2="150" class="f-line" stroke-width="1.5" />
						{#each DIM_SPOKE as cell (cell.pc)}
							<circle cx="150" cy={cell.y} r="13" fill={`var(--pc-${cell.pc})`} />
							<text
								x="150"
								y={cell.y + 4}
								text-anchor="middle"
								class="f-display"
								font-size="11"
								font-weight="700"
								fill={`var(--pc-${cell.pc}-ink)`}>{cell.name}</text
							>
						{/each}

						<text x="320" y="42" class="f-mono f-dim" font-size="11">A RADIAL SPOKE</text>
						<text x="320" y="66" class="f-display" font-size="15" font-weight="600"
							>C E♭ G♭ A = C°7</text
						>
						<text x="320" y="90" class="f-mono" font-size="10.5" opacity="0.75"
							>three fifths inward = one minor third</text
						>

						<line x1="320" y1="132" x2="545" y2="132" class="f-faint" stroke-opacity="0.2" />

						<text x="320" y="164" class="f-mono f-dim" font-size="11">AND</text>
						<text x="320" y="188" class="f-display" font-size="14" font-weight="600"
							>ring 5 repeats ring 1</text
						>
						<text x="320" y="212" class="f-mono" font-size="10.5" opacity="0.75"
							>four distinct rings, then it comes round</text
						>
					</svg>
				</div>
				<figcaption>
					A straight line out from the centre spells a diminished seventh chord, and the fifth ring
					duplicates the first. Neither is hidden: they are what make diminished symmetry and
					tritone substitution something you can see rather than something you have to be told.
					Nothing in this drawing knows a key — it is all derived from intervals.
				</figcaption>
			</figure>

			<h3>Which is why a chord is a shape you can rotate</h3>
			<p>
				A chord's shape on the wheel is computed from its intervals as a set of cell offsets from
				its root. The result depends only on the intervals, never on the key. So transposing a
				progression <em>rotates the picture</em> and recomputes nothing — the shape of a ii–V–I is rigid,
				and moving it from C to G is a turn of the wheel.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="wide"
						viewBox="0 0 560 300"
						role="img"
						aria-label="The circle of fifths with twelve coloured note dots. A solid triangle connects D, G and C — a two-five-one in C. A dashed triangle of the identical shape connects A, D and G — the same progression in G, rotated one step clockwise."
					>
						{#each WHEEL as note (note.pc)}
							<circle cx={note.x} cy={note.y} r="14" fill={`var(--pc-${note.pc})`} />
							<text
								x={note.x}
								y={note.y + 4}
								text-anchor="middle"
								class="f-display"
								font-size="11"
								font-weight="700"
								fill={`var(--pc-${note.pc}-ink)`}>{note.name}</text
							>
						{/each}

						<path
							d={IN_C}
							class="f-line"
							stroke-width="1.75"
							fill="currentColor"
							fill-opacity="0.06"
						/>
						<path d={IN_G} class="f-line" stroke-width="1.5" stroke-dasharray="5 4" fill="none" />

						<text x="410" y="118" class="f-mono f-dim" font-size="10.5">SOLID</text>
						<text x="410" y="136" class="f-display" font-size="13" font-weight="600"
							>ii–V–I in C</text
						>
						<text x="410" y="152" class="f-mono" font-size="10" opacity="0.7">Dm7 · G7 · C</text>
						<text x="410" y="186" class="f-mono f-dim" font-size="10.5">DASHED</text>
						<text x="410" y="204" class="f-display" font-size="13" font-weight="600"
							>the same, in G</text
						>
						<text x="410" y="220" class="f-mono" font-size="10" opacity="0.7">Am7 · D7 · G</text>
						<text x="410" y="250" class="f-mono" font-size="10" opacity="0.7">one step round.</text>
						<text x="410" y="264" class="f-mono" font-size="10" opacity="0.7"
							>nothing recomputed.</text
						>
					</svg>
				</div>
				<figcaption>
					The two triangles are congruent because the shape is a fact about the intervals, not about
					the key. This is what &ldquo;everything transposes&rdquo; means in practice: the
					relationship is stored once and turned into a key at the last moment.
				</figcaption>
			</figure>
		</section>

		<section class="note-section">
			<p class="note-label">The overlays</p>
			<h2>The same geometry, read several ways</h2>

			<p>
				Every overlay drawn on the wheel is derived from the music core, and none of them hardcodes
				a key. The current key lights its seven-note scale shape and writes a degree numeral on each
				cell — <code>I</code>, <code>ii</code>, <code>V</code> — because the numeral is what transfers:
				ii–V–I is the same idea in all twelve keys, and Dm7–G7–C is not.
			</p>

			<h3>Brightness is a block that slides</h3>
			<p>
				Any diatonic scale is seven <em>consecutive</em> positions on the circle of fifths, so it reads
				on the wheel as one contiguous block. Darkening the mode — flattening one more degree — slides
				that block a single step anticlockwise. Lydian is as far bright as it goes; Locrian as far dark.
			</p>

			<figure>
				<div class="figure-frame">
					<svg
						class="wide"
						viewBox="0 0 560 245"
						role="img"
						aria-label="Seven rows, one per mode from Lydian at the top to Locrian at the bottom. Each row is a strip of twelve slots with a contiguous block of seven shaded; the block moves one slot to the left with each darker mode."
					>
						{#each MODES as mode, row (mode.name)}
							<text x="12" y={34 + row * 30} class="f-mono" font-size="10">{mode.name}</text>
							{#each mode.slots as inBlock, slot (slot)}
								<rect
									x={180 + slot * 28}
									y={20 + row * 30}
									width="25"
									height="20"
									rx="2"
									class="f-faint"
									fill="currentColor"
									fill-opacity={inBlock ? '0.82' : '0'}
									stroke-opacity={inBlock ? '0' : '0.22'}
								/>
							{/each}
						{/each}
						<text x="180" y="240" class="f-mono f-dim" font-size="9"
							>← anticlockwise · brighter · sharper</text
						>
					</svg>
				</div>
				<figcaption>
					One degree flatter per row. The block never breaks — a diatonic scale is always seven
					fifths in a row — it only shifts, and the shift is the brightness axis the wheel draws as
					a clockwise arc.
				</figcaption>
			</figure>

			<h3>Modulation is two blocks and what they share</h3>
			<p>
				Ask the wheel about two keys and it returns their distance in fifths, the notes they have in
				common, and every chord that is diatonic in both — the hinges a modulation can turn on, each
				with its numeral in the key you are leaving and the key you are arriving in. C to G shares
				six of seven notes and several chords; C to G♭ shares two notes and no chord at all, and an
				empty list is a real answer — it is <em>why</em> a tune going there has to arrive some other way.
			</p>
			<p>
				That machinery does not only draw pictures. The same modulation detector reads a chord chart
				and finds where it changes key, which is where the next essay picks up.
			</p>
		</section>

		<footer class="note-foot">
			<p class="note-label">Keep reading</p>
			<div class="note-more">
				<a href="/notes/the-ladder">
					<span class="kicker">Next · drill</span>
					<span class="title">The ladder, and why it widens before it deepens</span>
				</a>
				<a href="/notes/naming-and-counting">
					<span class="kicker">Then · hear · apply</span>
					<span class="title">Naming what you play, and counting it honestly</span>
				</a>
			</div>
		</footer>
	</div>
</article>
