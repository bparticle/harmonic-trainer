<script lang="ts">
	import { onMount } from 'svelte';
	import { beforeNavigate } from '$app/navigation';
	import { connectMidi, midi } from '$lib/midi/shared.svelte';
	import { shouldHandleSpace } from '$lib/shortcuts';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import CircleMap from '$lib/theory/CircleMap.svelte';
	import {
		GAMES,
		makeDeck,
		answerForMidi,
		isCorrect,
		WHITE_NAMES,
		WHITE_PCS,
		type GameId,
		type RoundSpec
	} from '$lib/theory/catalog';
	import {
		beginRound,
		submitAnswer,
		resultOf,
		parseSubmission,
		type Round,
		type Submission
	} from '$lib/theory/round';

	let { data } = $props();
	let screen = $state<'lobby' | 'lesson' | 'playing' | 'complete'>('lobby');
	let gameId = $state<GameId>('circle');
	let mode = $state<RoundSpec['mode']>('guided');
	let level = $state<RoundSpec['level']>('starter');
	let direction = $state<RoundSpec['direction']>('clockwise');
	let round = $state<Round | null>(null);
	let nextRound = $state<Round | null>(null);
	let roundId = $state('');
	let selected = $state<string[]>([]);
	let hinted = $state(false);
	let feedback = $state<'correct' | 'wrong' | null>(null);
	let showKeyboard = $state(false);
	let leaving = $state(false);
	let saving = $state(false);
	let saveMessage = $state('');
	let pending = $state<Submission[]>([]);
	// Loaded once; successful saves replace this with the server's account-scoped totals.
	// svelte-ignore state_referenced_locally
	let progress = $state(data.theoryProgress);
	let focusTarget = $state<HTMLHeadingElement>();
	const game = $derived(GAMES.find((item) => item.id === gameId)!);
	const deck = $derived(round ? makeDeck(round.spec) : []);
	const entry = $derived(round?.queue[round.position]);
	const question = $derived(entry ? deck[entry.question] : null);
	const result = $derived(round ? resultOf(round) : null);
	const isCorrectFeedback = $derived(feedback === 'correct');
	const totalCompleted = $derived(GAMES.filter((item) => progress[item.id].rounds > 0).length);
	const nextGame = $derived(
		GAMES[(GAMES.findIndex((item) => item.id === gameId) + 1) % GAMES.length]
	);
	const outboxKey = $derived(`roundel:theory:outbox:${data.theoryUserId}`);
	const circleStep = $derived(
		question?.circleStep === undefined ? -1 : question.circleStep - (isCorrectFeedback ? 0 : 1)
	);
	const showReference = $derived(mode === 'guided' || hinted || isCorrectFeedback);

	function chooseGame(id: GameId) {
		gameId = id;
		screen = 'lesson';
		leaving = false;
	}

	function start() {
		const seed = crypto.getRandomValues(new Uint32Array(1))[0];
		round = beginRound({ game: gameId, mode, level, direction, seed });
		roundId = crypto.randomUUID();
		nextRound = null;
		selected = [];
		hinted = false;
		feedback = null;
		leaving = false;
		screen = 'playing';
	}

	function answer(values: string[]) {
		if (!round || !question || screen !== 'playing' || isCorrectFeedback || leaving) return;
		selected = values;
		const updated = submitAnswer(round, values, hinted);
		if (isCorrect(question, values)) {
			nextRound = updated;
			feedback = 'correct';
		} else {
			round = updated;
			feedback = 'wrong';
		}
	}

	function choose(value: string) {
		if (!question || isCorrectFeedback) return;
		if (question.kind === 'multiple') {
			selected = selected.includes(value)
				? selected.filter((item) => item !== value)
				: [...selected, value];
			feedback = null;
		} else answer([value]);
	}

	function advance() {
		if (leaving) return;
		if (screen === 'lesson') {
			start();
			return;
		}
		if (screen !== 'playing' || !round || !question) return;
		if (isCorrectFeedback && nextRound) {
			round = nextRound;
			nextRound = null;
			selected = [];
			hinted = false;
			feedback = null;
			if (round.position >= round.queue.length) {
				screen = 'complete';
				pending = [...pending, { id: roundId, spec: round.spec, attempts: round.attempts }];
				persistOutbox();
				void flushOutbox();
			}
		} else if (question.kind === 'multiple') answer(selected);
	}

	function persistOutbox() {
		try {
			localStorage.setItem(outboxKey, JSON.stringify(pending));
		} catch {
			saveMessage = 'Browser storage is unavailable. Keep this page open and retry saving.';
		}
	}

	async function flushOutbox() {
		if (saving || pending.length === 0) return;
		saving = true;
		saveMessage = 'Saving your round…';
		try {
			while (pending.length) {
				const item = pending[0];
				const response = await fetch('/api/theory', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(item)
				});
				if (!response.ok) throw new Error('Save failed');
				const saved = await response.json();
				progress = saved.progress;
				pending = pending.filter((candidate) => candidate.id !== item.id);
				persistOutbox();
			}
			saveMessage = 'Saved to your theory record.';
		} catch {
			saveMessage =
				'Not saved to your account yet. Retry here; we also retry when your connection returns.';
		} finally {
			saving = false;
		}
	}

	function handleNote(note: number) {
		if (
			screen !== 'playing' ||
			!question ||
			leaving ||
			document.querySelector('[aria-modal="true"]')
		)
			return;
		const value = answerForMidi(question, note);
		if (value !== null) answer([value]);
	}

	function keydown(event: KeyboardEvent) {
		if (document.querySelector('[aria-modal="true"]')) return;
		if (shouldHandleSpace(event)) {
			event.preventDefault();
			advance();
			return;
		}
		if (
			event.repeat ||
			event.defaultPrevented ||
			event.ctrlKey ||
			event.metaKey ||
			event.altKey ||
			event.shiftKey
		)
			return;
		if (
			(event.target as HTMLElement)?.closest(
				'input, textarea, select, button, a, [contenteditable="true"], [role="button"]'
			)
		)
			return;
		if (screen === 'playing' && question && question.kind !== 'pitch') {
			const index = '12345678'.indexOf(event.key);
			if (index >= 0 && question.choices[index]) {
				event.preventDefault();
				choose(question.choices[index].value);
			}
		}
	}

	function back() {
		if (screen === 'playing') {
			leaving = true;
			return;
		}
		screen = 'lobby';
	}

	// Native navigation still works. Only an unfinished round needs a chance to stay.
	beforeNavigate(({ cancel }) => {
		if (
			screen === 'playing' &&
			!window.confirm('Leave this unfinished theory round? Completed rounds are saved.')
		)
			cancel();
	});

	onMount(() => {
		try {
			const stored: unknown = JSON.parse(localStorage.getItem(outboxKey) ?? '[]');
			if (Array.isArray(stored))
				pending = stored.flatMap((item) => {
					const parsed = parseSubmission(item);
					return parsed ? [{ id: parsed.id, spec: parsed.spec, attempts: parsed.attempts }] : [];
				});
		} catch {
			saveMessage = 'Could not read the local save queue. New rounds can still be saved.';
		}
		void flushOutbox();
		const offNote = midi.onNote(handleNote);
		const offPedal = midi.onPedal(() => {
			advance();
			return screen === 'lesson' || screen === 'playing';
		});
		return () => {
			offNote();
			offPedal();
		};
	});

	$effect(() => {
		// Announce a new screen, without moving focus between every answer choice.
		screen;
		focusTarget?.focus({ preventScroll: true });
	});
