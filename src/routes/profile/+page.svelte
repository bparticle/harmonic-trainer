<script lang="ts">
	import { BADGE_TIERS } from '$lib/effects/streak';

	/*
	 * One page that says what has actually happened.
	 *
	 * It reads the record and captures nothing of its own, which is why every
	 * number here can be pointed at a row. Where a number would have to be
	 * estimated it is not shown — "where the time went" counts chords rather than
	 * minutes for exactly that reason, and says so.
	 *
	 * **Hue means pitch, here as everywhere.** That rule decides every colour on
	 * this page rather than taste doing it. A key has a tonic, so its bar wears
	 * that tonic's colour and a row of greens really is a lot of time on F. A
	 * chord quality has no pitch, so those bars are drawn in weight instead — the
	 * same language the note spread uses on the play-along page, for the same
	 * reason. Nothing here is coloured merely to stop the page being grey.
	 *
	 * **No daily streak.** No calendar of dots, no days-in-a-row counter, nothing
	 * that turns a day away from the piano into a loss. The chord streak measures
	 * playing; a daily streak would measure attendance, and this app has never
	 * told anyone off. It is worth saying in a comment because a profile page is
	 * exactly where somebody will later assume one was forgotten.
	 */

	let { data } = $props();

	const played = $derived(data.headline.playingMs + data.practice.playingMs);
	const nothingYet = $derived(data.headline.runs === 0 && data.practice.sessions === 0);

	/** Hours and minutes, never a decimal hour: nobody practises for 1.4 hours. */
	function duration(ms: number): string {
		const minutes = Math.round(ms / 60_000);
		if (minutes < 1) return '—';
		if (minutes < 60) return `${minutes}m`;
		return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
	}

	function day(date: Date | string | null): string {
		if (!date) return '—';
		const value = new Date(date);
		if (Number.isNaN(value.getTime())) return '—';
		return value.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function moment(date: Date | string): string {
		const value = new Date(date);
		if (Number.isNaN(value.getTime())) return '—';
		return value.toLocaleString(undefined, {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	/** Null before anything was played, never zero: they are different statements. */
	const percent = (landed: number, voiced: number): number | null =>
		voiced > 0 ? Math.round((landed / voiced) * 100) : null;

	const share = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

	/** A pitch's swatch, or the neutral line for something that has no pitch. */
	const tone = (pc: number | null) =>
		pc === null ? 'var(--color-ground-line)' : `var(--pc-${pc})`;

	/** Keys are stored as ASCII so they survive the database; shown as written. */
	const spell = (name: string) => name.replace(/b/g, '♭').replace(/#/g, '♯');

	type Slice = { voiced: number; landed: number };

	/**
	 * How a tune has moved, or nothing.
	 *
	 * Both halves have to exist before this says anything: a tune played twice is
	 * a tune played twice, not a tune improving. Stated as two numbers rather
	 * than as a verdict, and nothing here goes red — a dip is a fact about five
	 * runs, not a telling-off.
	 */
	function movement(trend: { recent: Slice; earlier: Slice } | null): string | null {
		if (!trend) return null;
		const now = percent(trend.recent.landed, trend.recent.voiced);
		const before = percent(trend.earlier.landed, trend.earlier.voiced);
		if (now === null || before === null) return null;
		if (now === before) return `${now}%, steady`;
		return `${before}% → ${now}%`;
	}

	const graded = $derived(data.headline.landed + data.headline.partial + data.headline.missed);
	const notes = $derived(
		data.headline.notesChord + data.headline.notesColour + data.headline.notesOutside
	);

	/** The busiest key, for scaling every other swatch against it. */
	const busiest = $derived(Math.max(1, ...data.keys.map((entry) => entry.voiced)));
	const keysTouched = $derived(data.keys.filter((entry) => entry.voiced > 0).length);

	/* The shelf's hexagon, at the size a list wants rather than a ladder. */
	const W = 26;
	const H = 29;
	const HEX = `M ${W / 2} 1 L ${W - 1} ${H / 4} L ${W - 1} ${(H * 3) / 4} L ${W / 2} ${H - 1} L 1 ${(H * 3) / 4} L 1 ${H / 4} Z`;

	const tierName = (id: string) => BADGE_TIERS.find((tier) => tier.id === id)?.name ?? id;
</script>

<svelte:head><title>Profile · Harmonic</title></svelte:head>

<main class="mx-auto max-w-[1100px] px-5 py-7">
	<header class="mb-6">
		<h1 class="font-display text-ink text-2xl font-semibold tracking-tight">Profile</h1>
		<p class="text-ink-muted mt-1 max-w-2xl text-sm leading-relaxed">
			Everything here comes from runs you have played and sessions you have finished. Nothing is
			estimated, and nothing counts a page left open.
		</p>
	</header>

	{#if nothingYet}
		<section class="panel">
			<p class="text-ink-muted text-sm leading-relaxed">
				Nothing to show yet. Play a tune on <a class="link" href="/backing">Play along</a> or sit
				down for a <a class="link" href="/">session</a>, and this page starts filling itself in.
			</p>
		</section>
	{:else}
		<section class="stats" aria-label="Totals">
			<div class="stat">
				<dt>played</dt>
				<dd>{duration(played)}</dd>
				<p class="note">
					{duration(data.headline.playingMs)} along, {duration(data.practice.playingMs)} in sessions
				</p>
			</div>
			<div class="stat">
				<dt>chords judged</dt>
				<dd>{data.headline.chordsJudged.toLocaleString()}</dd>
				<p class="note">over {data.headline.runs.toLocaleString()} runs</p>
			</div>
			<div class="stat">
				<dt>tunes practised</dt>
				<dd>{data.headline.tunesPractised}</dd>
				<p class="note">a chord played, not a chart opened</p>
			</div>
			<div class="stat">
				<dt>keys touched</dt>
				<dd>{keysTouched}<span class="of">/12</span></dd>
				<p class="note">counted where the chords were heard</p>
			</div>
			<div class="stat" style:--tone={tone(data.headline.bestOnPc)}>
				<dt>best streak</dt>
				<dd class="is-toned">
					{data.headline.bestStreak || '—'}{data.headline.bestStreak ? '×' : ''}
				</dd>
				<p class="note">
					{#if data.headline.bestOn}
						on {data.headline.bestOnName} in {spell(data.headline.bestOn.keyCenter)}
					{:else}
						land chords back to back to start one
					{/if}
				</p>
			</div>
		</section>

		<!--
			The twelve keys, in the order the wheel draws them.

			The most useful thing this page can show, and the reason it is near the
			top: a pale swatch is a key you have not been in. It is the blind-spot
			report before the blind-spot report exists, and it needs no prose to be
			read.

			Hidden until something has been played, like every other panel here.
			Twelve empty sockets under a *tune* are a ladder — they say twenty is
			next and fifty exists. Twelve empty keys on somebody who has only ever
			done practice sessions say nothing at all, and a wall of nothing you
			have not done is the one thing this page must never become.
		-->
		{#if data.headline.chordsJudged > 0}
			<section class="panel">
				<h2 class="head">The twelve keys</h2>
				<p class="lede">
					Round the circle of fifths, the way the wheel draws it. Each swatch fills with the chords
					judged in that key, so the pale ones are where you have not been. Modes fold into their
					tonic — B♭ major and G minor are the same seven notes under the hands.
				</p>
				<ul class="keys">
					{#each data.keys as entry (entry.pc)}
						{@const scored = percent(entry.landed, entry.voiced)}
						<li
							class="key"
							class:is-empty={entry.voiced === 0}
							style:--tone="var(--pc-{entry.pc})"
							style:--fill="{Math.round(share(entry.voiced, busiest))}%"
							title={entry.voiced
								? `${entry.label}: ${entry.voiced.toLocaleString()} chords${scored === null ? '' : `, ${scored}% landed`}`
								: `${entry.label}: nothing played yet`}
						>
							<span class="key-swatch"><span class="key-fill"></span></span>
							<span class="key-name">{entry.label}</span>
							<span class="key-count">{entry.voiced ? entry.voiced.toLocaleString() : '·'}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if graded > 0}
			<section class="panel">
				<h2 class="head">How the chords went</h2>
				<p class="lede">
					Weight rather than hue: landing a chord is not a pitch, and colour is not free to mean a
					second thing here. Nothing goes red either — a chord you played nothing over was dropped
					rather than failed, which is why these do not add up to every bar you have seen.
				</p>

				<div class="split">
					<div>
						<h3 class="sub">Chords</h3>
						<div
							class="meter"
							role="img"
							aria-label="Of {graded} chords judged, {data.headline.landed} landed, {data.headline
								.partial} part-landed, {data.headline.missed} missed"
						>
							<span class="m-landed" style:width="{share(data.headline.landed, graded)}%"></span>
							<span class="m-partial" style:width="{share(data.headline.partial, graded)}%"></span>
							<span class="m-missed" style:width="{share(data.headline.missed, graded)}%"></span>
						</div>
						<p class="legend">
							<span><i class="m-landed"></i>{data.headline.landed.toLocaleString()} landed</span>
							<span><i class="m-partial"></i>{data.headline.partial.toLocaleString()} part</span>
							<span><i class="m-missed"></i>{data.headline.missed.toLocaleString()} missed</span>
						</p>
					</div>

					<div>
						<h3 class="sub">Notes</h3>
						<div
							class="meter"
							role="img"
							aria-label="Of {notes} notes played, {data.headline.notesChord} chord tones, {data
								.headline.notesColour} elsewhere in the key, {data.headline
								.notesOutside} outside it"
						>
							<span class="m-landed" style:width="{share(data.headline.notesChord, notes)}%"></span>
							<span class="m-partial" style:width="{share(data.headline.notesColour, notes)}%"
							></span>
							<span class="m-missed" style:width="{share(data.headline.notesOutside, notes)}%"
							></span>
						</div>
						<p class="legend">
							<span><i class="m-landed"></i>{data.headline.notesChord.toLocaleString()} chord</span>
							<span
								><i class="m-partial"></i>{data.headline.notesColour.toLocaleString()} in key</span
							>
							<span
								><i class="m-missed"></i>{data.headline.notesOutside.toLocaleString()} outside</span
							>
						</p>
						<p class="note">Outside is reported, never scored. Blue notes are good playing.</p>
					</div>
				</div>
			</section>
		{/if}

		{#if data.tunes.length}
			<section class="panel">
				<h2 class="head">Per tune</h2>
				<p class="lede">
					Sorted by time spent, which is the honest answer to what you have been practising.
				</p>
				<div class="scroller">
					<table>
						<thead>
							<tr>
								<th scope="col">Tune</th>
								<th scope="col" class="num">Played</th>
								<th scope="col" class="num">Runs</th>
								<th scope="col" class="num">Landed</th>
								<th scope="col" class="num">Best</th>
								<th scope="col">Badges</th>
								<th scope="col">Lately</th>
								<th scope="col">Last played</th>
							</tr>
						</thead>
						<tbody>
							{#each data.tunes as tune (tune.chartSlug)}
								{@const scored = percent(tune.landed, tune.voiced)}
								<tr>
									<th scope="row">
										<a class="link" href="/backing?chart={encodeURIComponent(tune.chartSlug)}"
											>{tune.name}</a
										>
									</th>
									<td class="num">{duration(tune.playingMs)}</td>
									<td class="num">{tune.runs}</td>
									<td class="num">{scored === null ? '—' : `${scored}%`}</td>
									<td class="num">{tune.bestStreak || '—'}</td>
									<td>
										{#if tune.badges.length}
											<span class="pips" title="{tune.badges.length} of 6 on this tune">
												{#each tune.badges as badge (badge.tier)}
													<i style:background="var(--pc-{badge.pc})" title={tierName(badge.tier)}
													></i>
												{/each}
											</span>
										{:else}
											<span class="soft">—</span>
										{/if}
									</td>
									<td class="soft">{movement(tune.trend) ?? '—'}</td>
									<td class="soft">{day(tune.lastPlayed)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		{#if data.spread.byKey.length || data.spread.byQuality.length}
			<section class="panel">
				<h2 class="head">Where the time went</h2>
				<p class="lede">
					Chords judged rather than minutes: a run knows how long it lasted, a chord does not, and
					splitting one across the other would be an estimate wearing a number's clothes. The key is
					the one each chord was <em>heard</em> in, so a blues in C shows time on F and G too.
				</p>

				<div class="split">
					<div>
						<h3 class="sub">By key</h3>
						<ul class="bars">
							{#each data.spread.byKey.slice(0, 12) as slice (slice.label)}
								{@const scored = percent(slice.landed, slice.voiced)}
								<li>
									<span class="bar-label">{slice.label}</span>
									<span
										class="bar"
										style:--tone={tone(slice.pc)}
										style:--fill="{share(slice.voiced, data.spread.byKey[0].voiced)}%"
									></span>
									<span class="bar-value"
										>{slice.voiced.toLocaleString()}<span class="soft"
											>{scored === null ? '' : ` · ${scored}%`}</span
										></span
									>
								</li>
							{/each}
						</ul>
					</div>

					<div>
						<h3 class="sub">By chord quality</h3>
						<ul class="bars">
							{#each data.spread.byQuality.slice(0, 12) as slice (slice.label)}
								{@const scored = percent(slice.landed, slice.voiced)}
								<li>
									<span class="bar-label">{slice.label}</span>
									<span
										class="bar"
										style:--tone="var(--color-ink-dim)"
										style:--fill="{share(slice.voiced, data.spread.byQuality[0].voiced)}%"
									></span>
									<span class="bar-value"
										>{slice.voiced.toLocaleString()}<span class="soft"
											>{scored === null ? '' : ` · ${scored}%`}</span
										></span
									>
								</li>
							{/each}
						</ul>
						<p class="note">A quality has no pitch, so these are drawn in weight.</p>
					</div>
				</div>
			</section>
		{/if}

		{#if data.badges.length}
			<section class="panel">
				<h2 class="head">Badges won</h2>
				<p class="lede">
					What was actually earned, newest first, each wearing the colour of the chord that clinched
					it. The six empty sockets live under the tune they belong to, where they are a ladder
					rather than a list of things you have not done.
				</p>
				<ul class="badge-list">
					{#each data.badges as badge (`${badge.chart} ${badge.tier}`)}
						<li style:--tone="var(--pc-{badge.pc})" style:--tone-deep="var(--pc-{badge.pc}-deep)">
							<svg class="hex" viewBox="0 0 {W} {H}" aria-hidden="true">
								<path d={HEX} />
							</svg>
							<span class="badge-tier">{tierName(badge.tier)}</span>
							<a class="link" href="/backing?chart={encodeURIComponent(badge.chart)}"
								>{badge.name}</a
							>
							<span class="soft">
								{badge.count}× {badge.key ? `in ${spell(badge.key)}` : ''} · {day(badge.at)}
							</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		{#if data.recent.length}
			<section class="panel">
				<h2 class="head">Recent runs</h2>
				<div class="scroller">
					<table>
						<thead>
							<tr>
								<th scope="col">When</th>
								<th scope="col">Tune</th>
								<th scope="col">Key</th>
								<th scope="col" class="num">Tempo</th>
								<th scope="col" class="num">Played</th>
								<th scope="col" class="num">Chords</th>
								<th scope="col" class="num">Landed</th>
								<th scope="col" class="num">Streak</th>
							</tr>
						</thead>
						<tbody>
							{#each data.recent as run (run.id)}
								{@const scored = percent(run.landed, run.voiced)}
								<tr>
									<td class="soft">{moment(run.startedAt)}</td>
									<th scope="row">
										<a class="link" href="/backing?chart={encodeURIComponent(run.chartSlug)}"
											>{run.name}</a
										>
									</th>
									<td>
										<span class="dot" style:background={tone(run.pc)}></span>{spell(run.keyCenter)}
									</td>
									<td class="num">{run.bpm}</td>
									<td class="num">{duration(run.playingMs)}</td>
									<td class="num">{run.voiced || '—'}</td>
									<td class="num">{scored === null ? '—' : `${scored}%`}</td>
									<td class="num">{run.bestStreak || '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		<section class="panel">
			<h2 class="head">Practice sessions</h2>
			<p class="lede">
				The other half of the app. Blocks are counted when they finish, so a session abandoned
				halfway leaves what it got through and claims nothing more.
			</p>
			<dl class="inline-stats">
				<div>
					<dt>sessions</dt>
					<dd>{data.practice.sessions}</dd>
				</div>
				<div>
					<dt>blocks finished</dt>
					<dd>{data.practice.blocksFinished}</dd>
				</div>
				<div>
					<dt>time in blocks</dt>
					<dd>{duration(data.practice.playingMs)}</dd>
				</div>
				<div>
					<dt>reviews graded</dt>
					<dd>{data.practice.reviews.toLocaleString()}</dd>
				</div>
				<div>
					<dt>correct</dt>
					<dd>
						{percent(data.practice.reviewsCorrect, data.practice.reviews) ?? '—'}{data.practice
							.reviews
							? '%'
							: ''}
					</dd>
				</div>
				<div>
					<dt>last graded</dt>
					<dd class="small">{day(data.practice.lastReviewed)}</dd>
				</div>
			</dl>
		</section>
	{/if}
</main>

<style>
	.panel {
		margin-top: 1.1rem;
		padding: 1.1rem 1.25rem 1.35rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 12px;
		background: color-mix(in oklab, var(--color-ground-raised) 60%, transparent);
	}

	.head,
	.sub {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.09em;
		text-transform: uppercase;
	}

	.sub {
		margin-bottom: 0.6rem;
	}

	.lede {
		margin-top: 0.45rem;
		max-width: 66ch;
		color: var(--color-ink-muted);
		font-size: 0.78rem;
		line-height: 1.55;
	}

	.link {
		color: var(--color-ink);
		text-decoration: underline;
		text-decoration-color: var(--color-ground-line);
		text-underline-offset: 3px;
		transition: text-decoration-color 140ms ease;
	}

	.link:hover {
		text-decoration-color: var(--color-ink-dim);
	}

	/* The headline. Wraps rather than scrolls: five numbers is not a table. */
	.stats {
		display: grid;
		gap: 0.75rem;
		grid-template-columns: repeat(auto-fit, minmax(10.5rem, 1fr));
	}

	.stat {
		padding: 0.9rem 1rem 1rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 12px;
		background: color-mix(in oklab, var(--color-ground-raised) 60%, transparent);
	}

	.stat dt,
	.inline-stats dt {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.62rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	.stat dd {
		margin-top: 0.3rem;
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 1.55rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	/*
	 * The one tinted number, and it earns the tint: the best streak was set in a
	 * key, and a key has a tonic. Falls back to plain ink when nothing has set
	 * one, rather than to a colour that would mean nothing.
	 */
	.stat dd.is-toned {
		color: var(--tone, var(--color-ink));
	}

	.of {
		color: var(--color-ink-dim);
		font-size: 0.9rem;
	}

	.note {
		margin-top: 0.45rem;
		color: var(--color-ink-dim);
		font-size: 0.68rem;
		line-height: 1.4;
	}

	.inline-stats {
		display: flex;
		flex-wrap: wrap;
		gap: 0.85rem 2rem;
		margin-top: 0.85rem;
	}

	.inline-stats dd {
		margin-top: 0.25rem;
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 1.15rem;
		font-variant-numeric: tabular-nums;
		line-height: 1;
	}

	.inline-stats dd.small {
		font-size: 0.85rem;
	}

	/* The twelve keys. */
	.keys {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.9rem;
		grid-template-columns: repeat(12, minmax(0, 1fr));
	}

	@media (max-width: 760px) {
		.keys {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
	}

	.key {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
	}

	/*
	 * A column that fills from the bottom rather than a bar chart on its side.
	 * Upright because the eye reads twelve of these as a row of keys and not as a
	 * ranking, and a ranking would be the wrong idea — no key is meant to win.
	 */
	.key-swatch {
		display: flex;
		align-items: flex-end;
		width: 100%;
		height: 3.4rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 6px;
		background: color-mix(in oklab, var(--color-ground) 70%, transparent);
		overflow: hidden;
	}

	.key-fill {
		width: 100%;
		height: var(--fill);
		background: var(--tone);
		transition: height 260ms ease;
	}

	.key.is-empty .key-swatch {
		border-style: dashed;
	}

	.key-name {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.68rem;
	}

	.key.is-empty .key-name {
		color: var(--color-ink-dim);
	}

	.key-count {
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-variant-numeric: tabular-nums;
	}

	/*
	 * Landing a chord is not a pitch, so this is weight and not hue — the same
	 * language the note spread uses on the play-along page, for the same reason.
	 */
	.meter {
		display: flex;
		width: 100%;
		height: 8px;
		border-radius: 4px;
		overflow: hidden;
		background: var(--color-ground-line);
	}

	.m-landed {
		background: var(--color-ink);
	}

	.m-partial {
		background: var(--color-ink-dim);
	}

	.m-missed {
		background: repeating-linear-gradient(-45deg, var(--color-ink-dim) 0 2px, transparent 2px 4px);
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem 1rem;
		margin-top: 0.45rem;
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.64rem;
	}

	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}

	.legend i {
		width: 0.6rem;
		height: 0.6rem;
		border-radius: 2px;
		flex: none;
	}

	.legend i.m-missed {
		border: 1px dashed var(--color-ink-dim);
		background: none;
	}

	/* Wide content scrolls inside its own box; the page never slides sideways. */
	.scroller {
		margin-top: 0.85rem;
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8rem;
		white-space: nowrap;
	}

	th,
	td {
		padding: 0.42rem 0.7rem 0.42rem 0;
		text-align: left;
		vertical-align: baseline;
	}

	thead th {
		border-bottom: 1px solid var(--color-ground-line);
		color: var(--color-ink-dim);
		font-family: var(--font-mono);
		font-size: 0.6rem;
		font-weight: 400;
		letter-spacing: 0.08em;
		text-transform: uppercase;
	}

	tbody th {
		color: var(--color-ink);
		font-weight: 500;
	}

	tbody td {
		color: var(--color-ink-muted);
	}

	tbody tr + tr th,
	tbody tr + tr td {
		border-top: 1px solid color-mix(in oklab, var(--color-ground-line) 45%, transparent);
	}

	.num {
		font-family: var(--font-mono);
		font-variant-numeric: tabular-nums;
		text-align: right;
	}

	.soft {
		color: var(--color-ink-dim);
	}

	.dot {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 0.45rem;
		border-radius: 50%;
	}

	.pips {
		display: inline-flex;
		gap: 3px;
	}

	.pips i {
		width: 8px;
		height: 8px;
		border-radius: 2px;
		transform: rotate(45deg);
	}

	.split {
		display: grid;
		gap: 1.5rem 2.5rem;
		margin-top: 0.9rem;
		grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
	}

	.bars {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.bars li {
		display: grid;
		align-items: center;
		gap: 0.6rem;
		grid-template-columns: 4.5rem 1fr auto;
	}

	.bar-label,
	.bar-value {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
	}

	.bar-value {
		text-align: right;
	}

	.bar {
		position: relative;
		height: 7px;
		border-radius: 4px;
		background: color-mix(in oklab, var(--color-ground-line) 70%, transparent);
	}

	.bar::after {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: var(--fill);
		border-radius: 4px;
		background: var(--tone);
	}

	.badge-list {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		margin-top: 0.85rem;
	}

	.badge-list li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.55rem;
		padding: 0.2rem 0;
		font-size: 0.8rem;
	}

	/* The shelf's hexagon, so a badge is the same object in both places. */
	.hex {
		width: 20px;
		height: auto;
		flex: none;
	}

	.hex path {
		fill: var(--tone);
		stroke: var(--tone-deep);
		stroke-width: 2;
		stroke-linejoin: round;
	}

	.badge-tier {
		color: var(--color-ink);
		font-family: var(--font-mono);
		font-size: 0.72rem;
	}

	@media (prefers-reduced-motion: reduce) {
		.key-fill {
			transition: none;
		}
	}
</style>
