<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { page } from '$app/state';
	import Fireworks, { type FireworksApi } from '$lib/components/Fireworks.svelte';
	import FifthsBoard, { type StationView } from '$lib/practice/FifthsBoard.svelte';
	import { playChord, startAudio } from '$lib/audio/engine';
	import { midi } from '$lib/midi/shared.svelte';
	import { callout, tierFor } from '$lib/effects/streak';
	import { circleOfFifthsIndex } from '$lib/music/key';
	import { mod12 } from '$lib/wheel/geometry';
	import {
		addKey,
		answeredByNote,
		answeredOnRim,
		buildSet,
		chooseLens,
		freshProgress,
		inPlay,
		KEYS,
		keysAt,
		MAX_STRENGTH,
		meet,
		nextKey,
		openAll,
		parseProgress,
		QUICK_MS,
		readyForNext,
		requeue,
		scored,
		serializeProgress,
		SET_SIZE,
		SETS_PER_ROUND,
		sharesPosition,
		signatureGlyph,
		signatureLabel,
		SOLID,
		STARTING_KEYS,
		stationFill,
		strengthOf,
		type Lens,
		type MajorKey,
		type Progress,
		type Question,
		type Turn
	} from '$lib/practice/fifths';

	/*
	 * The page runs the round; `fifths.ts` decides what to ask and what a key
	 * has earned, and the board draws it. Progress is saved after every answer,
	 * so ending a round early, or closing the tab, loses nothing.
	 */

	const STORAGE_KEY = 'roundel:fifths';
	const SOUND_KEY = 'roundel:fifths:sound';
	const FX_KEY = 'roundel:fifths:fireworks';
	const ROUND = SET_SIZE * SETS_PER_ROUND;
	/** Long enough to hear the chord start; short enough to keep a rhythm. */
	const HIT_MS = 560;
	/** Long enough to read where the key actually is, which is the point of a miss. */
	const MISS_MS = 1600;
	const CARD_MS = 1300;

	const LENS_TEXT: Record<Lens | 'intro', { title: string; short: string; long: string }> = {
		intro: {
			title: 'New key',
			short: 'Hear it, then tap it',
			long: 'Each key is shown once: where it lives, its signature and how it sounds. Tap it to bring it into the game.'
		},
		find: {
			title: 'Find the key',
			short: 'Tap where it lives',
			long: 'Tap the station where the key lives.'
		},
		'find-signature': {
			title: 'Find by signature',
			short: 'Tap the key with this signature',
			long: 'Count round from C: every step clockwise adds a sharp, every step anticlockwise adds a flat.'
		},
		step: {
			title: 'One step round',
			short: '↻ a fifth up · ↺ a fifth down',
			long: 'Clockwise is a fifth up and one sharp more; anticlockwise is a fifth down and one flat more.'
		},
		name: {
			title: 'Name the key',
			short: 'Which key lives at the mark?',
			long: 'A station is marked. Say which key lives there.'
		},
		signature: {
			title: 'Key signature',
			short: 'How many sharps or flats?',
			long: 'Choose the key’s signature.'
		}
	};

	let progress = $state.raw<Progress>(freshProgress());
	let phase = $state<'ready' | 'play' | 'done'>('ready');
	let card = $state.raw<{ caption: string; title: string; detail: string } | null>(null);
	let queue = $state.raw<Turn[]>([]);
	let lens = $state<Lens | 'intro'>('find');
	let setIndex = $state(0);
	let setAnswered = 0;
	let usedLenses: Lens[] = [];
	let lastTarget: MajorKey | undefined;
	/** Keys shown since the last set began. The next set finds them first. */
	let justMet: MajorKey[] = [];
	/**
	 * One new key a round. Without the limit a quick player was given a key at
	 * almost every break between sets, each followed by its Find set, and the
	 * rounds turned into Find, Find, Find.
	 */
	let addedThisRound = false;
	let pips = $state.raw<Array<{ state: 'open' | 'hit' | 'slip'; pc?: number }>>([]);
	let firstHits = $state(0);
	let answered = $state(0);
	let streak = $state(0);
	let roundBest = $state(0);
	let lastPc = $state<number | null>(null);
	let roundStart = $state.raw<Progress>(freshProgress());
	let upcoming = $state.raw<MajorKey | undefined>(undefined);
	let result = $state.raw<{
		hit: boolean;
		firedAt: number | null;
		choice?: MajorKey;
		quick: boolean;
	} | null>(null);
	let aim = $state<number | null>(null);
	/** The game put the pointer where it is (an introduction, a marked station), not the player. */
	let aimedByGame = false;
	let sound = $state(true);
	let fireworks = $state(true);
	let fx: FireworksApi | null = null;
	let shownAt = 0;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let announcement = $state('');
	let arena = $state<HTMLElement>();
	let primaryButton = $state<HTMLButtonElement>();
	/** Keyboard focus was in the game, and should stay there when the thing holding it goes. */
	let focusInArena = false;

	const question = $derived(phase === 'play' && !card ? queue[0]?.question : undefined);
	const attempt = $derived(queue[0]?.attempt ?? 0);
	const keysInPlay = $derived(inPlay(progress));
	const solidCount = $derived(
		keysInPlay.filter((key) => strengthOf(progress, key) >= SOLID).length
	);
	const upNext = $derived(nextKey(progress));
	const isNewPlayer = $derived(
		keysInPlay.length === STARTING_KEYS &&
			keysInPlay.every((key) => strengthOf(progress, key) === 0)
	);
	const midiReady = $derived(midi.status === 'ready');
	const tier = $derived(tierFor(streak));

	const stations = $derived.by((): StationView[] =>
		Array.from({ length: 12 }, (_, position) => {
			if (phase === 'play') {
				const intro = question?.lens === 'intro' && question.target.position === position;
				return { labels: intro ? [question.target] : [] };
			}
			const here = keysAt(position).filter((key) => key.name in progress.strength);
			return {
				labels: here,
				fill: here.length ? stationFill(progress, position) : undefined,
				waiting: here.length > 0 && here.every((key) => progress.waiting.includes(key.name)),
				locked: here.length === 0,
				next: here.length === 0 && upNext?.position === position,
				detail:
					here
						.map((key) => `${key.name} strength ${strengthOf(progress, key)} of ${MAX_STRENGTH}`)
						.join(', ') || undefined
			};
		})
	);

	/** Keys whose strength changed this round, for the summary and the ring pulse. */
	const moved = $derived(
		phase === 'done'
			? keysInPlay.filter(
					(key) =>
						!progress.waiting.includes(key.name) &&
						(!(key.name in roundStart.strength) ||
							strengthOf(progress, key) !== strengthOf(roundStart, key))
				)
			: []
	);
	const grew = $derived(
		new Set(
			moved
				.filter((key) => strengthOf(progress, key) > strengthOf(roundStart, key))
				.map((key) => key.position)
		)
	);

	onMount(() => {
		try {
			progress = parseProgress(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null'));
			sound = localStorage.getItem(SOUND_KEY) !== 'off';
			fireworks = localStorage.getItem(FX_KEY) !== 'off';
		} catch {
			progress = freshProgress();
		}
		const offNote = midi.onNote((note) => playedNote(note));
		const offPedal = midi.onPedal(() => {
			if (document.querySelector('[aria-modal="true"]')) return false;
			return go();
		});
		window.addEventListener('keydown', onKey);
		return () => {
			offNote();
			offPedal();
			window.removeEventListener('keydown', onKey);
			clearTimeout(timer);
			fx?.clear();
		};
	});

	function save(next: Progress) {
		progress = next;
		try {
			localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeProgress(next)));
		} catch {
			// The game carries on; it just will not be remembered.
		}
	}

	function remember(key: string, on: boolean) {
		try {
			localStorage.setItem(key, on ? 'on' : 'off');
		} catch {
			// Remembered for this visit only.
		}
	}

	// -------------------------------------------------------------------------
	// Sound and fireworks
	// -------------------------------------------------------------------------

	/**
	 * The key's tonic triad, kept round middle C wherever the key is. Short, so
	 * a quick run of answers stays inside the synth's sixteen voices: at 1.5
	 * seconds plus the release, fast play was dropping notes.
	 */
	function chord(key: MajorKey, velocity: number) {
		if (!sound) return;
		const root = key.pc <= 5 ? 60 + key.pc : 48 + key.pc;
		void playChord([root, root + 4, root + 7], 0.8, velocity).catch(() => {});
	}

	const stationEl = (position: number) =>
		arena?.querySelector(`[data-station="${position}"]`) ?? null;

	function toggleSound() {
		sound = !sound;
		remember(SOUND_KEY, sound);
		if (sound) void startAudio().catch(() => {});
	}

	function toggleFireworks() {
		fireworks = !fireworks;
		remember(FX_KEY, fireworks);
	}

	// -------------------------------------------------------------------------
	// The round
	// -------------------------------------------------------------------------

	function startRound() {
		if (sound) void startAudio().catch(() => {});
		clearTimeout(timer);
		fx?.clear();
		roundStart = progress;
		upcoming = undefined;
		pips = Array.from({ length: ROUND }, () => ({ state: 'open' }));
		firstHits = answered = streak = roundBest = 0;
		setIndex = 0;
		usedLenses = [];
		lastTarget = undefined;
		justMet = [];
		addedThisRound = progress.waiting.length > 0;
		result = null;
		lastPc = null;
		phase = 'play';
		beginSet();
	}

	function beginSet() {
		const waiting = KEYS.filter((key) => progress.waiting.includes(key.name));
		if (waiting.length) {
			lens = 'intro';
			queue = waiting.map((target) => ({ question: { lens: 'intro', target }, attempt: 0 }));
			showCard({
				caption: waiting.length > 1 ? `${waiting.length} new keys` : 'New key',
				title: waiting.map((key) => key.name).join(' · '),
				detail: LENS_TEXT.intro.short
			});
			return;
		}
		// Shown, then found: a set straight after an introduction is always Find.
		const next = justMet.length ? 'find' : chooseLens(progress, usedLenses);
		usedLenses = [...usedLenses, next];
		lens = next;
		setAnswered = 0;
		queue = buildSet(progress, next, Math.random, lastTarget, justMet).map((question) => ({
			question,
			attempt: 0
		}));
		justMet = [];
		showCard({
			caption: `Set ${setIndex + 1} of ${SETS_PER_ROUND}`,
			title: LENS_TEXT[next].title,
			detail: LENS_TEXT[next].short
		});
	}

	/*
	 * A card between sets says what kind of question is coming before the
	 * first one is asked. The first version switched without warning, and the
	 * only sign was a caption in small capitals beside the circle.
	 */
	function showCard(next: { caption: string; title: string; detail: string }) {
		card = next;
		announcement = `${next.caption}. ${next.title}. ${next.detail}.`;
		clearTimeout(timer);
		timer = setTimeout(endCard, CARD_MS);
	}

	function endCard() {
		clearTimeout(timer);
		if (!card) return;
		card = null;
		const first = queue[0]?.question;
		if (first) announcement = describe(first);
		void present();
	}

	async function present() {
		const next = queue[0]?.question;
		if (!next) return;
		/*
		 * The pointer must not carry an answer over. It was left on D♭ after D♭
		 * was introduced, and the next question was "Find D♭": Enter answered
		 * it. A pointer the game placed is cleared before anything on the rim.
		 */
		if (next.lens === 'intro' || next.lens === 'name') {
			aim = next.target.position;
			aimedByGame = true;
		} else if (aimedByGame) {
			aim = null;
			aimedByGame = false;
		}
		if (next.lens === 'intro') chord(next.target, 0.6);
		await tick();
		settleFocus();
		shownAt = performance.now();
	}

	/**
	 * Keep keyboard focus in the game. The chips come and go with the kind of
	 * question; when the one holding focus goes, focus moves to the station
	 * under the pointer or the first chip instead of falling to the page.
	 */
	function settleFocus() {
		if (!focusInArena || !arena) return;
		const active = document.activeElement;
		if (active && active !== document.body && arena.contains(active)) return;
		const next = queue[0]?.question;
		const target =
			next && !answeredOnRim(next)
				? arena.querySelector<HTMLElement>('[data-chip="0"]')
				: arena.querySelector<HTMLElement>(`[data-station="${aim ?? 0}"]`);
		target?.focus({ preventScroll: true });
	}

	function answer(hit: boolean, firedAt: number | null, choice?: MajorKey) {
		const turn = queue[0];
		if (phase !== 'play' || card || result || !turn) return;
		const asked = turn.question;
		const quick = hit && performance.now() - shownAt <= QUICK_MS;

		if (asked.lens === 'intro') {
			if (hit) {
				save(meet(progress, asked.target));
				justMet = [...justMet, asked.target];
				chord(asked.target, 0.7);
				fx?.spark(stationEl(asked.target.position), asked.target.pc, 0.7);
			}
			result = { hit, firedAt, quick: false };
			announcement = hit
				? `${asked.target.name} major added.`
				: `That was ${clock(firedAt ?? 0)}. ${asked.target.name} major is at ${clock(asked.target.position)}.`;
			timer = setTimeout(advance, hit ? HIT_MS : 700);
			return;
		}

		if (turn.attempt === 0) {
			const before = streak;
			let next = scored(progress, asked.target, { hit, quick });
			const slot = setIndex * SET_SIZE + Math.min(setAnswered, SET_SIZE - 1);
			pips = pips.map((pip, i) =>
				i === slot ? { state: hit ? 'hit' : 'slip', pc: asked.target.pc } : pip
			);
			setAnswered++;
			answered++;
			if (hit) {
				firstHits++;
				streak++;
				roundBest = Math.max(roundBest, streak);
				if (streak > next.bestStreak) next = { ...next, bestStreak: streak };
			} else {
				streak = 0;
			}
			save(next);
			// The play-along's words for a streak. Not its farewell: a broken
			// streak's number landed on top of the answer being revealed, at the
			// one moment the board has to be read. The counter resets in plain view.
			const words = callout({ count: before, best: 0 }, { count: streak, best: 0 });
			if (words) fx?.say(words, asked.target.pc);
		}

		// The sound is always the right key: a miss is told where it is by ear too.
		if (hit) {
			lastPc = asked.target.pc;
			chord(asked.target, 0.55 + 0.25 * tierFor(streak).intensity);
			fx?.spark(
				stationEl(asked.target.position),
				asked.target.pc,
				0.35 + 0.6 * tierFor(streak).intensity
			);
		} else {
			chord(asked.target, 0.4);
		}

		result = { hit, firedAt, choice, quick };
		const where = `${asked.target.name} major, ${clock(asked.target.position)}, ${signatureLabel(asked.target.signature).toLowerCase()}`;
		announcement = hit
			? `Right${quick ? ', and quick' : ''}. ${where}.`
			: `Not that one. ${where}.`;
		timer = setTimeout(advance, hit ? HIT_MS : MISS_MS);
	}

	function advance() {
		clearTimeout(timer);
		if (!result) return;
		lastTarget = queue[0]?.question.target;
		queue = requeue(queue, result.hit);
		result = null;
		if (queue.length) {
			void present();
			const next = queue[0].question;
			announcement = `${announcement} ${describe(next)}`;
			return;
		}
		endSet();
	}

	function endSet() {
		if (lens === 'intro') {
			beginSet();
			return;
		}
		setIndex++;
		if (setIndex >= SETS_PER_ROUND) {
			void finishRound();
			return;
		}
		if (!addedThisRound && bringInNext()) addedThisRound = true;
		beginSet();
	}

	/**
	 * Open the next key if it has been earned. Mid-round it is shown at the
	 * start of the next set; at the end of a round it waits for the next one,
	 * and is that round's new key.
	 */
	function bringInNext(): MajorKey | undefined {
		const key = nextKey(progress);
		if (!key || !readyForNext(progress)) return undefined;
		save(addKey(progress, key));
		fx?.say(`new key · ${key.name}`, key.pc);
		return key;
	}

	async function finishRound() {
		clearTimeout(timer);
		if (phase !== 'play') return;
		upcoming = bringInNext();
		result = null;
		card = null;
		queue = [];
		phase = 'done';
		const colours = [
			...new Set(
				pips.flatMap((pip) => (pip.state === 'hit' && pip.pc !== undefined ? [pip.pc] : []))
			)
		];
		if (answered === ROUND && firstHits === ROUND) fx?.finale(colours, 'clean round');
		announcement = `Round done. ${firstHits} of ${answered} right first time.${upcoming ? ` Next round brings in ${upcoming.name} major.` : ''}`;
		await tick();
		if (focusInArena) primaryButton?.focus({ preventScroll: true });
	}

	// -------------------------------------------------------------------------
	// Input: the rim, the chips, a played note, the keyboard and the pedal
	// -------------------------------------------------------------------------

	function tapStation(position: number) {
		if (phase !== 'play') {
			const [key] = keysAt(position).filter((entry) => entry.name in progress.strength);
			if (key) {
				if (sound) void startAudio().catch(() => {});
				chord(key, 0.6);
			}
			return;
		}
		if (!question || !answeredOnRim(question)) return;
		answer(position === question.target.position, position);
	}

	function choose(choice: MajorKey) {
		if (!question || !('choices' in question)) return;
		answer(choice === question.target, null, choice);
	}

	function playedNote(note: number) {
		if (!question || !answeredByNote(question) || result) return;
		const pc = mod12(note);
		answer(pc === question.target.pc, circleOfFifthsIndex(pc));
	}

	/** Enter, Space, the pedal or a tap on the hub: whatever moves things on. */
	function go(): boolean {
		if (phase !== 'play') {
			startRound();
			return true;
		}
		if (card) {
			endCard();
			return true;
		}
		if (result) {
			advance();
			return true;
		}
		return false;
	}

	function onKey(event: KeyboardEvent) {
		if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
		const target = event.target instanceof HTMLElement ? event.target : null;
		if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
		if (document.querySelector('[aria-modal="true"]')) return;
		// A focused button already answers Enter and Space itself.
		const onButton = !!target?.closest('button, a, summary');
		const confirm = event.key === 'Enter' || event.key === ' ';

		if (phase !== 'play' || card || result) {
			if (event.key === 'Escape' && phase === 'play') {
				event.preventDefault();
				void finishRound();
			} else if (confirm && !onButton) {
				event.preventDefault();
				go();
			}
			return;
		}
		if (event.key === 'Escape') {
			event.preventDefault();
			void finishRound();
			return;
		}
		if (!question) return;
		if ('choices' in question) {
			const index = Number(event.key) - 1;
			if (Number.isInteger(index) && index >= 0 && index < question.choices.length) {
				event.preventDefault();
				choose(question.choices[index]);
			}
			return;
		}
		const direction = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[event.key];
		if (direction) {
			event.preventDefault();
			aim = mod12((aim ?? (direction > 0 ? 11 : 1)) + direction);
			aimedByGame = false;
		} else if (confirm && !onButton && aim !== null) {
			event.preventDefault();
			tapStation(aim);
		}
	}

	function addNow() {
		if (upNext) save(addKey(progress, upNext));
	}

	function openEverything() {
		save(openAll(progress));
	}

	function startOver() {
		if (!confirm('Start Fifths again from C? Every key’s progress is cleared.')) return;
		save({ ...freshProgress(), bestStreak: progress.bestStreak });
	}

	// -------------------------------------------------------------------------
	// Words
	// -------------------------------------------------------------------------

	const clock = (position: number) => `${position || 12} o’clock`;
	const side = (key: MajorKey) => (key.signature > 0 ? 'sharp' : 'flat');

	function describe(asked: Question): string {
		switch (asked.lens) {
			case 'intro':
				return `New key: ${asked.target.name} major, ${signatureLabel(asked.target.signature).toLowerCase()}, at ${clock(asked.target.position)}. Tap it to add it.`;
			case 'find':
				return `Find ${asked.target.name} major.`;
			case 'find-signature':
				return `Find the key with ${signatureLabel(asked.target.signature).toLowerCase()}.`;
			case 'step':
				return `From ${asked.from.name} major, one step ${asked.direction === 1 ? 'clockwise' : 'anticlockwise'}.`;
			case 'name':
				return `Name the key at ${clock(asked.target.position)}.${sharesPosition(asked.target) ? ` The ${side(asked.target)} spelling.` : ''}`;
			case 'signature':
				return `Key signature of ${asked.target.name} major.`;
		}
	}

	function cue(asked: Question): { caption: string; text: string; small?: boolean; hint?: string } {
		switch (asked.lens) {
			case 'intro':
				return {
					caption: 'New key',
					text: asked.target.name,
					hint: `major · ${signatureLabel(asked.target.signature).toLowerCase()}`
				};
			case 'find':
				return { caption: 'Find', text: asked.target.name };
			case 'find-signature':
				return {
					caption: 'Find the key with',
					text: signatureGlyph(asked.target.signature),
					hint: signatureLabel(asked.target.signature).toLowerCase()
				};
			case 'step':
				return {
					caption: `One step ${asked.direction === 1 ? 'clockwise' : 'anticlockwise'} from`,
					text: `${asked.from.name} ${asked.direction === 1 ? '↻' : '↺'}`,
					hint: asked.direction === 1 ? 'a fifth up' : 'a fifth down'
				};
			case 'name':
				return {
					caption: 'Name the marked key',
					text: 'Which key?',
					small: true,
					hint: sharesPosition(asked.target) ? `the ${side(asked.target)} spelling` : undefined
				};
			case 'signature':
				return { caption: 'Key signature of', text: asked.target.name };
		}
	}

	const controlsHint = $derived.by(() => {
		if (!question) return '';
		const parts = [answeredOnRim(question) ? '← → aim · Enter taps' : '1 – 4 to choose'];
		if (midiReady && answeredByNote(question)) parts.push('or play the key');
		return parts.join(' · ');
	});
