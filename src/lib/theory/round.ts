import { GAME_IDS, isCorrect, makeDeck, type RoundSpec } from './catalog';

export type Attempt = { question: number; values: string[]; hinted: boolean };
export type Round = {
	spec: RoundSpec;
	queue: { question: number; retry: boolean }[];
	position: number;
	attempts: Attempt[];
};
export type RoundResult = {
	total: number;
	firstTry: number;
	recovered: number;
	hints: number;
	stars: number;
};
export type Submission = { id: string; spec: RoundSpec; attempts: Attempt[] };
export type GameProgress = { rounds: number; recallRounds: number; bestStars: number };

export function beginRound(spec: RoundSpec): Round {
	return {
		spec,
		queue: makeDeck(spec).map((_, question) => ({ question, retry: false })),
		position: 0,
		attempts: []
	};
}

export function submitAnswer(round: Round, values: string[], hinted = false): Round {
	const entry = round.queue[round.position];
	if (!entry) return round;
	const question = makeDeck(round.spec)[entry.question];
	if (
		new Set(values).size !== values.length ||
		values.some((value) => !question.choices.some((choice) => choice.value === value))
	)
		throw new Error('Unknown answer');
	if (question.kind !== 'multiple' && values.length !== 1) throw new Error('Choose one answer');
	const attempt = { question: entry.question, values: [...values], hinted };
	const attempts = [...round.attempts, attempt];
	const correct = isCorrect(question, values);
	const needsReview =
		correct &&
		!entry.retry &&
		attempts.some(
			(a) => a.question === entry.question && (a.hinted || !isCorrect(question, a.values))
		);
	return {
		...round,
		attempts,
		position: round.position + (correct ? 1 : 0),
		queue: needsReview ? [...round.queue, { question: entry.question, retry: true }] : round.queue
	};
}

export function resultOf(round: Round): RoundResult {
	const deck = makeDeck(round.spec);
	let firstTry = 0;
	let hints = 0;
	let recovered = 0;
	for (const [i, question] of deck.entries()) {
		const attempts = round.attempts.filter((a) => a.question === i);
		if (attempts.some((a) => a.hinted)) hints++;
		if (attempts[0] && isCorrect(question, attempts[0].values) && !attempts[0].hinted) firstTry++;
		else if (attempts.some((a) => isCorrect(question, a.values))) recovered++;
	}
	const ratio = firstTry / deck.length;
	return {
		total: deck.length,
		firstTry,
		recovered,
		hints,
		stars: round.spec.mode === 'guided' ? 0 : ratio === 1 ? 3 : ratio >= 0.75 ? 2 : 1
	};
}

/** Validate and replay the complete round. Scores and review completion are never trusted from the client. */
export function parseSubmission(value: unknown): (Submission & { result: RoundResult }) | null {
	if (!value || typeof value !== 'object') return null;
	const raw = value as Record<string, unknown>;
	if (
		typeof raw.id !== 'string' ||
		!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.id)
	)
		return null;
	if (
		!raw.spec ||
		typeof raw.spec !== 'object' ||
		!Array.isArray(raw.attempts) ||
		raw.attempts.length > 500
	)
		return null;
	const spec = raw.spec as RoundSpec;
	if (
		!GAME_IDS.includes(spec.game) ||
		!['guided', 'recall'].includes(spec.mode) ||
		!['starter', 'explorer'].includes(spec.level) ||
		!['clockwise', 'counterclockwise'].includes(spec.direction) ||
		!Number.isSafeInteger(spec.seed) ||
		spec.seed < 0 ||
		spec.seed > 0xffffffff
	)
		return null;
	let round = beginRound(spec);
	try {
		for (const item of raw.attempts) {
			if (!item || typeof item !== 'object') return null;
			const attempt = item as Attempt;
			if (
				attempt.question !== round.queue[round.position]?.question ||
				typeof attempt.hinted !== 'boolean' ||
				!Array.isArray(attempt.values) ||
				attempt.values.length > 12 ||
				attempt.values.some((v) => typeof v !== 'string')
			)
				return null;
			round = submitAnswer(round, attempt.values, attempt.hinted);
		}
	} catch {
		return null;
	}
	if (round.position !== round.queue.length) return null;
	return {
		id: raw.id,
		spec: {
			game: spec.game,
			mode: spec.mode,
			level: spec.level,
			direction: spec.direction,
			seed: spec.seed
		},
		attempts: round.attempts,
		result: resultOf(round)
	};
}
