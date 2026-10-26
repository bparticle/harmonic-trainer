<script lang="ts">
	import { onMount } from 'svelte';
	import ChordSymbol from '$lib/components/ChordSymbol.svelte';
	import Fireworks, { type FireworksApi } from '$lib/components/Fireworks.svelte';
	import Keyboard from '$lib/components/Keyboard.svelte';
	import { midi } from '$lib/midi/shared.svelte';
	import { playChord, startAudio } from '$lib/audio/engine';
	import { formatChord } from '$lib/music/chord';
	import { circleOfFifthsIndex } from '$lib/music/key';
	import { formatPitch, midi as keyOf, pitchClass } from '$lib/music/note';
	import { spellChromatic } from '$lib/music/spell';
	import { shouldHandleSpace } from '$lib/shortcuts';
	import CircleTrack, { type Station } from '$lib/recipes/CircleTrack.svelte';
	import HopBand, { type Arc, type Mark } from '$lib/recipes/HopBand.svelte';
	import RecipeCard, { type CardTone } from '$lib/recipes/RecipeCard.svelte';
	import StopEmblem from '$lib/recipes/StopEmblem.svelte';
	import {
		INTERCHANGE,
		SECTIONS,
		STOPS,
		stopById,
		type Figure,
		type Item,
		type StopId
	} from '$lib/recipes/line';
	import {
		cook,
		halfSteps,
		intervalName,
		noteLabel,
		recipeName,
		rootsFor,
		stepName,
		tonesOf,
		type RecipeId,
		type Tone
	} from '$lib/recipes/recipes';
	import {
		ROUND_VERSION,
		begin,
		current,
		emptyPlate,
		hear,
		isClean,
		isComplete,
		isOver,
		isPractised,
		isScored,
		replay,
		resultOf,
		serve,
		type LineRecord,
		type Plate,
		type Round,
		type Submission
	} from '$lib/recipes/round';

	/*
	 * Chord recipes.
	 *
	 * A line of short stops, each teaching one idea by having it played: what a
	 * key's distance is, what a third is, how a major chord is built, what
	 * moving one note does to it. Every answer is a note played on the keys — a
	 * key always means the pitch it sounds, and never stands in for a button.
	 *
	 * The words are the standard ones — half step, major third, dominant
	 * seventh — and every stop says what it teaches before it asks anything: a
	 * short briefing with the recipe drawn on C. Every question then says in one
	 * plain sentence what to play. The drawing still does the showing: the first
	 * item of a stop plays itself once, then hands over, and the card, the arcs
	 * over the keys and the colours of the notes carry the rest.
	 */

	let { data } = $props();

	// The server's numbers, replaced by the server's numbers after every save.
	// svelte-ignore state_referenced_locally
	let record = $state<LineRecord>(data.record);

	type View = 'line' | 'brief' | 'play' | 'done';
	let view = $state<View>('line');
	/** The stop whose briefing is open. */
	let briefing = $state<StopId | null>(null);
	let round = $state<Round | null>(null);
	let roundId = '';
	let plate = $state<Plate>(emptyPlate());
	/** `show` while the item is demonstrating itself; `landed` once it is done. */
	let phase = $state<'show' | 'play' | 'landed'>('play');
	/** Two slips on an unguided item draw the way in, rather than leaving it a puzzle. */
	let assisted = $state(false);
	let stray = $state<{ note: number; keys: number | null; serial: number } | null>(null);
	/** A morph starts drawn as the chord it leaves, and slides into the new one. */
	let morphed = $state(false);
	let demo = $state<{ notes: number[]; arc: Arc | null; naming: boolean } | null>(null);
	let words = $state('');
	let spoken = $state('');

	let fireworks = $state(true);
	let fx: FireworksApi | null = null;
	let pending = $state<Submission[]>([]);
	let saving = $state(false);
	let saveTrouble = $state(false);

	/*
	 * G2 to E5. Every item is rooted in octave 3 and reaches at most an octave
	 * above it, so this leaves keys either side of the action: what is asked
	 * for never sits on the very edge of the drawing. A narrow screen gets the
	 * two octaves that hold everything, C3 to C5, so the keys stay big enough to
	 * press with a finger.
	 */
	let narrow = $state(false);
	const FROM = $derived(narrow ? 48 : 43);
	const COUNT = $derived(narrow ? 25 : 34);
	const FX_KEY = 'roundel:recipes:fireworks';
	const outboxKey = $derived(`roundel:recipes:outbox:${data.userId}`);

	const stop = $derived(round ? stopById(round.spec.stop)! : null);
	const entry = $derived(round ? current(round) : null);
	const item = $derived<Item | null>(round && entry ? round.items[entry.item] : null);
	const result = $derived(round ? resultOf(round) : null);

	const recipeStops = STOPS.filter((s) => s.line === 'recipes');
	const circleStops = STOPS.filter((s) => s.line === 'circle');

	/** The first stop not yet ridden, along the recipe line, then the circle line. */
	const suggested = $derived(
		[...recipeStops, ...circleStops].find((s) => record[s.id].rounds === 0)?.id ?? null
	);

	const nextStop = $derived.by(() => {
		if (!stop) return null;
		const line = stop.line === 'recipes' ? recipeStops : circleStops;
		const at = line.findIndex((s) => s.id === stop.id);
		if (at < line.length - 1) return line[at + 1];
		// The end of the recipe line: back to the branch that is still to ride.
		return stop.line === 'recipes' ? circleStops[0] : stopById('major')!;
	});

	const briefStop = $derived(briefing ? stopById(briefing)! : null);
	/** Nothing ridden yet: the introduction starts open. */
	const firstVisit = $derived(STOPS.every((s) => record[s.id].rounds === 0));

	// -------------------------------------------------------------------------
	// The introduction's worked example: one recipe, on whatever key is pressed
	// -------------------------------------------------------------------------

	/*
	 * The single idea the page rests on, shown rather than claimed: press any
	 * key and the same recipe is built on it. Every colour changes; the counts
	 * on the card and the arcs over the keys do not.
	 */
	const EXAMPLE_FROM = 48;
	const EXAMPLE_COUNT = 20;
	const EXAMPLE_RECIPES: RecipeId[] = ['major', 'minor'];
	let exampleRecipe = $state<RecipeId>('major');
	let exampleRoot = $state(0);
	const example = $derived.by(() => {
		const root =
			rootsFor(exampleRecipe).find((r) => pitchClass(r) === exampleRoot) ??
			rootsFor(exampleRecipe)[0];
		const chord = cook(exampleRecipe, root);
		return { chord, tones: tonesOf(chord) };
	});
	const exampleKeys = $derived(example.tones.map((tone) => keyOf(tone.note)));
	const exampleArcs = $derived(
		exampleKeys
			.slice(1)
			.map((to, i): Arc => ({ id: `ex-${i}`, from: exampleKeys[i], to, look: 'solid' }))
	);
	const exampleMarks = $derived(
		example.tones.map((tone): Mark => ({
			note: keyOf(tone.note),
			pc: pitchClass(tone.note),
			name: formatPitch(tone.note),
			look: 'on'
		}))
	);

	function tryRoot(note: number) {
		exampleRoot = ((note % 12) + 12) % 12;
		sound(exampleKeys, 1.1, 0.5);
	}

	function tryRecipe(id: RecipeId) {
		void startAudio().catch(() => {});
		exampleRecipe = id;
		sound(exampleKeys, 1.1, 0.5);
	}

	/** Every tone drawn sounding and named: a worked example has nothing to find. */
	const shown = (tones: Tone[]): CardTone[] =>
		tones.map((tone, slot) => ({
			slot,
			offset: tone.offset,
			degree: tone.degree,
			pc: pitchClass(tone.note),
			name: formatPitch(tone.note),
			look: 'on'
		}));

	/**
	 * `1 ♭3 5 · C E♭ G`, the recipe and what it makes on this root; for a
	 * lone distance, `whole step · 2 half steps`.
	 */
	const formula = (tones: Tone[]) =>
		tones.length > 2
			? `${tones.map((tone) => tone.degree).join(' ')} · ${tones.map((tone) => noteLabel(tone.note)).join(' ')}`
			: `${stepName(tones[1].offset)} · ${halfSteps(tones[1].offset)}`;

	/** `C major triad`; for a lone distance, the two notes: `E → F♯`. */
	const figureTitle = (figure: Figure) =>
		figure.recipe
			? `${noteLabel(figure.tones[0].note)} ${recipeName(figure.recipe)}`
			: figure.tones.map((tone) => noteLabel(tone.note)).join(' → ');

	const figureFrom = (figure: Figure) =>
		figure.from ? `from ${formatChord(cook(figure.from, figure.tones[0].note), true)}` : '';

	function hearFigure(figure: Figure) {
		void startAudio().catch(() => {});
		const keys = figure.tones.map((tone) => keyOf(tone.note));
		if (figure.chord) sound(keys, 1.2, 0.5);
		else {
			sound([keys[0]], 0.6, 0.5);
			later(450, () => sound([keys[1]], 0.8, 0.5));
		}
	}

	const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

	// -------------------------------------------------------------------------
	// What the current item looks like
	// -------------------------------------------------------------------------

	const keyAt = (it: Item, i: number) => keyOf(it.tones[i].note);
	const pcAt = (it: Item, i: number) => pitchClass(it.tones[i].note);
	const nameAt = (it: Item, i: number) => formatPitch(it.tones[i].note);

	const sounding = $derived(item ? [...item.given, ...plate.found] : []);
	const open = $derived(item ? item.wanted.filter((i) => !plate.found.includes(i)) : []);
	/**
	 * A morph is first drawn as the chord it leaves, on the card and on the keys
	 * together, so the note that moves is seen to move.
	 */
	const leaving = $derived(item?.before !== null && item?.before !== undefined && !morphed);
	/** The notes to find are drawn on the keys: copying, or helped after two slips. */
	const guided = $derived(item !== null && !leaving && (item.hint === 'keys' || assisted));

	/** What the keys show as sounding: the chord being left, or the one being built. */
	const onKeys = $derived.by(() => {
		if (!item) return [];
		if (leaving && item.before) {
			return item.before.tones.map((tone) => ({
				note: keyOf(tone.note),
				pc: pitchClass(tone.note),
				name: formatPitch(tone.note),
				offset: tone.offset
			}));
		}
		return sounding.map((i) => ({
			note: keyAt(item, i),
			pc: pcAt(item, i),
			name: nameAt(item, i),
			offset: item.tones[i].offset
		}));
	});

	/** Tones in the order a hand would stack them. */
	const stack = $derived(
		item
			? item.tones.map((_, i) => i).sort((a, b) => item.tones[a].offset - item.tones[b].offset)
			: []
	);

	const arcs = $derived.by((): Arc[] => {
		if (!item) return [];
		const out: Arc[] = [];
		if (leaving) {
			const keys = onKeys.map((tone) => tone.note).sort((a, b) => a - b);
			for (let n = 1; n < keys.length; n++) {
				out.push({ id: `was-${n}`, from: keys[n - 1], to: keys[n], look: 'solid' });
			}
		} else {
			for (let n = 1; n < stack.length; n++) {
				const a = stack[n - 1];
				const b = stack[n];
				const both = sounding.includes(a) && sounding.includes(b);
				if (both || guided) {
					out.push({
						id: `${a}-${b}`,
						from: keyAt(item, a),
						to: keyAt(item, b),
						look: both ? 'solid' : 'ghost'
					});
				}
			}
		}
		if (stray && stray.keys !== null) {
			const root = keyAt(item, 0);
			out.push({ id: `stray-${stray.serial}`, from: root, to: root + stray.keys, look: 'stray' });
		}
		if (demo?.arc) out.push(demo.arc);
		return out;
	});

	const marks = $derived.by((): Mark[] => {
		if (!item) return [];
		const out: Mark[] = onKeys.map((tone) => ({
			note: tone.note,
			pc: tone.pc,
			name: tone.name,
			look: 'on' as const
		}));
		if (guided || (demo?.naming && !leaving)) {
			for (const i of open) {
				out.push({ note: keyAt(item, i), pc: pcAt(item, i), name: nameAt(item, i), look: 'open' });
			}
		}
		if (stray) {
			const root = keyAt(item, 0);
			const note = stray.keys !== null ? root + stray.keys : FROM + (((stray.note % 12) + 12) % 12);
			out.push({
				note,
				pc: ((stray.note % 12) + 12) % 12,
				name: formatPitch(spellChromatic(stray.note, 'sharp'), true),
				look: 'stray'
			});
		}
		return out;
	});

	const cardTones = $derived.by((): CardTone[] => {
		if (!item) return [];
		const before = item.before;
		if (before && !morphed) {
			return before.tones.map((tone, slot) => ({
				slot,
				offset: tone.offset,
				degree: tone.degree,
				pc: pitchClass(tone.note),
				name: formatPitch(tone.note),
				look: 'on'
			}));
		}
		return item.tones.map((tone, slot) => {
			const on = sounding.includes(slot);
			const named = on || guided || demo?.naming;
			return {
				slot,
				offset: tone.offset,
				degree: on || item.hint !== 'name' ? tone.degree : '',
				pc: pitchClass(tone.note),
				name: named ? formatPitch(tone.note) : '',
				look: on ? 'on' : item.hint === 'name' && !named ? 'hidden' : 'open'
			};
		});
	});

	/** Where the moving note of a morph used to be. */
	const ghost = $derived.by(() => {
		if (!item?.before || !morphed || item.hint === 'name' || phase === 'landed') return null;
		const slot = item.wanted[0];
		const was = item.before.tones[slot];
		if (!was || was.offset === item.tones[slot].offset) return null;
		return { offset: was.offset, pc: pitchClass(was.note) };
	});

	/** Half steps between the root and the landing, for a hop. */
	const hopKeys = $derived(item && item.tones.length === 2 ? item.tones[1].offset : 0);

	// The circle: which stations this trip has reached, spelled as it reached them.
	const trip = $derived.by(() => {
		if (!round || !item?.circle || !entry) return null;
		const lap = Math.floor(entry.item / 12) * 12;
		const reached = round.items.slice(lap, entry.item + 1).map((it) => it.tones[0].note);
		if (isComplete(item, plate)) reached.push(item.tones[1].note);
		const names = new Map<number, string>();
		for (const note of reached) names.set(pitchClass(note), formatPitch(note, true));
		const stations: Station[] = Array.from({ length: 12 }, (_, position) => {
			const pc = (position * 7) % 12;
			const name = names.get(pc);
			const here = pc === pitchClass(item.tones[0].note) && !isComplete(item, plate);
			return {
				pc,
				name: name ?? '',
				look: name === undefined ? 'unknown' : here ? 'here' : 'visited'
			};
		});
		const positions = reached.map((note) => circleOfFifthsIndex(pitchClass(note)));
		const legs = positions.slice(1).map((p, i) => [positions[i], p] as [number, number]);
		return { stations, legs, direction: item.circle.direction };
	});

	/** The whole circle, as the last lap of the round spelled it: the map you drew. */
	const finishedCircle = $derived.by(() => {
		if (!round || !isOver(round)) return null;
		const last = round.items.at(-1);
		if (!last?.circle) return null;
		const lap = round.items.slice(-12);
		const names = new Map(
			lap.map((it) => [pitchClass(it.tones[1].note), formatPitch(it.tones[1].note, true)])
		);
		const stations: Station[] = Array.from({ length: 12 }, (_, position) => {
			const pc = (position * 7) % 12;
			return { pc, name: names.get(pc) ?? '', look: 'visited' };
		});
		const legs = Array.from({ length: 12 }, (_, i) =>
			last.circle!.direction === 1
				? ([i, (i + 1) % 12] as [number, number])
				: ([(i + 1) % 12, i] as [number, number])
		);
		return { stations, legs, direction: last.circle.direction };
	});

	const pips = $derived.by(() => {
		if (!round) return [];
		return round.queue.map((q, i) => {
			const it = round!.items[q.item];
			const outcome = round!.outcomes[i];
			return {
				pc: pitchClass(it.tones[0].note),
				state: outcome
					? isClean(outcome)
						? 'clean'
						: 'helped'
					: i === round!.position
						? 'now'
						: 'later',
				again: q.again,
				copying: !isScored(it)
			};
		});
	});

	/** `D major triad`, `F♯ half-diminished seventh`; for a hop, what it is called. */
	const nameOf = (it: Item): string =>
		it.recipe
			? `${noteLabel(it.tones[0].note)} ${recipeName(it.recipe)}`
			: stepName(it.tones[1].offset);

	const NUMBERS = ['no', 'one', 'two', 'three', 'four'];

	/** `the major third and the perfect fifth`. */
	const listOf = (parts: string[]) =>
		parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;

	/**
	 * What to play, in one plain sentence.
	 *
	 * The first version said nothing at all and left the drawing to explain the
	 * question; a player who misread the drawing had no way to find out what was
	 * being asked. Now every item says it, in the same terms the briefing used,
	 * and gives away no more than the hint does: with the name only, the
	 * distance is not counted out.
	 */
	function task(it: Item, marked: boolean): string {
		const root = noteLabel(it.tones[0].note);
		const counted = it.hint !== 'name';
		const shown = marked ? ' The keys to play are marked.' : '';
		if (!it.chord) {
			const keys = it.tones[1].offset;
			const count = counted ? ` (${halfSteps(keys)})` : '';
			return it.circle
				? `From ${root}, go up a ${stepName(keys)}${count}.${shown}`
				: `Play the note a ${stepName(keys)}${count} above ${root}.${shown}`;
		}
		// Chords are named in words here, never by symbol alone: "make E" reads
		// as the note E. The symbol is in the headline above.
		const name = nameOf(it);
		if (it.before) {
			const from = `The ${root} ${recipeName(it.before.recipe)} is on the keys.`;
			return it.before.tones.length < it.tones.length
				? `${from} Add one note to make the ${name}: play only the new note.${shown}`
				: `${from} Move one note to make the ${name}: play only the note that changes.${shown}`;
		}
		if (it.kind === 'fill') {
			return `The ${name} is on the keys with one note missing. Play the missing note.${shown}`;
		}
		if (it.given.includes(0)) {
			const add = it.wanted.map((i) => `the ${intervalName(it.tones[i].degree)}`);
			return `The root, ${root}, is on the keys. Add ${listOf(add)}.${shown}`;
		}
		return `Play all ${NUMBERS[it.tones.length]} notes, root included, in any order.${shown}`;
	}

	const describe = (it: Item): string =>
		`${it.chord ? `${formatChord(it.chord, true)}, ${nameOf(it)}` : capitalise(nameOf(it))}. ${task(it, it.hint === 'keys')}`;

	// -------------------------------------------------------------------------
	// Sound, celebrated or not
	// -------------------------------------------------------------------------

	function sound(notes: number[], seconds = 0.9, velocity = 0.6) {
		void playChord(notes, seconds, velocity).catch(() => {});
	}

	/** Spark from the station a note just landed on: the card, or the circle. */
	function sparkAt(slot: number, pc: number, power = 0.5) {
		const at = item?.circle
			? document.querySelector(`[data-station="${circleOfFifthsIndex(pc)}"]`)
			: document.querySelector(`[data-tone="${slot}"]`);
		fx?.spark(at, pc, power);
	}

	// -------------------------------------------------------------------------
	// Playing
	// -------------------------------------------------------------------------

	type Timers = Set<ReturnType<typeof setTimeout>>;
	const timers: Timers = new Set();
	/** The demonstration's own, so stopping it stops nothing else on the page. */
	const demoTimers: Timers = new Set();
	function later(ms: number, run: () => void, set: Timers = timers) {
		const timer = setTimeout(() => {
			set.delete(timer);
			run();
		}, ms);
		set.add(timer);
	}
	function cancel(set: Timers) {
		for (const timer of set) clearTimeout(timer);
		set.clear();
	}
	function clearTimers() {
		cancel(timers);
		cancel(demoTimers);
	}

	let straySerial = 0;
	/** Clean items in a row, for the fireworks only: it is never shown as a score. */
	let run = 0;

	function onNote(note: number) {
		if (document.querySelector('[aria-modal="true"]')) return;
		if (view === 'line') return tryRoot(note);
		if (view !== 'play' || !item || phase === 'landed') return;
		// Playing is the answer to a demonstration, running or about to start.
		stopDemo();

		const { plate: next, heard } = hear(item, plate, note);
		plate = next;
		if (heard.kind === 'found') {
			stray = null;
			const tone = item.tones[heard.tone];
			sparkAt(heard.tone, pitchClass(tone.note));
			const name = formatPitch(tone.note, true);
			const root = noteLabel(item.tones[0].note);
			// Named as what it is: the chord's own word for it, or the distance.
			words = item.chord
				? `${name} · ${tone.degree === '1' ? 'the root' : `the ${intervalName(tone.degree)}`}`
				: `${name} · a ${stepName(tone.offset)} above ${root}`;
			spoken = `${name}, found.`;
			if (isComplete(item, plate)) land();
		} else if (heard.kind === 'stray') {
			const serial = ++straySerial;
			stray = { note, keys: heard.keys, serial };
			const where = formatPitch(spellChromatic(note, 'sharp'), true);
			// Counted from the root, the same way the arc over the keys counts it.
			const counted =
				heard.keys === null
					? where
					: `${where} is ${halfSteps(heard.keys)} above ${noteLabel(item.tones[0].note)}`;
			words = item.chord ? `${counted} · not in the ${nameOf(item)}` : counted;
			spoken = `${where} is not in this one.`;
			if (plate.strays.length >= 2 && item.hint !== 'keys') assisted = true;
			later(1600, () => {
				if (stray?.serial === serial) stray = null;
			});
		}
	}

	function land() {
		if (!item) return;
		phase = 'landed';
		stray = null;
		const notes = item.tones.map((_, i) => keyAt(item, i));
		// Built one note at a time, it has not been heard as a chord yet: sound it.
		// Held down together, the piano already said it.
		const held = new Set(midi.held.map((n) => ((n % 12) + 12) % 12));
		if (!item.tones.every((tone) => held.has(pitchClass(tone.note)))) {
			sound(notes, 1.3, 0.55);
		}
		if (item.before) morphed = true;
		const rootPc = pitchClass(item.tones[0].note);
		const at = item.circle
			? document.querySelector(
					`[data-station="${circleOfFifthsIndex(pitchClass(item.tones[1].note))}"]`
				)
			: document.querySelector('.stage-card');
		fx?.land(at, item.circle ? pitchClass(item.tones[1].note) : rootPc, item.chord ? 0.9 : 0.5);
		// A run of clean items is worth a word once it is a run. Only clean ones
		// count, and a slip ends it quietly: nothing here says so.
		run = plate.strays.length === 0 && !plate.shown ? run + 1 : 0;
		if (run >= 3) fx?.say(`${run} in a row`, item.circle ? pitchClass(item.tones[1].note) : rootPc);
		later(item.circle ? 800 : 1150, advance);
	}

	function advance() {
		if (!round) return;
		round = serve(round, { strays: plate.strays.length, shown: plate.shown });
		if (isOver(round)) finish();
		else startItem();
	}

	function startItem() {
		clearTimers();
		demo = null;
		plate = emptyPlate();
		assisted = false;
		stray = null;
		words = '';
		phase = 'play';
		morphed = false;
		if (!item) return;
		spoken = describe(item);
		// A morph shows the chord it leaves for a moment, then moves, unless the
		// move is the question.
		if (item.before && item.hint !== 'name') later(650, () => (morphed = true));
		const first = round?.position === 0;
		if (first && item.hint === 'keys') {
			later(item.before ? 1300 : 700, () => runDemo(false), demoTimers);
		}
	}

	// -------------------------------------------------------------------------
	// Showing
	// -------------------------------------------------------------------------

	/**
	 * Play the rest of the item, slowly, for the player to copy.
	 *
	 * Every key counted is stepped on, one at a time, quietly, with the landing
	 * louder: the distance is heard as well as seen. Playing anything stops it —
	 * a demonstration is never a gate.
	 */
	function runDemo(asked: boolean) {
		if (!item || phase === 'landed') return;
		stopDemo();
		if (asked && isScored(item)) plate = { ...plate, shown: true };
		// Showing a morph shows the move, so the card and the keys make it first.
		morphed = true;
		phase = 'show';
		const it = item;
		const order = [...open].sort((a, b) => it.tones[a].offset - it.tones[b].offset);
		const pressed = sounding.map((i) => keyAt(it, i));
		demo = { notes: [], arc: null, naming: true };
		let t = 250;
		const STONE = 120;
		for (const slot of order) {
			const to = keyAt(it, slot);
			const below = [...sounding, ...order.slice(0, order.indexOf(slot))]
				.map((i) => keyAt(it, i))
				.filter((n) => n < to);
			const from = below.length ? Math.max(...below) : keyAt(it, 0);
			const keys = to - from;
			for (let k = 1; k <= keys; k++) {
				later(
					t + k * STONE,
					() => {
						demo = {
							notes: [...pressed],
							arc: { id: `demo-${slot}`, from, to, look: 'ghost', lit: k },
							naming: true
						};
						sound([from + k], 0.25, k === keys ? 0.6 : 0.18);
					},
					demoTimers
				);
			}
			t += keys * STONE + 450;
			later(t - 300, () => pressed.push(to), demoTimers);
		}
		later(
			t,
			() => {
				demo = { notes: it.tones.map((_, i) => keyAt(it, i)), arc: null, naming: true };
				sound(
					it.tones.map((_, i) => keyAt(it, i)),
					1.2,
					0.5
				);
			},
			demoTimers
		);
		later(
			t + 1100,
			() => {
				demo = null;
				if (phase === 'show') phase = 'play';
			},
			demoTimers
		);
	}

	function stopDemo() {
		cancel(demoTimers);
		demo = null;
		if (phase === 'show') phase = 'play';
	}

	// -------------------------------------------------------------------------
	// Rounds
	// -------------------------------------------------------------------------

	/** A stop, opened from the map or the end of the last one: its briefing first. */
	function openStop(id: StopId) {
		void startAudio().catch(() => {});
		clearTimers();
		fx?.clear();
		demo = null;
		round = null;
		briefing = id;
		view = 'brief';
		window.scrollTo({ top: 0 });
	}

	function ride(id: StopId) {
		void startAudio().catch(() => {});
		clearTimers();
		fx?.clear();
		briefing = null;
		round = begin({
			line: 'recipes',
			stop: id,
			seed: crypto.getRandomValues(new Uint32Array(1))[0],
			practised: isPractised(record[id]),
			version: ROUND_VERSION
		});
		roundId = crypto.randomUUID();
		run = 0;
		view = 'play';
		window.scrollTo({ top: 0 });
		startItem();
	}

	function finish() {
		if (!round) return;
		clearTimers();
		view = 'done';
		const used = new Set(
			round.items.flatMap((it) => it.tones.map((tone) => pitchClass(tone.note)))
		);
		// Confetti and no word: the score is on the page in ink, and saying it
		// again in a colour would turn a number into a verdict.
		fx?.finale([...used], '');
		pending = [...pending, { id: roundId, spec: round.spec, outcomes: round.outcomes }];
		keepOutbox();
		void flush();
	}

	function toLine() {
		clearTimers();
		demo = null;
		view = 'line';
		round = null;
		briefing = null;
	}

	// -------------------------------------------------------------------------
	// Saving: an outbox, so a round played offline is not a round lost
	// -------------------------------------------------------------------------

	function keepOutbox() {
		try {
			localStorage.setItem(outboxKey, JSON.stringify(pending));
		} catch {
			// Private browsing: the round still saves while this page is open.
		}
	}

	async function flush() {
		if (saving || pending.length === 0) return;
		saving = true;
		try {
			while (pending.length) {
				const next = pending[0];
				const response = await fetch('/api/recipes', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(next)
				});
				// Refused outright: sending it again would be refused again.
				if (response.status === 400 || response.status === 409 || response.status === 413) {
					pending = pending.slice(1);
					keepOutbox();
					continue;
				}
				if (!response.ok) throw new Error(`save failed: ${response.status}`);
				const saved = (await response.json()) as { record: LineRecord };
				record = saved.record;
				pending = pending.slice(1);
				keepOutbox();
			}
			saveTrouble = false;
		} catch {
			saveTrouble = true;
		} finally {
			saving = false;
		}
	}

	// -------------------------------------------------------------------------
	// Hands free
	// -------------------------------------------------------------------------

	function primary() {
		if (view === 'line') openStop(suggested ?? 'half');
		else if (view === 'brief' && briefing) ride(briefing);
		else if (view === 'play') runDemo(true);
		else if (view === 'done' && nextStop) openStop(nextStop.id);
	}

	function onkeydown(event: KeyboardEvent) {
		if (document.querySelector('[aria-modal="true"]')) return;
		if (shouldHandleSpace(event)) {
			event.preventDefault();
			primary();
		} else if (event.key === 'Escape' && view !== 'line') {
			event.preventDefault();
			toLine();
		}
	}

	onMount(() => {
		const width = matchMedia('(max-width: 700px)');
		const fit = () => (narrow = width.matches);
		fit();
		width.addEventListener('change', fit);

		try {
			const stored = localStorage.getItem(FX_KEY);
			if (stored !== null) fireworks = stored === 'on';
			const queued: unknown = JSON.parse(localStorage.getItem(outboxKey) ?? '[]');
			if (Array.isArray(queued)) {
				pending = queued.flatMap((value) => {
					const checked = replay(value);
					return checked ? [checked.submission] : [];
				});
			}
		} catch {
			// Nothing stored, or nothing readable: start clean.
		}
		void flush();

		const offNote = midi.onNote((note) => onNote(note));
		/*
		 * The pedal starts a stop and moves on from a finished one, and does
		 * nothing while an item is waiting for your hands: a sustain pedal goes down
		 * while chords are being played, and that is not a request for help.
		 */
		const offPedal = midi.onPedal(() => {
			if (document.querySelector('[aria-modal="true"]')) return false;
			if (view === 'play') return false;
			primary();
			return true;
		});
		return () => {
			width.removeEventListener('change', fit);
			offNote();
			offPedal();
			clearTimers();
		};
	});

	function toggleFireworks() {
		fireworks = !fireworks;
		try {
			localStorage.setItem(FX_KEY, fireworks ? 'on' : 'off');
		} catch {
			// Remembered for this visit only.
		}
	}

	const recordLine = (id: StopId) => {
		const r = record[id];
		if (r.rounds === 0 || r.best === null) return '';
		if (r.best === 1) return 'clean';
		return `${Math.round(r.best * 100)}% first time`;
	};