</script>

<svelte:head>
	<title>Theory arcade · Roundel</title>
	<meta
		name="description"
		content="Play your way through the circle of fifths, key signatures, chord intervals, Roman numerals and relative keys."
	/>
</svelte:head>

<svelte:window onkeydown={keydown} ononline={() => void flushOutbox()} />

<main class="arcade" class:in-game={screen === 'playing'}>
	<header class="arcade-header">
		<div class="eyebrow">
			<span class="line-symbol" aria-hidden="true">◎</span> THEORY ARCADE
			<span class="header-divider">/</span>
			{screen === 'lobby' ? 'A NEW WAY TO PRACTISE' : game.name}
		</div>
		{#if screen !== 'lobby'}<button class="text-button" onclick={back}>← All games</button
			>{:else}<span class="course-progress">{totalCompleted} / 5 games explored</span>{/if}
	</header>

	{#if screen === 'lobby'}
		<section class="intro">
			<div>
				<h1 bind:this={focusTarget} tabindex="-1">
					A little theory.<br /><span>A lot of play.</span>
				</h1>
				<p>
					The ideas behind the notes, turned into five little games. Learn together, then see what
					sticks.
				</p>
			</div>
			<div class="course-note">
				<span class="small-label">YOUR THEORY COURSE</span>
				<p>
					Follow the five stops in order, or follow your curiosity. Start with a guided round. Come
					back from memory.
				</p>
				<span class="small-label">NO TIMER. ROOM TO THINK.</span>
			</div>
		</section>

		<section class="game-menu" aria-label="Theory games">
			<button class="featured-game" onclick={() => chooseGame('circle')}>
				<div class="featured-copy">
					<span class="small-label">01 / THE BIG PICTURE</span>
					<h2>Circle<br />navigator<span aria-hidden="true"> ↗</span></h2>
					<p>One starting point. Twelve keys.<br />Can you find your way back to C?</p>
					<span class="game-cta"
						>{progress.circle.rounds ? 'Travel again' : 'Start here'}
						<span aria-hidden="true">→</span></span
					><span class="record"
						>{progress.circle.rounds
							? `${progress.circle.rounds} rounds · ${progress.circle.bestStars} / 3 recall stars`
							: 'Piano or touch · 13 stops'}</span
					>
				</div>
				<div class="featured-map" aria-hidden="true"><CircleMap /></div>
			</button>
			<div class="other-games">
				{#each GAMES.slice(1) as item, i}
					<button class="game-row" onclick={() => chooseGame(item.id)}>
						<span class="game-number">0{i + 2}</span>
						<div>
							<h2>{item.name}</h2>
							<p>{item.subtitle}</p>
							<span class="record"
								>{progress[item.id].rounds
									? `${progress[item.id].rounds} rounds · ${progress[item.id].bestStars} / 3 recall stars`
									: item.id === 'signatures'
										? 'Count + assemble'
										: item.id === 'chords'
											? 'Build + discover'
											: item.id === 'numerals'
												? 'Name + connect'
												: 'Match + remember'}</span
							>
						</div>
						<span class="row-symbol" aria-hidden="true"
							>{item.id === 'signatures'
								? '♯ ♭'
								: item.id === 'chords'
									? '1·3·5'
									: item.id === 'numerals'
										? 'ii V I'
										: '↔'}</span
						>
					</button>
				{/each}
			</div>
		</section>
		<footer class="lobby-footer">
			<p>
				<span aria-hidden="true">♩</span> Your piano can be a game controller. A mouse or touch works
				too.
			</p>
			<p>A separate course, ready whenever you are.</p>
		</footer>
	{:else if screen === 'lesson'}
		<div class="lesson-layout">
			<section class="lesson-intro">
				<span class="small-label">STOP 0{GAMES.indexOf(game) + 1} / 05</span>
				<h1 bind:this={focusTarget} tabindex="-1">{game.name}</h1>
				<p class="description">{game.description}</p>
				{#if gameId === 'circle'}<div class="lesson-map"><CircleMap {direction} /></div>{:else}<div
						class="lesson-mark"
						aria-hidden="true"
					>
						{gameId === 'signatures'
							? '♯ → ♯♯ → ♯♯♯'
							: gameId === 'chords'
								? '1 · ♭3 · 5 · ♭7'
								: gameId === 'numerals'
									? 'I · ii · iii · IV · V · vi · vii°'
									: 'C major ↔ A minor'}
					</div>{/if}
			</section>
			<section class="lesson-controls" aria-label="Lesson and round settings">
				<h2>The idea before the game</h2>
				<ol class="lesson-points">
					{#each game.lesson as point}<li>{point}</li>{/each}
				</ol>
				<fieldset>
					<legend>How would you like to play?</legend>
					<div class="segmented">
						<button
							class:chosen={mode === 'guided'}
							aria-pressed={mode === 'guided'}
							onclick={() => (mode = 'guided')}
							><strong>Guided</strong><span>Keep a little help in view</span></button
						><button
							class:chosen={mode === 'recall'}
							aria-pressed={mode === 'recall'}
							onclick={() => (mode = 'recall')}
							><strong>Recall</strong><span>Find it from memory</span></button
						>
					</div>
				</fieldset>
				{#if gameId === 'circle'}
					<fieldset>
						<legend>Pick a direction</legend>
						<div class="segmented">
							<button
								class:chosen={direction === 'clockwise'}
								aria-pressed={direction === 'clockwise'}
								onclick={() => (direction = 'clockwise')}>↻ Clockwise · fifths</button
							><button
								class:chosen={direction === 'counterclockwise'}
								aria-pressed={direction === 'counterclockwise'}
								onclick={() => (direction = 'counterclockwise')}
								>↺ Counter-clockwise · fourths</button
							>
						</div>
					</fieldset>
				{:else}
					<fieldset>
						<legend>Your playing field</legend>
						<div class="segmented">
							<button
								class:chosen={level === 'starter'}
								aria-pressed={level === 'starter'}
								onclick={() => (level = 'starter')}
								><strong>Foundations</strong><span>Keys with up to 3 accidentals</span></button
							><button
								class:chosen={level === 'explorer'}
								aria-pressed={level === 'explorer'}
								onclick={() => (level = 'explorer')}
								><strong>All keys</strong><span>Up to 7 sharps or flats</span></button
							>
						</div>
					</fieldset>
				{/if}
				<p class="control-note">{game.controls}</p>
				<button class="primary start-button" onclick={start}
					>Let’s play <span aria-hidden="true">→</span></button
				>
				<p class="small-label below-button">
					{mode === 'guided'
						? 'Learning rounds build familiarity. Recall rounds earn stars.'
						: 'Three stars for every answer right first time, without hints.'}
				</p>
			</section>
		</div>
	{:else if screen === 'playing' && question && round && entry}
		<div class="round-meta">
			<span
				>{mode === 'guided' ? 'GUIDED ROUND' : 'FROM MEMORY'} <span class="meta-dot">·</span>
				{entry.retry
					? 'SECOND LOOK'
					: `${Math.min(round.position + 1, deck.length)} / ${deck.length}`}</span
			><span
				>{round.queue.length > deck.length
					? `${round.queue.slice(round.position).filter((item) => item.retry).length} second looks to come`
					: 'Take your time'}</span
			>
		</div>
		<div
			class="round-track"
			role="progressbar"
			aria-label="Round progress"
			aria-valuemin="0"
			aria-valuemax={round.queue.length}
			aria-valuenow={round.position}
		>
			<span style:transform={`scaleX(${round.position / round.queue.length})`}></span>
		</div>
		{#if leaving}
			<div class="leave-panel" role="alert">
				<p>Leave this round? The unfinished round won’t be saved.</p>
				<button class="primary" onclick={() => (leaving = false)}>Keep playing</button><button
					class="secondary"
					onclick={() => {
						screen = 'lobby';
						leaving = false;
					}}>Leave round</button
				>
			</div>
		{/if}
		<section class="play-layout" class:has-map={gameId === 'circle'} aria-label={game.name}>
			{#if gameId === 'circle'}<div class="play-map">
					<CircleMap {direction} step={circleStep} reveal={mode === 'guided'} />
				</div>{/if}
			<div class="question-area" inert={leaving}>
				<div class="question-heading">
					<span class="small-label">{question.context}</span>
					<h1 bind:this={focusTarget} tabindex="-1">{question.headline}</h1>
					<p class="question-prompt">{question.prompt}</p>
				</div>
				{#if question.kind === 'multiple'}
					<div class="assembly" aria-label="Your selected answer">
						<span class="small-label">{gameId === 'chords' ? 'YOUR RECIPE' : 'YOUR SIGNATURE'}</span
						>
						<div class="assembly-pieces">
							{#if selected.length}{#each question.choices.filter( (choice) => selected.includes(choice.value) ) as choice}<span
										>{choice.label}</span
									>{/each}{:else}<span class="assembly-empty"
									>{gameId === 'chords'
										? 'Choose your ingredients below'
										: 'No accidentals selected'}</span
								>{/if}
						</div>
						<span class="assembly-line" aria-hidden="true">{gameId === 'chords' ? '◇' : '⌑'}</span>
					</div>
				{:else if gameId === 'relatives'}
					<div class="relative-track" aria-hidden="true">
						<span style:--station={`var(--pc-${question.tonic})`}>{question.headline}</span><i
						></i><span
							>{isCorrectFeedback
								? question.choices.find((choice) => choice.value === question.answer[0])?.label
								: '?'}</span
						>
					</div>
				{/if}
				<div
					class="answers"
					class:note-answers={question.kind === 'pitch'}
					class:platforms={gameId === 'numerals'}
					class:tiles={question.kind === 'multiple'}
				>
					{#each question.choices as choice, i}
						<button
							class="answer"
							class:selected={selected.includes(choice.value)}
							class:landed={isCorrectFeedback && selected.includes(choice.value)}
							disabled={isCorrectFeedback}
							aria-pressed={question.kind === 'multiple'
								? selected.includes(choice.value)
								: undefined}
							onclick={() => choose(choice.value)}
						>
							<span class="answer-label">{choice.label}</span>
							{#if question.kind === 'single' && choice.pianoPc !== undefined}<span
									class="answer-key"
									>Piano {WHITE_NAMES[WHITE_PCS.indexOf(choice.pianoPc)] ?? 'C♯'}</span
								>{:else if question.kind === 'multiple'}<span class="answer-key"
									>{selected.includes(choice.value) ? 'selected' : `key ${i + 1}`}</span
								>{/if}
						</button>
					{/each}
				</div>
				{#if question.kind === 'single'}<p class="input-note">
						Piano as controller: play the key printed under your answer. Or press 1–{question
							.choices.length} on your computer.
					</p>{:else if question.kind === 'pitch'}<p class="input-note">
						Play the answer on your piano, in any octave. Or tap a note above.
					</p>{:else}<p class="input-note">
						Select tiles with touch or computer keys 1–{question.choices.length}. Space or pedal
						checks your answer.
					</p>{/if}
				<div
					class="feedback"
					class:success={isCorrectFeedback}
					role="status"
					aria-live="polite"
					aria-atomic="true"
				>
					{#if isCorrectFeedback}<strong
							>{entry.retry
								? 'Found it again.'
								: round.position === 0
									? 'You’re on your way.'
									: 'That connects.'}</strong
						>
						<p>{question.explanation}</p>{:else if feedback === 'wrong'}<strong
							>Not quite. You can work this out.</strong
						>
						<p>
							{question.kind === 'multiple'
								? 'Adjust your selection and check again.'
								: 'Try another answer.'} A hint is here if you need one.
						</p>{:else if entry.retry}<strong>One more connection.</strong>
						<p>You met this earlier. Try retrieving it again.</p>{:else}<p>
							{mode === 'guided'
								? 'Use the field notes below. This round is for learning.'
								: 'Let your memory do the work. There’s no countdown.'}
						</p>{/if}
				</div>
				<div class="round-actions">
					{#if isCorrectFeedback}<button class="primary" onclick={advance}
							>{nextRound && nextRound.position === nextRound.queue.length
								? 'See my round'
								: 'Next connection'} <span aria-hidden="true">→</span></button
						>{:else if question.kind === 'multiple'}<button
							class="primary"
							onclick={() => answer(selected)}
							>{gameId === 'signatures' ? 'Unlock signature' : 'Check recipe'} →</button
						>{/if}
					{#if !isCorrectFeedback}<button
							class="text-button"
							onclick={() => (hinted = true)}
							disabled={hinted}>{hinted ? 'Hint open' : 'Give me a hint'}</button
						>{/if}
					{#if isCorrectFeedback}<span class="small-label">SPACE OR PEDAL TO CONTINUE</span>{/if}
				</div>
				{#if showReference && !isCorrectFeedback}
					<aside class="field-notes">
						<span class="small-label">{hinted ? 'A LITTLE HELP' : 'FIELD NOTES'}</span>
						<p>{question.hint}</p>
						{#if gameId !== 'circle'}<div class="reference-strip">
								{#each question.reference as item}<span>{item}</span>{/each}
							</div>{/if}
					</aside>
				{/if}
			</div>
		</section>
		<div class="instrument-bar">
			<div>
				<span class="connection-dot" class:connected={midi.selectedId !== null}></span><span
					>{midi.selectedId ? 'Piano connected' : 'Touch & computer keys ready'}</span
				>{#if !midi.selectedId}<button
						class="text-button"
						disabled={midi.status === 'requesting'}
						onclick={() => void connectMidi()}
						>{midi.status === 'requesting' ? 'Connecting…' : 'Connect piano'}</button
					>{/if}
			</div>
			<button
				class="text-button"
				aria-expanded={showKeyboard}
				onclick={() => (showKeyboard = !showKeyboard)}
				>{showKeyboard ? 'Hide' : 'Show'} on-screen piano</button
			>
		</div>
		{#if midi.unavailableReason || midi.error}<p class="input-note">
				{midi.unavailableReason ?? midi.error} You can keep playing with the buttons.
			</p>{:else if midi.status === 'ready' && !midi.selectedId}<p class="input-note">
				MIDI access is ready. Plug in your piano to use it as a controller.
			</p>{/if}
		{#if showKeyboard}<div class="screen-piano">
				<Keyboard
					from={60}
					count={13}
					lit={midi.live}
					onnoteon={(note) =>
						midi.push({ type: 'noteon', note, velocity: 80, time: performance.now() })}
					onnoteoff={(note) => midi.push({ type: 'noteoff', note, time: performance.now() })}
				/>
				<p class="input-note">
					Focus the piano and use A W S E D F T G Y H U J K. {question.kind === 'multiple'
						? 'This puzzle uses interval or accidental tiles, so piano notes are not answers here.'
						: ''}
				</p>
			</div>{/if}
	{:else if screen === 'complete' && result && round}
		<section class="completion">
			<span class="small-label">{game.name} / ROUND COMPLETE</span>
			<div
				class="completion-mark"
				aria-label={mode === 'guided'
					? 'Guided round completed'
					: `${result.stars} out of 3 recall stars`}
			>
				{mode === 'guided' ? '◎' : '★'.repeat(result.stars) + '☆'.repeat(3 - result.stars)}
			</div>
			<h1 bind:this={focusTarget} tabindex="-1">
				{gameId === 'circle' ? 'All the way home.' : 'More pieces connected.'}
			</h1>
			<p class="completion-description">
				{mode === 'guided'
					? 'You’ve met the ideas. When you’re ready, try finding them without the field notes.'
					: result.stars === 3
						? 'Every connection, first time, without a hint. That’s a map you can carry with you.'
						: 'You finished the round and revisited the tricky connections. Every retrieval helps it stick.'}
			</p>
			<div class="result-facts">
				<div>
					<strong>{result.firstTry}<span>/{result.total}</span></strong><span
						>{mode === 'guided'
							? 'right on first try, with guidance'
							: 'first try, without hints'}</span
					>
				</div>
				<div><strong>{result.recovered}</strong><span>worked out with another look</span></div>
				<div>
					<strong>{round.queue.length - result.total}</strong><span
						>review connections completed</span
					>
				</div>
			</div>
			<p class="save-status" role="status">{saveMessage}</p>
			<div class="completion-actions">
				<button
					class="primary"
					onclick={() => {
						if (mode === 'guided') mode = 'recall';
						start();
					}}>{mode === 'guided' ? 'Try from memory' : 'Play another round'} →</button
				>{#if gameId === 'circle'}<button
						class="secondary"
						onclick={() => {
							direction = direction === 'clockwise' ? 'counterclockwise' : 'clockwise';
							start();
						}}>Go the other way {direction === 'clockwise' ? '↺' : '↻'}</button
					>{/if}<button class="text-button" onclick={() => chooseGame(nextGame.id)}
					>Next stop: {nextGame.name} →</button
				>
			</div>
			{#if mode === 'recall'}<p class="input-note">
					3 stars: every answer first try without hints. 2: at least 75%. 1: complete the round and
					its second looks.
				</p>{/if}
		</section>
	{/if}
	{#if pending.length > 0}<div class="save-banner" role="status">
			<span
				>{pending.length} completed {pending.length === 1 ? 'round' : 'rounds'} waiting to save. {saveMessage}</span
			><button class="secondary" disabled={saving} onclick={() => void flushOutbox()}
				>{saving ? 'Saving…' : 'Retry save'}</button
			>
		</div>{/if}
</main>

<style>
	.arcade {
		max-width: 1280px;
		margin: auto;
		padding: 32px clamp(18px, 4vw, 56px) 48px;
	}
	.arcade-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		min-height: 32px;
	}
	.eyebrow,
	.small-label,
	.course-progress,
	.round-meta {
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.06em;
		color: var(--color-ink-muted);
	}
	.eyebrow {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.line-symbol {
		font-size: 24px;
		color: var(--color-ink);
	}
	.header-divider {
		color: var(--color-ground-line);
		margin: 0 8px;
	}
	h1,
	h2,
	p {
		margin: 0;
	}
	h1 {
		font-size: clamp(36px, 5.2vw, 66px);
		line-height: 1.06;
		font-weight: 550;
		letter-spacing: -0.055em;
		text-wrap: balance;
	}
	h1:focus {
		outline: none;
	}
	h2 {
		font-weight: 550;
		letter-spacing: -0.035em;
	}
	button {
		cursor: pointer;
	}
	button:disabled {
		cursor: default;
	}
	.intro {
		display: grid;
		grid-template-columns: 1.5fr 1fr;
		gap: 60px;
		align-items: end;
		padding: 48px 0 38px;
	}
	.intro h1 span {
		color: var(--color-ink-muted);
	}
	.intro > div > p {
		font-size: 17px;
		line-height: 1.65;
		max-width: 480px;
		margin-top: 20px;
		color: var(--color-ink-muted);
	}
	.course-note {
		max-width: 340px;
		padding-left: 24px;
		border-left: 1px solid var(--color-ground-line);
	}
	.course-note p {
		font-size: 14px !important;
		margin: 12px 0 22px !important;
	}
	.game-menu {
		display: grid;
		grid-template-columns: 1.05fr 1fr;
		border-block: 1px solid var(--color-ground-line);
	}
	.featured-game {
		position: relative;
		overflow: hidden;
		text-align: left;
		min-height: 390px;
		padding: 30px 26px 30px 0;
		border-right: 1px solid var(--color-ground-line);
	}
	.featured-copy {
		position: relative;
		z-index: 1;
		pointer-events: none;
	}
	.featured-copy h2 {
		font-size: clamp(32px, 3.4vw, 46px);
		line-height: 1.06;
		margin: 24px 0 18px;
	}
	.featured-copy h2 > span {
		font-size: 28px;
		font-weight: 400;
	}
	.featured-copy p {
		font-size: 14px;
		line-height: 1.7;
		color: var(--color-ink-muted);
		max-width: 220px;
	}
	.featured-map {
		position: absolute;
		width: 320px;
		right: -103px;
		top: 55px;
		opacity: 0.85;
		transform: rotate(-10deg);
		pointer-events: none;
	}
	.game-cta {
		display: inline-flex;
		align-items: center;
		gap: 35px;
		padding: 12px 16px;
		margin-top: 30px;
		background: var(--color-ink);
		color: var(--color-ground);
		border-radius: 5px;
		font-size: 14px;
		font-weight: 600;
	}
	.featured-copy > .record {
		display: block;
		margin-top: 16px;
	}
	.game-row {
		display: flex;
		align-items: center;
		gap: 20px;
		padding: 22px 0 22px 26px;
		width: 100%;
		text-align: left;
		border-bottom: 1px solid var(--color-ground-line);
		transition: background 150ms;
	}
	.game-row:last-child {
		border-bottom: 0;
	}
	.game-row:hover,
	.featured-game:hover {
		background: color-mix(in oklch, var(--color-ground-raised) 65%, transparent);
	}
	.game-number {
		color: var(--color-ink-muted);
		font: 12px var(--font-mono);
		align-self: flex-start;
		padding-top: 5px;
	}
	.game-row h2 {
		font-size: 22px;
		margin-bottom: 4px;
	}
	.game-row p {
		font-size: 13px;
		color: var(--color-ink-muted);
	}
	.record {
		font: 10px var(--font-mono);
		color: var(--color-ink-muted);
		display: inline-block;
		margin-top: 9px;
	}
	.row-symbol {
		font: 17px var(--font-mono);
		color: var(--color-ink-muted);
		margin-left: auto;
		min-width: 70px;
		text-align: center;
	}
	.lobby-footer {
		display: flex;
		justify-content: space-between;
		gap: 20px;
		padding-top: 22px;
		color: var(--color-ink-muted);
		font-size: 12px;
	}
	.lobby-footer p:first-child span {
		margin-right: 7px;
	}
	.text-button {
		color: var(--color-ink-muted);
		font-size: 13px;
		padding: 10px 0;
		text-align: left;
		min-height: 44px;
	}
	.text-button:hover {
		color: var(--color-ink);
		text-decoration: underline;
		text-underline-offset: 4px;
	}
	.text-button:disabled {
		opacity: 0.6;
	}
	.primary,
	.secondary {
		border-radius: 5px;
		padding: 13px 20px;
		font-size: 14px;
		min-height: 48px;
		font-weight: 550;
	}
	.primary {
		background: var(--color-ink);
		color: var(--color-ground);
		display: inline-flex;
		justify-content: space-between;
		align-items: center;
		gap: 30px;
	}
	.primary:hover {
		background: var(--color-ink-muted);
	}
	.secondary {
		border: 1px solid var(--color-ground-line);
		color: var(--color-ink);
	}
	.secondary:hover {
		background: var(--color-ground-raised);
	}
	.lesson-layout {
		display: grid;
		grid-template-columns: 1fr 1.08fr;
		gap: clamp(30px, 6vw, 84px);
		margin-top: 48px;
	}
	.lesson-intro h1 {
		margin-top: 18px;
	}
	.description {
		font-size: 17px;
		line-height: 1.7;
		color: var(--color-ink-muted);
		margin-top: 22px;
		max-width: 440px;
	}
	.lesson-map {
		max-width: 330px;
		margin: 26px auto 0;
	}
	.lesson-mark {
		font-size: clamp(22px, 3vw, 38px);
		line-height: 1.8;
		color: var(--color-ink-muted);
		padding: 52px 0;
		border-bottom: 1px solid var(--color-ground-line);
	}
	.lesson-controls h2 {
		font-size: 22px;
	}
	.lesson-points {
		padding-left: 22px;
		font-size: 14px;
		line-height: 1.7;
		color: var(--color-ink-muted);
		margin: 20px 0 28px;
	}
	.lesson-points li {
		padding-left: 6px;
		margin-bottom: 12px;
	}
	.lesson-points li::marker {
		color: var(--color-ink);
		font: 11px var(--font-mono);
	}
	fieldset {
		border: 0;
		padding: 0;
		margin: 22px 0;
		min-width: 0;
	}
	legend {
		font-size: 12px;
		color: var(--color-ink-muted);
		margin-bottom: 10px;
	}
	.segmented {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px;
	}
	.segmented button {
		border: 1px solid var(--color-ground-line);
		padding: 14px;
		border-radius: 5px;
		font-size: 13px;
		text-align: left;
		min-height: 50px;
	}
	.segmented .chosen {
		border-color: var(--color-ink-muted);
		background: var(--color-ground-overlay);
	}
	.segmented strong {
		display: block;
		font-weight: 550;
	}
	.segmented span {
		display: block;
		font-size: 11px;
		color: var(--color-ink-muted);
		margin-top: 5px;
	}
	.control-note {
		font-size: 13px;
		line-height: 1.7;
		color: var(--color-ink-muted);
	}
	.start-button {
		width: 100%;
		margin-top: 22px;
	}
	.below-button {
		margin-top: 12px;
		font-size: 10px;
		line-height: 1.7;
		letter-spacing: 0;
	}
	.round-meta {
		display: flex;
		justify-content: space-between;
		gap: 18px;
		margin: 28px 0 12px;
		font-size: 10px;
	}
	.meta-dot {
		margin: 0 10px;
	}
	.round-track {
		height: 3px;
		background: var(--color-ground-line);
	}
	.round-track > span {
		display: block;
		height: 100%;
		background: var(--color-ink-muted);
		transform-origin: left;
		transition: transform 220ms ease-out;
	}
	.play-layout {
		max-width: 850px;
		margin: 38px auto 24px;
	}
	.play-layout.has-map {
		display: grid;
		grid-template-columns: 0.8fr 1.2fr;
		max-width: none;
		gap: 30px;
		align-items: start;
	}
	.play-map {
		padding-top: 24px;
	}
	.question-heading h1 {
		margin: 14px 0;
		font-size: clamp(34px, 4.5vw, 58px);
	}
	.question-prompt {
		font-size: 17px;
		line-height: 1.5;
		max-width: 700px;
	}
	.answers {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 8px;
		margin-top: 26px;
	}
	.answers.note-answers {
		grid-template-columns: repeat(6, 1fr);
	}
	.answers.platforms {
		grid-template-columns: repeat(7, 1fr);
	}
	.answer {
		min-width: 0;
		min-height: 70px;
		padding: 12px 4px;
		background: var(--color-ground-raised);
		border: 1px solid var(--color-ground-line);
		border-radius: 5px;
		transition:
			background 120ms,
			transform 120ms;
	}
	.answer:hover:not(:disabled) {
		background: var(--color-ground-overlay);
		transform: translateY(-2px);
	}
	.answer-label {
		display: block;
		font-size: 25px;
		font-weight: 550;
		line-height: 1.2;
	}
	.answer-key {
		display: block;
		margin-top: 8px;
		font: 9px var(--font-mono);
		color: var(--color-ink-muted);
	}
	.answer.selected {
		border-color: var(--color-ink-muted);
		background: var(--color-ground-overlay);
	}
	.answer.landed {
		border-color: var(--color-ink);
		background: var(--color-ink);
		color: var(--color-ground);
	}
	.answer.landed .answer-key {
		color: var(--color-ground);
	}
	.answer:disabled:not(.landed) {
		opacity: 0.4;
	}
	.input-note {
		font-size: 11px;
		color: var(--color-ink-muted);
		margin-top: 12px;
		line-height: 1.7;
	}
	.assembly {
		border-block: 1px solid var(--color-ground-line);
		padding: 18px 0;
		margin-top: 24px;
		display: flex;
		align-items: center;
		gap: 22px;
		min-height: 80px;
	}
	.assembly-pieces {
		display: flex;
		align-items: center;
		gap: 16px;
		flex-wrap: wrap;
		font-size: 26px;
	}
	.assembly-empty {
		font-size: 14px;
		color: var(--color-ink-muted);
	}
	.assembly-line {
		margin-left: auto;
		font-size: 26px;
	}
	.relative-track {
		display: flex;
		align-items: center;
		margin-top: 28px;
		max-width: 500px;
	}
	.relative-track span {
		border: 2px solid var(--station, var(--color-ground-line));
		border-radius: 40px;
		padding: 14px 24px;
		min-width: 80px;
		text-align: center;
	}
	.relative-track i {
		height: 2px;
		background: var(--color-ground-line);
		flex: 1;
	}
	.feedback {
		margin-top: 22px;
		min-height: 86px;
		border-top: 1px solid var(--color-ground-line);
		padding-top: 16px;
		font-size: 14px;
		line-height: 1.6;
	}
	.feedback strong {
		display: block;
		font-weight: 550;
		margin-bottom: 3px;
	}
	.feedback p {
		color: var(--color-ink-muted);
	}
	.feedback.success {
		animation: feedback-in 200ms ease-out;
	}
	.round-actions {
		display: flex;
		align-items: center;
		gap: 24px;
		flex-wrap: wrap;
		min-height: 48px;
	}
	.field-notes {
		margin-top: 22px;
		padding: 18px 20px;
		background: var(--color-ground-raised);
		border-radius: 5px;
	}
	.field-notes p {
		font-size: 13px;
		color: var(--color-ink-muted);
		line-height: 1.65;
		margin-top: 8px;
	}
	.reference-strip {
		display: flex;
		gap: 8px 16px;
		flex-wrap: wrap;
		font-size: 15px;
		margin-top: 14px;
	}
	.instrument-bar {
		border-top: 1px solid var(--color-ground-line);
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 20px;
		padding-top: 12px;
		margin-top: 30px;
		font-size: 11px;
		color: var(--color-ink-muted);
	}
	.instrument-bar > div {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.connection-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		border: 1px solid var(--color-ink-muted);
	}
	.connection-dot.connected {
		background: var(--color-ink);
	}
	.screen-piano {
		max-width: 650px;
		margin: 20px auto;
	}
	.completion {
		max-width: 850px;
		text-align: center;
		margin: 60px auto;
	}
	.completion-mark {
		font-size: 60px;
		letter-spacing: 10px;
		margin: 25px 0;
	}
	.completion-description {
		max-width: 560px;
		margin: 20px auto 35px;
		color: var(--color-ink-muted);
		font-size: 16px;
		line-height: 1.7;
	}
	.result-facts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		padding: 25px 0;
		border-block: 1px solid var(--color-ground-line);
		gap: 20px;
	}
	.result-facts > div {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.result-facts strong {
		font-size: 40px;
		font-weight: 500;
	}
	.result-facts strong span {
		font-size: 20px;
		color: var(--color-ink-muted);
	}
	.result-facts > div > span {
		font-size: 11px;
		color: var(--color-ink-muted);
	}
	.save-status {
		font-size: 12px;
		color: var(--color-ink-muted);
		margin: 18px 0 25px;
	}
	.completion-actions {
		display: flex;
		justify-content: center;
		gap: 14px;
		flex-wrap: wrap;
	}
	.save-banner,
	.leave-panel {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 20px;
		padding: 20px;
		border: 1px solid var(--color-ink-muted);
		margin-top: 20px;
		font-size: 13px;
		background: var(--color-ground-raised);
		border-radius: 5px;
	}
	.save-banner > span {
		flex: 1;
		min-width: 200px;
	}
	@keyframes feedback-in {
		from {
			opacity: 0.3;
			transform: translateY(3px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
	@media (min-width: 1200px) {
		.featured-map {
			right: -60px;
			width: 340px;
		}
	}
	@media (max-width: 900px) {
		.row-symbol {
			display: none;
		}
		.intro {
			gap: 30px;
		}
		.featured-map {
			right: -160px;
			opacity: 0.6;
		}
		.play-layout.has-map {
			grid-template-columns: 0.65fr 1.2fr;
			gap: 18px;
		}
		.game-row {
			padding-left: 18px;
			gap: 14px;
		}
	}
	@media (max-width: 680px) {
		.arcade {
			padding-top: 18px;
		}
		.arcade-header {
			align-items: start;
		}
		.eyebrow {
			font-size: 9px;
			flex-wrap: wrap;
			gap: 5px;
		}
		.course-progress {
			font-size: 9px;
			white-space: nowrap;
			padding-top: 8px;
		}
		.intro {
			display: block;
			padding: 30px 0;
		}
		.intro h1 {
			font-size: 44px;
		}
		.course-note {
			display: none;
		}
		.intro > div > p {
			font-size: 15px;
			margin-top: 16px;
		}
		.game-menu {
			display: block;
		}
		.featured-game {
			border-right: 0;
			border-bottom: 1px solid var(--color-ground-line);
			width: 100%;
			min-height: 350px;
			padding-top: 24px;
		}
		.featured-map {
			width: 280px;
			right: -85px;
			top: 35px;
			opacity: 0.8;
		}
		.featured-copy p {
			max-width: 200px;
		}
		.game-row {
			padding: 22px 0;
		}
		.row-symbol {
			display: block;
			font-size: 14px;
			min-width: 55px;
		}
		.game-row h2 {
			font-size: 21px;
		}
		.game-row p {
			max-width: 230px;
			line-height: 1.5;
		}
		.lobby-footer {
			display: block;
			line-height: 1.7;
		}
		.lobby-footer p + p {
			margin-top: 12px;
		}
		.lesson-layout {
			grid-template-columns: 1fr;
			margin-top: 30px;
			gap: 24px;
		}
		.lesson-map {
			max-width: 260px;
		}
		.lesson-mark {
			padding: 25px 0;
		}
		.lesson-intro h1 {
			font-size: 43px;
		}
		.description {
			font-size: 15px;
		}
		.play-layout.has-map {
			display: block;
		}
		.play-map {
			max-width: 240px;
			margin: -25px auto 20px;
			padding-top: 0;
		}
		.question-heading h1 {
			font-size: 38px;
		}
		.question-prompt {
			font-size: 15px;
		}
		.answers,
		.answers.platforms {
			grid-template-columns: repeat(4, 1fr);
		}
		.answers.note-answers {
			gap: 6px;
		}
		.answer {
			min-height: 62px;
		}
		.answer-label {
			font-size: 22px;
		}
		.assembly {
			gap: 12px;
		}
		.assembly > .small-label {
			max-width: 65px;
		}
		.instrument-bar {
			align-items: start;
			gap: 10px;
		}
		.instrument-bar > .text-button {
			max-width: 110px;
			flex-shrink: 0;
		}
		.round-actions {
			gap: 12px;
		}
		.round-meta {
			font-size: 9px;
			letter-spacing: 0;
		}
		.completion {
			margin-top: 40px;
		}
		.result-facts {
			gap: 12px;
		}
		.result-facts strong {
			font-size: 32px;
		}
		.result-facts > div > span {
			line-height: 1.6;
		}
		.completion-actions {
			flex-direction: column;
		}
		.completion-actions > .text-button {
			text-align: center;
		}
	}
</style>