</script>

<svelte:head>
	<title>Fifths — Roundel</title>
	<meta
		name="description"
		content="Play the circle of fifths. Learn every major key's place, name and signature, a key at a time."
	/>
</svelte:head>

<Fireworks
	enabled={fireworks}
	palette={page.data.settings?.colorMap}
	pc={phase === 'play' && streak >= 3 ? lastPc : null}
	intensity={tier.intensity}
	onready={(api) => (fx = api)}
/>

{#snippet hub()}
	{#if phase === 'ready'}
		<p class="hub-big">{keysInPlay.length}<span>/{KEYS.length}</span></p>
		<p class="hub-hint">keys in play</p>
	{:else if phase === 'done'}
		<p class="hub-caption">First try</p>
		<p class="hub-big">{firstHits}<span>/{answered}</span></p>
		{#if roundBest >= 3}<p class="hub-hint">streak {roundBest}</p>{/if}
	{:else if card}
		<button type="button" class="hub-card" onclick={endCard}>
			<span class="hub-caption">{card.caption}</span>
			<span class="hub-title">{card.title}</span>
			<span class="hub-hint">{card.detail}</span>
		</button>
	{:else if question}
		{@const shown = cue(question)}
		{@const reveal = result && answeredOnRim(question) && question.lens !== 'intro'}
		<p class="hub-caption" class:quick={result?.quick}>
			{#if result && question.lens !== 'intro'}
				{result.hit ? (result.quick ? 'Right · quick' : 'Right') : 'Here it is'}
			{:else}
				{shown.caption}
			{/if}
		</p>
		{#if reveal}
			<p class="hub-cue" style:color="var(--pc-{question.target.pc})">{question.target.name}</p>
			<p class="hub-hint">major · {signatureLabel(question.target.signature).toLowerCase()}</p>
		{:else}
			<p class="hub-cue" class:small={shown.small}>{shown.text}</p>
			{#if shown.hint}<p class="hub-hint">{shown.hint}</p>{/if}
		{/if}
		{#if 'choices' in question}
			<div class="chips" role="group" aria-label="Answers">
				{#each question.choices as choice, index (index)}
					<button
						type="button"
						class="chip"
						class:correct={result && choice === question.target}
						class:wrong={result && !result.hit && choice === result.choice}
						style:--pitch="var(--pc-{choice.pc})"
						data-chip={index}
						aria-keyshortcuts={String(index + 1)}
						aria-label={question.lens === 'signature'
							? signatureLabel(choice.signature)
							: `${choice.name} major`}
						aria-disabled={!!result}
						onpointerdown={(event) => event.pointerType === 'mouse' && event.preventDefault()}
						onclick={() => !result && choose(choice)}
					>
						<span class="chip-key" aria-hidden="true">{index + 1}</span>
						{question.lens === 'signature' ? signatureGlyph(choice.signature) : choice.name}
					</button>
				{/each}
			</div>
		{/if}
	{/if}
{/snippet}

<main class="fifths" class:in-play={phase === 'play'}>
	<header class="masthead">
		<div class="title">
			<h1>Fifths</h1>
			{#if phase !== 'play'}<p>Circle of fifths arcade</p>{/if}
		</div>
		<div class="tools">
			{#if phase === 'play'}
				<p class="streak" class:hot={streak >= 3}>
					<span>Streak</span><strong>{streak}</strong>
				</p>
			{/if}
			<button
				type="button"
				class="toggle"
				class:on={sound}
				aria-pressed={sound}
				onclick={toggleSound}>sound</button
			>
			<button
				type="button"
				class="toggle"
				class:on={fireworks}
				aria-pressed={fireworks}
				onclick={toggleFireworks}>fireworks</button
			>
		</div>
	</header>

	<section
		class="arena"
		aria-label="Fifths"
		bind:this={arena}
		onfocusin={() => (focusInArena = true)}
		onfocusout={(event) => {
			const next = event.relatedTarget;
			if (next instanceof Node && !arena?.contains(next)) focusInArena = false;
		}}
	>
		<div class="dial">
			<FifthsBoard
				{stations}
				{hub}
				armed={!!question && answeredOnRim(question)}
				listen={phase !== 'play'}
				{aim}
				marked={question && (question.lens === 'name' || question.lens === 'intro')
					? question.target.position
					: undefined}
				impact={result && question
					? { firedAt: result.firedAt, target: question.target, hit: result.hit }
					: undefined}
				fresh={phase === 'done' ? grew : undefined}
				onaim={(position) => {
					aim = position;
					aimedByGame = false;
				}}
				onfire={tapStation}
			/>
		</div>

		<div class="panel">
			{#if phase === 'play'}
				<ol class="pips" aria-label="Round progress: {answered} of {ROUND}">
					{#each { length: SETS_PER_ROUND } as _, set (set)}
						<li class="set" class:current={set === setIndex && lens !== 'intro'}>
							{#each { length: SET_SIZE } as _, slot (slot)}
								{@const pip = pips[set * SET_SIZE + slot]}
								<span
									class="pip {pip?.state ?? 'open'}"
									style:--pitch={pip?.pc !== undefined ? `var(--pc-${pip.pc})` : undefined}
								></span>
							{/each}
						</li>
					{/each}
				</ol>
				<div class="lens">
					<h2>
						{LENS_TEXT[lens].title}{#if attempt === 1}<span class="again">again</span>{/if}
					</h2>
					<p>{LENS_TEXT[lens].long}</p>
				</div>
				<p class="controls">{controlsHint}</p>
				<button type="button" class="quiet" onclick={() => void finishRound()}
					>End round <kbd>Esc</kbd></button
				>
			{:else if phase === 'done'}
				<h2>{answered === ROUND && firstHits === ROUND ? 'Clean round' : 'Round done'}</h2>
				<p class="summary">
					{firstHits} of {answered} right first time{roundBest >= 2
						? ` · best streak ${roundBest}`
						: ''}
				</p>
				{#if moved.length}
					<ul class="moved" aria-label="Keys that moved">
						{#each moved as key (key.name)}
							{@const now = strengthOf(progress, key)}
							{@const was = strengthOf(roundStart, key)}
							<li style:--pitch="var(--pc-{key.pc})">
								<span class="moved-name">{key.name}</span>
								<span class="meter" aria-label="strength {now} of {MAX_STRENGTH}">
									{#each { length: MAX_STRENGTH } as _, i (i)}
										<i class:filled={i < now}></i>
									{/each}
								</span>
								<span class="delta" aria-hidden="true"
									>{now > was ? '↑' : now < was ? '↓' : '·'}</span
								>
							</li>
						{/each}
					</ul>
				{/if}
				{#if upcoming}
					<p class="news">
						Next round brings in <strong style:color="var(--pc-{upcoming.pc})"
							>{upcoming.name} major</strong
						>,
						{signatureLabel(upcoming.signature).toLowerCase()}.
					</p>
				{:else if upNext}
					<p class="news">
						{upNext.name} major comes in when every key is solid — {keysInPlay.length - solidCount}
						{keysInPlay.length - solidCount === 1 ? 'key' : 'keys'} to go.
					</p>
				{/if}
				<button class="action" type="button" bind:this={primaryButton} onclick={startRound}
					>Next round <span aria-hidden="true">▶</span></button
				>
				<p class="controls">Enter, Space or the sustain pedal</p>
			{:else}
				{#if isNewPlayer}
					<h2>Learn the circle a key at a time.</h2>
					<p class="summary">
						Find each key, name it, read its signature. A new one comes in whenever the keys you
						have are solid.
					</p>
				{:else}
					<h2>{solidCount} of {keysInPlay.length} keys solid</h2>
					<p class="summary">
						{#if upNext}
							{upNext.name} major comes in when every key is solid. The rings fill as a key gets quicker.
						{:else}
							The whole circle is open. The rings fill as a key gets quicker.
						{/if}
					</p>
				{/if}
				<button class="action" type="button" bind:this={primaryButton} onclick={startRound}
					>Play <span aria-hidden="true">▶</span></button
				>
				<p class="controls">Enter, Space or the sustain pedal · tap a key to hear it</p>
				<div class="extras">
					{#if upNext && progress.waiting.length === 0}
						<button type="button" class="quiet" onclick={addNow}>Add {upNext.name} now</button>
					{/if}
					{#if keysInPlay.length < KEYS.length}
						<button type="button" class="quiet" onclick={openEverything}>Open every key</button>
					{/if}
					{#if !isNewPlayer}
						<button type="button" class="quiet" onclick={startOver}>Start over</button>
					{/if}
				</div>
				{#if progress.bestStreak > 0}
					<p class="best">Best streak <strong>{progress.bestStreak}</strong></p>
				{/if}
			{/if}
		</div>
		<p class="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>
	</section>
</main>

<style>
	.fifths {
		margin-inline: auto;
		max-width: 72rem;
		padding: clamp(1.3rem, 4vw, 2.6rem) clamp(1rem, 4vw, 2rem) 2rem;
	}

	.masthead {
		display: flex;
		align-items: end;
		justify-content: space-between;
		gap: 0.7rem;
		padding-bottom: clamp(0.85rem, 2vw, 1.3rem);
		border-bottom: 1px solid var(--color-ground-line);
	}

	.masthead h1 {
		font-size: clamp(2.3rem, 5.5vw, 4.4rem);
		font-weight: 650;
		letter-spacing: -0.075em;
		line-height: 0.94;
	}

	.masthead .title p {
		margin-top: 0.45rem;
		color: var(--color-ink-muted);
		font-size: clamp(0.85rem, 2vw, 1.05rem);
	}

	.in-play {
		padding-top: clamp(0.8rem, 3vw, 1.5rem);
	}

	.in-play .masthead {
		align-items: center;
		padding-bottom: 0.6rem;
	}

	.in-play .masthead h1 {
		font-size: 1.9rem;
	}

	.tools {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.streak {
		display: grid;
		justify-items: end;
		margin-right: clamp(0.3rem, 2vw, 1.2rem);
		font-family: var(--font-mono);
	}

	.streak span {
		color: var(--color-ink-muted);
		font-size: 0.68rem;
	}

	.streak strong {
		font-size: clamp(1.3rem, 3.4vw, 2rem);
		font-variant-numeric: tabular-nums;
		font-weight: 500;
		line-height: 1.1;
	}

	.streak.hot strong {
		color: var(--color-ink);
		text-shadow: 0 0 18px color-mix(in oklab, var(--color-ink) 40%, transparent);
	}

	.toggle {
		min-height: 2.25rem;
		padding: 0.3rem 0.65rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 8px;
		color: var(--color-ink-dim);
		font: 0.7rem var(--font-mono);
		cursor: pointer;
	}

	.toggle.on {
		border-color: var(--color-ink-dim);
		color: var(--color-ink);
	}

	.arena {
		display: grid;
		grid-template-columns: minmax(0, 1.3fr) minmax(15rem, 1fr);
		align-items: start;
		gap: clamp(1.2rem, 4vw, 3.5rem);
		padding-top: clamp(1rem, 3vw, 2.2rem);
	}

	.dial {
		width: 100%;
		max-width: 36rem;
		margin-inline: auto;
	}

	.panel {
		display: grid;
		align-content: start;
		justify-items: start;
		gap: 0.9rem;
		padding-top: clamp(0.4rem, 3vw, 2rem);
	}

	.panel h2 {
		font-size: clamp(1.6rem, 3.4vw, 2.6rem);
		font-weight: 650;
		letter-spacing: -0.05em;
		line-height: 1.02;
	}

	.summary,
	.lens p,
	.news {
		max-width: 30rem;
		color: var(--color-ink-muted);
		line-height: 1.45;
	}

	.news strong {
		font-weight: 650;
	}

	.controls {
		color: var(--color-ink-dim);
		font: 0.72rem var(--font-mono);
	}

	/* Keys and a pedal mean nothing on a phone held in the hand. */
	@media (pointer: coarse) {
		.controls {
			display: none;
		}
	}

	/* ---- hub ---- */

	.hub-caption {
		color: var(--color-ink-muted);
		font: 500 clamp(0.6rem, 2.3cqi, 0.82rem) var(--font-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}

	.hub-caption.quick {
		color: var(--color-ink);
	}

	.hub-cue {
		font-size: clamp(1.9rem, 12cqi, 4.6rem);
		font-weight: 650;
		letter-spacing: -0.05em;
		line-height: 1;
	}

	.hub-cue.small {
		font-size: clamp(1.15rem, 6.2cqi, 2.3rem);
		letter-spacing: -0.03em;
	}

	.hub-hint {
		max-width: 40cqi;
		color: var(--color-ink-muted);
		font-size: clamp(0.72rem, 2.8cqi, 1rem);
		line-height: 1.3;
	}

	.hub-big {
		font: 500 clamp(2.2rem, 14cqi, 5rem) var(--font-mono);
		font-variant-numeric: tabular-nums;
		letter-spacing: -0.04em;
		line-height: 1;
	}

	.hub-big span {
		color: var(--color-ink-dim);
		font-size: 0.45em;
	}

	.hub-card {
		display: grid;
		justify-items: center;
		gap: 1.6cqi;
		max-width: 46cqi;
		cursor: pointer;
		animation: card-in 220ms var(--ease-wheel) both;
	}

	.hub-title {
		font-size: clamp(1.3rem, 7.5cqi, 2.8rem);
		font-weight: 650;
		letter-spacing: -0.045em;
		line-height: 1.02;
	}

	@keyframes card-in {
		from {
			opacity: 0;
			transform: scale(0.94);
		}
	}

	.chips {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1.3cqi;
		width: 35cqi;
		margin-top: 0.6cqi;
	}

	.chip {
		position: relative;
		min-height: max(2.75rem, 9.5cqi);
		border: 1px solid var(--color-ground-line);
		border-radius: 6px;
		background: var(--color-ground-raised);
		font-size: clamp(1rem, 5.2cqi, 1.9rem);
		font-weight: 650;
		line-height: 1;
		touch-action: manipulation;
	}

	.chip[aria-disabled='false'] {
		cursor: pointer;
	}

	.chip[aria-disabled='false']:is(:hover, :focus-visible) {
		border-color: var(--color-ink-muted);
		background: var(--color-ground-overlay);
	}

	.chip.correct {
		border: 2px solid var(--pitch);
		background: color-mix(in oklch, var(--pitch) 16%, var(--color-ground));
	}

	/* The choice that was made instead. Ink, dashed, never red. */
	.chip.wrong {
		border: 1px dashed var(--color-ink-muted);
		color: var(--color-ink-muted);
	}

	.chip-key {
		position: absolute;
		top: 0.22rem;
		left: 0.32rem;
		color: var(--color-ink-dim);
		font: 400 0.6rem var(--font-mono);
	}

	@media (pointer: coarse) {
		.chip-key {
			display: none;
		}
	}

	/* ---- panel: play ---- */

	.pips {
		display: flex;
		gap: 0.8rem;
	}

	.set {
		display: flex;
		gap: 0.28rem;
		padding-bottom: 0.35rem;
		border-bottom: 2px solid transparent;
	}

	.set.current {
		border-color: var(--color-ink-dim);
	}

	.pip {
		width: 0.7rem;
		aspect-ratio: 1;
		border: 1px solid var(--color-ink-dim);
		border-radius: 50%;
	}

	.pip.hit {
		border-color: var(--pitch);
		background: var(--pitch);
	}

	.pip.slip {
		border: 1px dashed var(--color-ink-muted);
	}

	.lens h2 {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		font-size: clamp(1.3rem, 2.6vw, 1.9rem);
	}

	.lens p {
		margin-top: 0.4rem;
	}

	.again {
		color: var(--color-ink-muted);
		font: 0.72rem var(--font-mono);
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.quiet {
		min-height: 2.5rem;
		padding: 0.35rem 0.1rem;
		color: var(--color-ink-muted);
		font-size: 0.85rem;
		text-decoration: underline;
		text-decoration-color: var(--color-ground-line);
		text-underline-offset: 0.25em;
		cursor: pointer;
	}

	.quiet:hover {
		color: var(--color-ink);
		text-decoration-color: currentColor;
	}

	kbd {
		margin-left: 0.3rem;
		padding: 0.05rem 0.3rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 3px;
		font: 0.65rem var(--font-mono);
		text-decoration: none;
	}

	/* ---- panel: ready and done ---- */

	.action {
		display: inline-flex;
		min-height: 2.9rem;
		align-items: center;
		gap: 1.4rem;
		padding: 0.55rem 1rem;
		border: 1px solid var(--color-ink);
		border-radius: 6px;
		background: var(--color-ink);
		color: var(--color-ground);
		font-weight: 650;
		cursor: pointer;
		touch-action: manipulation;
	}

	.action:hover {
		background: var(--color-ink-muted);
	}

	.extras {
		display: flex;
		flex-wrap: wrap;
		gap: 0.2rem 1.1rem;
	}

	.best {
		color: var(--color-ink-muted);
		font-size: 0.85rem;
	}

	.best strong {
		margin-left: 0.3rem;
		color: var(--color-ink);
		font-family: var(--font-mono);
	}

	.moved {
		display: grid;
		gap: 0.35rem;
		width: 100%;
		max-width: 20rem;
	}

	.moved li {
		display: grid;
		grid-template-columns: 2.6rem 1fr auto;
		align-items: center;
		gap: 0.6rem;
	}

	.moved-name {
		color: var(--pitch);
		font-size: 1.05rem;
		font-weight: 650;
	}

	.meter {
		display: flex;
		gap: 0.2rem;
	}

	.meter i {
		width: 1.1rem;
		height: 0.32rem;
		border-radius: 2px;
		background: var(--color-ground-line);
	}

	.meter i.filled {
		background: var(--pitch);
	}

	.delta {
		color: var(--color-ink-muted);
		font-family: var(--font-mono);
	}

	@media (max-width: 52rem) {
		.arena {
			grid-template-columns: minmax(0, 1fr);
			gap: 1rem;
			padding-top: 0.9rem;
		}

		.dial {
			max-width: min(30rem, 62dvh);
		}

		.panel {
			padding-top: 0;
		}

		.masthead .title p {
			display: none;
		}
	}
</style>