</script>

<svelte:head>
	<title>Chord recipes · Roundel</title>
	<meta
		name="description"
		content="Learn how every chord is built by playing it: distances counted on the keys, one stop at a time."
	/>
</svelte:head>

<svelte:window {onkeydown} ononline={() => void flush()} />

<Fireworks enabled={fireworks && view !== 'line'} onready={(api) => (fx = api)} />

{#snippet stopButton(id: StopId, interchange: boolean)}
	{@const s = stopById(id)!}
	{@const r = record[id]}
	<button class="stop-button" onclick={() => openStop(id)}>
		<svg class="stop-mark" viewBox="-14 -14 28 28" aria-hidden="true">
			<circle class="stop-ring" r="9" />
			{#if r.best !== null}
				<circle class="stop-core" r={3 + 5 * r.best} />
			{/if}
			{#if interchange}<circle class="stop-ring-outer" r="12.5" />{/if}
		</svg>
		<span class="stop-emblem" class:is-wheel={s.emblem.kind === 'wheel'}>
			<StopEmblem emblem={s.emblem} />
		</span>
		<span class="stop-text">
			<span class="stop-title">{s.title}</span>
			<span class="stop-summary">{s.summary}</span>
			{#if suggested === id || recordLine(id)}
				<span class="stop-record">{suggested === id ? 'next' : recordLine(id)}</span>
			{/if}
		</span>
	</button>
{/snippet}

{#snippet figureCard(figure: Figure)}
	<button class="figure" onclick={() => hearFigure(figure)}>
		<span class="figure-head">
			{#if figure.chord}
				<ChordSymbol chord={figure.chord} size="1.5rem" />
			{/if}
			<span class="figure-title">{figureTitle(figure)}</span>
			{#if figureFrom(figure)}<span class="figure-from">{figureFrom(figure)}</span>{/if}
		</span>
		<RecipeCard
			tones={shown(figure.tones)}
			rootPc={pitchClass(figure.tones[0].note)}
			ghost={figure.ghost}
			label="{figureTitle(figure)}: {formula(figure.tones)}"
		/>
		<span class="figure-formula">{formula(figure.tones)}</span>
	</button>
{/snippet}

{#if view === 'line'}
	{@const next = stopById(suggested ?? 'half')!}
	<main class="line-view">
		<header class="line-head">
			<div>
				<h1>Chord recipes</h1>
				<p>
					Every chord type has a recipe: a fixed set of distances above its root. Learn the recipe
					once and you can build that chord on any of the twelve keys.
				</p>
			</div>
			<button class="primary ride-next" onclick={() => openStop(next.id)}>
				<span class="ride-emblem"><StopEmblem emblem={next.emblem} /></span>
				{next.title}
			</button>
		</header>

		<details class="intro" open={firstVisit}>
			<summary>How recipes work</summary>
			<div class="intro-body">
				<div class="intro-text">
					<p>
						Distances are counted in <strong>half steps</strong>. One half step is the very next
						key, black or white; two half steps make a <strong>whole step</strong>.
					</p>
					<p>
						A chord’s <strong>recipe</strong> — its formula — lists each note by how far it sits
						above the root. A <strong>major triad</strong> is the root, the major third (4 half
						steps up) and the perfect fifth (7 half steps up), written 1 3 5. A
						<strong>minor triad</strong> lowers the third to 3 half steps: 1 ♭3 5.
					</p>
					<p>
						Press any key below and the recipe is built on it. Every note changes; the distances do
						not.
					</p>
				</div>

				<figure class="example">
					<div class="example-head">
						<ChordSymbol chord={example.chord} size="2rem" />
						<span class="example-name">
							{noteLabel(example.tones[0].note)}
							{recipeName(exampleRecipe)}
						</span>
						<span class="example-switch" role="group" aria-label="Recipe">
							{#each EXAMPLE_RECIPES as id (id)}
								<button aria-pressed={exampleRecipe === id} onclick={() => tryRecipe(id)}>
									{capitalise(id)}
								</button>
							{/each}
						</span>
					</div>
					<RecipeCard
						tones={shown(example.tones)}
						rootPc={exampleRoot}
						label="{noteLabel(example.tones[0].note)} {recipeName(exampleRecipe)}: {formula(
							example.tones
						)}"
					/>
					<div class="example-keys">
						<HopBand
							from={EXAMPLE_FROM}
							count={EXAMPLE_COUNT}
							arcs={exampleArcs}
							marks={exampleMarks}
						/>
						<Keyboard
							from={EXAMPLE_FROM}
							count={EXAMPLE_COUNT}
							lit={midi.live}
							found={exampleKeys}
							onnoteon={(note) =>
								midi.push({ type: 'noteon', note, velocity: 80, time: performance.now() })}
							onnoteoff={(note) => midi.push({ type: 'noteoff', note, time: performance.now() })}
						/>
					</div>
					<figcaption>
						{formula(example.tones)} · counted note to note,
						{listOf(exampleArcs.map((arc) => String(arc.to - arc.from)))} half steps
					</figcaption>
				</figure>

				<div class="intro-steps">
					<h2>How a stop works</h2>
					<ol>
						<li><strong>Read</strong> what it teaches, with the recipe drawn on C.</li>
						<li><strong>Watch, then copy.</strong> The first question plays itself.</li>
						<li>
							<strong>From the recipe.</strong> The card counts the half steps; find the notes.
						</li>
						<li>
							<strong>From the name.</strong> Only the chord symbol or the interval’s name.
						</li>
					</ol>
					<p>
						Any octave counts. A wrong note is shown counted from the root, and that question comes
						back once at the end.
					</p>
				</div>
			</div>
		</details>

		<div class="network">
			<section class="line" aria-label="Intervals and chords">
				<ol>
					{#each recipeStops as s, i (s.id)}
						{@const starts = i === 0 || recipeStops[i - 1].section !== s.section}
						<li class="stop" class:is-next={suggested === s.id} class:has-section={starts}>
							{#if starts}
								<p class="section-label">
									<span class="label-title">{SECTIONS[s.section].title}</span>
									<span>{SECTIONS[s.section].note}</span>
								</p>
							{/if}
							{@render stopButton(s.id, s.id === INTERCHANGE)}
							{#if s.id === INTERCHANGE}
								<!-- The circle line leaves from here, so it lives here: in
								     the flow on a narrow screen, beside the line on a wide one. -->
								<section class="branch" aria-labelledby="circle-line">
									<h2 id="circle-line" class="line-name">
										<span class="label-title">{SECTIONS.circle.title}</span>
										<span>{SECTIONS.circle.note}</span>
									</h2>
									<ol>
										{#each circleStops as c (c.id)}
											<li class="stop" class:is-next={suggested === c.id}>
												{@render stopButton(c.id, false)}
											</li>
										{/each}
									</ol>
								</section>
							{/if}
						</li>
					{/each}
				</ol>
			</section>
		</div>

		<p class="hands-free">
			<span><kbd>Space</kbd> / pedal · {next.title}</span>
		</p>
		{#if saveTrouble && pending.length}
			<p class="save-note">
				{pending.length === 1 ? 'One round' : `${pending.length} rounds`} waiting to be saved.
				<button class="quiet" onclick={() => void flush()}>Try now</button>
			</p>
		{/if}
	</main>
{:else if view === 'brief' && briefStop}
	<main class="brief-view">
		<header class="play-head">
			<button class="back" onclick={toLine} aria-label="All stops">←</button>
			<p class="brief-section">{SECTIONS[briefStop.section].title}</p>
		</header>
		<article class="brief">
			<h1>{briefStop.title}</h1>
			{#each briefStop.brief as paragraph, i (i)}
				<p>{paragraph}</p>
			{/each}
			{#if briefStop.figures.length}
				<div class="figures" class:is-single={briefStop.figures.length === 1}>
					{#each briefStop.figures as figure, i (i)}
						{@render figureCard(figure)}
					{/each}
				</div>
				<p class="figure-hint">
					{#if briefStop.figures.some((figure) => figure.chord)}
						Drawn on C. The numbers over the line count half steps; the labels under the notes are
						the recipe.
					{:else}
						The numbers over the line count half steps.
					{/if}
					Tap one to hear it.
				</p>
			{/if}
			<div class="brief-actions">
				<button class="primary" onclick={() => ride(briefStop.id)}>Start</button>
				<span class="hands-free"><span><kbd>Space</kbd> / pedal</span></span>
			</div>
		</article>
	</main>
{:else if round && stop}
	<main class="play-view">
		<header class="play-head">
			<button class="back" onclick={toLine} aria-label="All stops">←</button>
			<h1 class="play-title">{stop.title}</h1>
			<ol class="pips" aria-label="Progress through this stop">
				{#each pips as pip, i (i)}
					<li
						class="pip is-{pip.state}"
						class:is-again={pip.again}
						class:is-copying={pip.copying}
						style:--tint="var(--pc-{pip.pc})"
					></li>
				{/each}
			</ol>
			<button
				class="fx-toggle"
				class:is-on={fireworks}
				onclick={toggleFireworks}
				aria-pressed={fireworks}>fireworks</button
			>
		</header>

		{#if view === 'play' && item}
			<section class="stage" aria-live="off">
				{#if item.circle && trip}
					<p class="task">{task(item, guided)}</p>
					<div class="stage-wheel">
						<CircleTrack
							stations={trip.stations}
							legs={trip.legs}
							direction={trip.direction}
							count={item.hint === 'name' ? null : hopKeys}
							label={describe(item)}
						/>
					</div>
				{:else}
					<div class="headline">
						{#if item.chord}
							{#if item.before}
								<span class="from-chord">
									<ChordSymbol chord={item.before.chord} size="2.2rem" />
									<span class="to-arrow" aria-hidden="true">→</span>
								</span>
							{/if}
							<ChordSymbol chord={item.chord} size="clamp(3rem, 9vw, 5.5rem)" />
							<span class="headline-name">{nameOf(item)}</span>
						{:else}
							<span class="interval-big">{capitalise(nameOf(item))}</span>
						{/if}
					</div>
					<p class="task">{task(item, guided)}</p>
					<div class="stage-card">
						<RecipeCard
							tones={cardTones}
							rootPc={pitchClass(item.tones[0].note)}
							{ghost}
							label={describe(item)}
						/>
					</div>
				{/if}
			</section>

			<footer class="keys">
				<p class="words" aria-hidden="true">
					<span class="listening" class:is-showing={phase === 'show'}></span>
					{phase === 'show' ? 'watch' : words}
				</p>
				<p class="sr-only" aria-live="polite">{spoken}</p>
				<div class="keys-inner">
					<HopBand from={FROM} count={COUNT} {arcs} {marks} />
					<Keyboard
						from={FROM}
						count={COUNT}
						lit={midi.live}
						found={onKeys.map((tone) => tone.note)}
						target={guided ? open.map((i) => keyAt(item!, i)) : []}
						demo={demo?.notes.length ? demo.notes : null}
						onnoteon={(note) =>
							midi.push({ type: 'noteon', note, velocity: 80, time: performance.now() })}
						onnoteoff={(note) => midi.push({ type: 'noteoff', note, time: performance.now() })}
					/>
				</div>
				<p class="hands-free">
					<span><kbd>Space</kbd> · show me</span>
					<span><kbd>Esc</kbd> · all stops</span>
				</p>
			</footer>
		{:else if view === 'done' && result}
			<section class="done">
				<p class="done-score">
					{#if result.total === result.clean}
						Clean
					{:else}
						<strong>{result.clean}</strong> of {result.total} <span>first time</span>
					{/if}
				</p>
				{#if finishedCircle}
					<div class="done-wheel">
						<CircleTrack
							stations={finishedCircle.stations}
							legs={finishedCircle.legs}
							direction={finishedCircle.direction}
							label="The circle of fifths, all twelve keys, back to C"
						/>
					</div>
				{/if}
				<ol class="done-plates" class:is-compact={finishedCircle} aria-label="What you played">
					{#each round.outcomes.filter((o) => !o.again && isScored(round!.items[o.item])) as o, i (i)}
						{@const it = round.items[o.item]}
						<li class="plate" class:is-helped={!isClean(o)}>
							{#if it.chord}
								<ChordSymbol chord={it.chord} size="1.35rem" />
							{:else}
								<span class="plate-hop">{formatPitch(it.tones[1].note, true)}</span>
							{/if}
							<span class="plate-dots" aria-hidden="true">
								{#each it.tones as tone, t (t)}
									<span style:--tint="var(--pc-{pitchClass(tone.note)})"></span>
								{/each}
							</span>
						</li>
					{/each}
				</ol>
				<div class="done-actions">
					{#if nextStop}
						<button class="primary" onclick={() => openStop(nextStop!.id)}>
							Next stop · {nextStop.title}
						</button>
					{/if}
					<button class="secondary" onclick={() => ride(stop!.id)}>Again</button>
					<button class="quiet" onclick={toLine}>All stops</button>
				</div>
				<p class="hands-free"><span><kbd>Space</kbd> / pedal · next stop</span></p>
				{#if saveTrouble && pending.length}
					<p class="save-note">
						Not saved yet — it will be sent again when the connection is back.
						<button class="quiet" onclick={() => void flush()}>Try now</button>
					</p>
				{/if}
			</section>
		{/if}
	</main>
{/if}

<style>
	kbd {
		padding: 0.1rem 0.35rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 4px;
		background: var(--color-ground-raised);
		color: var(--color-ink-muted);
		font: inherit;
	}

	.hands-free {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4rem 1.4rem;
		margin-top: 0.8rem;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink-dim);
	}

	.save-note {
		margin-top: 0.8rem;
		text-align: center;
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--color-ink-muted);
	}

	.primary,
	.secondary,
	.quiet {
		min-height: 2.75rem;
		border-radius: 10px;
		padding: 0.65rem 1.1rem;
		font-weight: 600;
		transition:
			transform 120ms cubic-bezier(0.25, 1, 0.5, 1),
			border-color 120ms linear,
			color 120ms linear;
	}

	.primary {
		background: var(--color-ink);
		color: var(--color-ground);
	}

	.secondary {
		border: 1px solid var(--color-ground-line);
		color: var(--color-ink);
	}

	.quiet {
		color: var(--color-ink-dim);
		min-height: 0;
		padding: 0.2rem 0.4rem;
	}

	.primary:active,
	.secondary:active {
		transform: scale(0.98);
	}

	@media (hover: hover) {
		.secondary:hover {
			border-color: var(--color-ink-muted);
		}
		.quiet:hover {
			color: var(--color-ink);
		}
	}

	/* ---------------------------------------------------------------------- */
	/* The line                                                                */
	/* ---------------------------------------------------------------------- */

	.line-view {
		max-width: 1040px;
		margin: 0 auto;
		padding: 2rem 1rem 3rem;
	}

	.line-head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 1.2rem 2rem;
	}

	.ride-next {
		display: inline-flex;
		align-items: center;
		gap: 0.8rem;
		padding: 0.75rem 1.2rem 0.75rem 0.9rem;
		font-size: 1.05rem;
	}

	/* The emblem keeps its colours on the light button: the dots are pitches,
	   and the hollow ones need the dark ground behind them to read as hollow. */
	.ride-emblem {
		display: flex;
		width: 6.5rem;
		height: 2rem;
		align-items: center;
		padding: 0 0.3rem;
		border-radius: 7px;
		background: var(--color-ground);
	}

	.line-head h1 {
		font-size: clamp(2rem, 5vw, 3rem);
		font-weight: 600;
		letter-spacing: -0.03em;
	}

	.line-head p {
		max-width: 36rem;
		margin-top: 0.3rem;
		line-height: 1.5;
		color: var(--color-ink-muted);
	}

	/*
	 * The introduction. Open until the first stop has been ridden, then folded
	 * away under its summary: read once, it is in the way of the map.
	 */
	.intro {
		margin-top: 1.6rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 12px;
	}

	.intro > summary {
		padding: 0.85rem 1rem;
		font-weight: 600;
		cursor: pointer;
	}

	.intro-body {
		display: grid;
		grid-template-columns: minmax(0, 1fr);
		gap: 1.6rem 2.4rem;
		padding: 0.2rem 1rem 1.3rem;
	}

	@media (min-width: 900px) {
		.intro-body {
			grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
			grid-template-areas:
				'text example'
				'steps example';
			align-items: start;
		}

		.intro-text {
			grid-area: text;
		}

		.example {
			grid-area: example;
		}

		.intro-steps {
			grid-area: steps;
		}
	}

	.intro-text p,
	.intro-steps p {
		max-width: 34rem;
		margin-top: 0.7rem;
		line-height: 1.55;
		color: var(--color-ink-muted);
	}

	.intro-text p:first-child {
		margin-top: 0;
	}

	.intro strong {
		font-weight: 600;
		color: var(--color-ink);
	}

	.example {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin: 0;
	}

	.example-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.9rem;
	}

	.example-name {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--color-ink-muted);
	}

	.example-switch {
		display: inline-flex;
		margin-left: auto;
		border: 1px solid var(--color-ground-line);
		border-radius: 8px;
		overflow: hidden;
	}

	.example-switch button {
		min-height: 2.25rem;
		padding: 0.3rem 0.85rem;
		font-size: 0.85rem;
		color: var(--color-ink-muted);
	}

	.example-switch button[aria-pressed='true'] {
		background: var(--color-ink);
		color: var(--color-ground);
	}

	.example figcaption {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		text-align: center;
		color: var(--color-ink-dim);
	}

	.intro-steps h2 {
		font-size: 0.95rem;
		font-weight: 600;
	}

	.intro-steps ol {
		display: grid;
		gap: 0.3rem;
		margin: 0.5rem 0 0;
		padding-left: 1.2rem;
		list-style: decimal;
		line-height: 1.45;
		color: var(--color-ink-muted);
	}

	.network {
		margin-top: 2rem;
	}

	.line {
		position: relative;
		max-width: 520px;
	}

	.line-name {
		display: flex;
		height: 2.3rem;
		flex-direction: column;
		justify-content: flex-end;
		margin: 0 0 0.2rem 3.5rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		font-weight: 400;
		line-height: 1.15rem;
		letter-spacing: 0.04em;
		color: var(--color-ink-dim);
	}

	.line ol {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/*
	 * The track: a line down the left through every station, drawn per stop so
	 * that it joins up. Ink, because a line on this network is never a pitch.
	 */
	.stop {
		position: relative;
	}

	.stop::before {
		content: '';
		position: absolute;
		left: 1.25rem;
		top: 0;
		bottom: 0;
		width: 4px;
		margin-left: -2px;
		background: var(--color-ink-dim);
	}

	ol > .stop:first-child::before {
		top: 1.9rem;
	}

	ol > .stop:last-child::before {
		height: 1.9rem;
		bottom: auto;
	}

	.stop-button {
		position: relative;
		display: grid;
		grid-template-columns: 2.5rem 9rem minmax(0, 1fr);
		/*
		 * Everything hangs from the top, with the station's centre 1.9rem
		 * down — level with the title, the way a map names a station. A
		 * summary that wraps grows the stop downwards and moves nothing, so
		 * the track ends and the branch spur can be placed by measurement.
		 */
		align-items: start;
		gap: 1rem;
		width: 100%;
		min-height: 3.8rem;
		padding: 0.4rem 0.7rem 0.4rem 0;
		border-radius: 12px;
		text-align: left;
		transition: background 120ms ease;
	}

	@media (hover: hover) {
		.stop-button:hover {
			background: var(--color-ground-raised);
		}
	}

	.stop-mark {
		width: 2.5rem;
		height: 2.5rem;
		margin-top: 0.25rem;
		overflow: visible;
	}

	.stop-ring {
		fill: var(--color-ground);
		stroke: var(--color-ink);
		stroke-width: 2.5;
	}

	.stop-ring-outer {
		fill: none;
		stroke: var(--color-ink-muted);
		stroke-width: 1.5;
	}

	.stop-core {
		fill: var(--color-ink);
	}

	.stop.is-next > .stop-button .stop-ring {
		stroke-width: 3.5;
	}

	.stop-emblem {
		display: flex;
		height: 2.2rem;
		margin-top: 0.4rem;
		align-items: center;
	}

	.stop-emblem.is-wheel {
		justify-content: center;
		height: 2.8rem;
		margin-top: 0.1rem;
	}

	.stop-text {
		display: flex;
		min-width: 0;
		flex-direction: column;
		gap: 0.1rem;
		padding-top: 0.7rem;
	}

	.stop-title {
		font-size: 1.08rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}

	.stop-summary {
		font-size: 0.86rem;
		line-height: 1.35;
		color: var(--color-ink-muted);
	}

	.stop-record {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: var(--color-ink-dim);
		white-space: nowrap;
	}

	/*
	 * Where a part of the syllabus starts. Inside the station, so the track
	 * runs through it unbroken; two fixed lines high, so the first station's
	 * track can start exactly level with it.
	 */
	.section-label {
		display: flex;
		height: 2.3rem;
		flex-direction: column;
		justify-content: flex-end;
		margin: 1.3rem 0 0.1rem 3.5rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.15rem;
		letter-spacing: 0.03em;
		color: var(--color-ink-dim);
	}

	.section-label > span,
	.line-name > span {
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.label-title {
		font-weight: 600;
		color: var(--color-ink);
	}

	ol > .stop:first-child > .section-label {
		margin-top: 0;
	}

	ol > .stop.has-section:first-child::before {
		top: calc(2.4rem + 1.9rem);
	}

	.stop.is-next > .stop-button .stop-record {
		color: var(--color-ink);
	}

	/*
	 * The branch. In the flow on a narrow screen, a step in from the main line
	 * and joined to it by a short spur; beside it on a wide one, level with the
	 * station it leaves from, with a dashed connection across.
	 */
	/* Padding rather than margin below: a last child's margin collapses out
	   through the station around it and leaves a gap in the main line. */
	.branch {
		position: relative;
		margin: 0.2rem 0 0 2.6rem;
		padding: 0.4rem 0 0.6rem;
	}

	/* Level with the first circle station: 0.4 padding, 2.3 label, 0.2 gap,
	   1.9 to the station's centre. It runs on under the station's ring to the
	   branch's own track, so the two lines meet rather than nearly meet. */
	.branch::before {
		content: '';
		position: absolute;
		left: -1.35rem;
		top: 4.8rem;
		width: 2.6rem;
		height: 4px;
		margin-top: -2px;
		background: var(--color-ink-dim);
	}

	@media (max-width: 1099px) {
		.branch .line-name {
			margin-left: 2.6rem;
		}
	}

	@media (max-width: 520px) {
		.stop-button {
			grid-template-columns: 2.5rem 6.2rem minmax(0, 1fr);
			gap: 0.75rem;
		}

		.branch .stop-button {
			grid-template-columns: 2.5rem 3rem minmax(0, 1fr);
		}
	}

	/* 520 + 72 + 460 and the gutters: any narrower and the branch hangs off the page. */
	@media (min-width: 1100px) {
		/* The first circle station level with the fifth: 1.9 − (2.3 + 0.2 + 1.9). */
		.branch {
			position: absolute;
			top: -2.5rem;
			left: calc(100% + 4.5rem);
			width: 460px;
			margin: 0;
			padding: 0;
		}

		.branch::before {
			left: -4.5rem;
			top: 4.4rem;
			width: 4.3rem;
			background: repeating-linear-gradient(
				90deg,
				var(--color-ink-dim) 0 6px,
				transparent 6px 11px
			);
		}
	}

	/* ---------------------------------------------------------------------- */
	/* A stop's briefing                                                       */
	/* ---------------------------------------------------------------------- */

	.brief-view {
		max-width: 780px;
		margin: 0 auto;
		padding: 0.9rem 1rem 2.6rem;
	}

	.brief-section {
		font-family: var(--font-mono);
		font-size: 0.72rem;
		letter-spacing: 0.04em;
		color: var(--color-ink-dim);
	}

	.brief {
		margin-top: 1.2rem;
	}

	.brief h1 {
		font-size: clamp(1.8rem, 5vw, 2.6rem);
		font-weight: 600;
		line-height: 1.1;
		letter-spacing: -0.03em;
	}

	.brief > p {
		max-width: 40rem;
		margin-top: 0.85rem;
		font-size: 1.02rem;
		line-height: 1.6;
		color: var(--color-ink-muted);
	}

	.brief > p:first-of-type {
		color: var(--color-ink);
	}

	.figures {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(17rem, 1fr));
		gap: 0.8rem;
		margin-top: 1.5rem;
	}

	.figures.is-single {
		grid-template-columns: minmax(0, 34rem);
	}

	.figure {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.8rem 0.9rem 0.7rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 12px;
		text-align: left;
		transition: border-color 120ms linear;
	}

	@media (hover: hover) {
		.figure:hover {
			border-color: var(--color-ink-muted);
		}
	}

	.figure-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.2rem 0.6rem;
	}

	.figure-title {
		font-weight: 600;
	}

	.figure-from,
	.figure-formula {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--color-ink-muted);
	}

	.figure-from {
		color: var(--color-ink-dim);
	}

	.figure-hint {
		margin-top: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		line-height: 1.5;
		color: var(--color-ink-dim);
	}

	.brief-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.6rem 1.2rem;
		margin-top: 1.8rem;
	}

	.brief-actions .primary {
		min-width: 8rem;
	}

	.brief-actions .hands-free {
		margin-top: 0;
	}

	/* ---------------------------------------------------------------------- */
	/* Playing                                                                 */
	/* ---------------------------------------------------------------------- */

	.play-view {
		display: flex;
		min-height: calc(100dvh - 3.5rem);
		flex-direction: column;
		max-width: 1180px;
		margin: 0 auto;
		padding: 0.9rem 1rem 1.2rem;
	}

	.play-head {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}

	.back {
		width: 2.25rem;
		height: 2.25rem;
		border-radius: 8px;
		border: 1px solid var(--color-ground-line);
		color: var(--color-ink-muted);
	}

	.play-title {
		min-width: 0;
		max-width: 50%;
		overflow: hidden;
		font-size: 1.1rem;
		font-weight: 600;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	.pips {
		display: flex;
		flex: 1;
		min-width: 0;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.32rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	/* Each item is the colour of its root once it is played: a round of
	   chords leaves the row of their roots behind it. */
	.pip {
		width: 0.62rem;
		height: 0.62rem;
		border-radius: 50%;
		background: var(--color-ground-line);
		transition: background 200ms ease;
	}

	.pip.is-copying {
		width: 0.42rem;
		height: 0.42rem;
	}

	.pip.is-now {
		background: transparent;
		box-shadow: 0 0 0 2px var(--color-ink);
	}

	.pip.is-clean {
		background: var(--tint);
	}

	.pip.is-helped {
		background: var(--color-ground);
		box-shadow: inset 0 0 0 2px var(--tint);
	}

	.pip.is-again {
		border-radius: 3px;
	}

	/* A phone: the stop's full name on the first row, the progress on its own
	   below. Squeezed onto one row the pips stacked into a column. */
	@media (max-width: 600px) {
		.play-head {
			flex-wrap: wrap;
			row-gap: 0.6rem;
		}

		.play-title {
			flex: 1 1 0;
			max-width: none;
		}

		.pips {
			order: 4;
			flex-basis: 100%;
		}
	}

	.fx-toggle {
		padding: 0.3rem 0.65rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 8px;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		color: var(--color-ink-dim);
	}

	.fx-toggle.is-on {
		color: var(--color-ink);
		border-color: var(--color-ink-dim);
	}

	.stage {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.2rem;
		padding: 0.4rem 0 0;
	}

	.headline {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		min-height: 5.6rem;
		justify-content: flex-end;
	}

	.headline :global(.chord-symbol) {
		line-height: 1;
	}

	.from-chord {
		display: inline-flex;
		align-items: baseline;
		gap: 0.6rem;
		color: var(--color-ink-dim);
	}

	.to-arrow {
		font-size: 1.6rem;
	}

	.interval-big {
		font-family: var(--font-display);
		font-weight: 600;
		font-size: clamp(2.2rem, 6.5vw, 4rem);
		line-height: 1;
		letter-spacing: -0.03em;
		text-align: center;
	}

	.headline-name {
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.03em;
		color: var(--color-ink-muted);
	}

	/* What to play, in a sentence: the one line on the stage that is read
	   rather than looked at, so it gets the text face and a measure. */
	.task {
		max-width: 38rem;
		margin: 0.5rem auto 0.2rem;
		text-align: center;
		font-size: 1rem;
		line-height: 1.45;
		color: var(--color-ink);
		text-wrap: balance;
	}

	.stage-card {
		width: min(100%, 640px);
	}

	.stage-wheel {
		width: min(100%, 20rem, 42dvh);
	}

	.keys {
		margin-top: 0.2rem;
	}

	/* Wide enough to feel like a piano, short enough that the card and the
	   keys fit on one screen together. */
	.keys-inner {
		max-width: min(1040px, 128dvh);
		margin: 0 auto;
	}

	.words {
		display: flex;
		min-height: 1.4rem;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		font-family: var(--font-mono);
		font-size: 0.8rem;
		color: var(--color-ink-muted);
	}

	.listening {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--color-ink-dim);
	}

	.listening.is-showing {
		background: var(--color-ink);
		animation: blink 0.9s ease-in-out infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0.3;
		}
	}

	/* ---------------------------------------------------------------------- */
	/* Done                                                                    */
	/* ---------------------------------------------------------------------- */

	.done {
		display: flex;
		flex: 1;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.6rem;
		text-align: center;
	}

	.done-score {
		font-size: clamp(2.4rem, 7vw, 4rem);
		font-weight: 600;
		letter-spacing: -0.03em;
	}

	.done-score span {
		font-size: 0.4em;
		font-family: var(--font-mono);
		letter-spacing: 0.02em;
		color: var(--color-ink-muted);
	}

	.done-plates {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.6rem;
		max-width: 46rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.plate {
		display: flex;
		min-width: 4.4rem;
		flex-direction: column;
		align-items: center;
		gap: 0.4rem;
		padding: 0.6rem 0.7rem 0.55rem;
		border: 1px solid var(--color-ground-line);
		border-radius: 12px;
		background: var(--color-ground-raised);
	}

	/* Helped, not failed: the same plate, drawn a weight lighter. */
	.plate.is-helped {
		border-style: dashed;
		background: transparent;
	}

	.plate-hop {
		font-size: 1.35rem;
		font-weight: 600;
	}

	.plate-dots {
		display: flex;
		gap: 0.2rem;
	}

	.plate-dots span {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: var(--tint);
	}

	/* A phone on its side: the keys matter more than the headline. */
	@media (max-height: 560px) {
		.headline {
			min-height: 0;
		}

		.headline-name,
		.from-chord {
			display: none;
		}

		.interval-big,
		.headline :global(.chord-symbol) {
			font-size: 2.4rem !important;
		}

		.stage-card {
			width: min(100%, 440px);
		}

		.stage-wheel {
			width: min(100%, 13rem);
		}
	}

	.done-wheel {
		width: min(100%, 19rem, 40dvh);
	}

	.done-plates.is-compact .plate {
		min-width: 3.2rem;
		padding: 0.4rem 0.5rem;
	}

	.done-actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		gap: 0.7rem;
	}
</style>
