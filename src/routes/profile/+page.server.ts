import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import { charts } from '$lib/server/db/schema';
import { currentUserId } from '$lib/server/db/user';
import {
	loadHeadline,
	loadRecentRuns,
	loadRecord,
	loadSpread,
	loadTrends,
	loadTunes,
	type Slice
} from '$lib/server/db/play-log';
import { practiceTotals } from '$lib/server/db/session-store';
import { allBadges } from '$lib/effects/badges';
import { CHARTS } from '$lib/curriculum/charts';
import { circleOfFifthsIndex, formatKey, parseKey } from '$lib/music/key';
import { pitchClass } from '$lib/music/note';

/**
 * What has actually happened.
 *
 * Reads M9's tables and captures nothing of its own. Every number on this page
 * is traceable to rows in `play_runs`, `chord_attempts`, `badges`, `sessions`
 * or `reviews`, and none of them is an estimate — which is the whole
 * specification, and the reason there is no "roughly" anywhere in the copy.
 *
 * Pitch classes are resolved here rather than in the page, because they are
 * musical facts rather than presentation: hue means pitch everywhere in this
 * app, so a key's colour is derived from its tonic by the music core and not
 * chosen by a stylesheet.
 */

/** The tonic's pitch class, or null for a label nothing can read. */
function tonicOf(label: string): number | null {
	try {
		return pitchClass(parseKey(label).tonic);
	} catch {
		// A key spelling this build cannot parse — an older row, or a hand-edited
		// one. It still counts towards the totals; it just has no colour.
		return null;
	}
}

/** The stored spelling, printed with real accidentals, or left exactly as found. */
function keyLabel(stored: string): string {
	try {
		return formatKey(parseKey(stored), true);
	} catch {
		return stored;
	}
}

export const load: PageServerLoad = async ({ locals }) => {
	const userId = currentUserId(locals.userId);

	const [headline, tunes, trends, spread, recent, record, practice, mine] = await Promise.all([
		loadHeadline(userId),
		loadTunes(userId),
		loadTrends(userId),
		loadSpread(userId),
		loadRecentRuns(userId),
		loadRecord(userId),
		practiceTotals(),
		db
			.select({ slug: charts.slug, name: charts.name })
			.from(charts)
			.where(eq(charts.userId, userId))
	]);

	/*
	 * A slug is what the log stores, because the built-in charts live in code and
	 * have no row to point at. Names are resolved here, from both places, and a
	 * slug with no name left anywhere shows as itself rather than as a blank —
	 * a tune deleted after being played still happened.
	 */
	const names = new Map<string, string>([
		...CHARTS.map((chart) => [chart.slug, chart.name] as const),
		...mine.map((row) => [row.slug, row.name] as const)
	]);

	const badges = allBadges(record);
	const badgesByChart = new Map<string, Array<{ tier: string; pc: number }>>();
	for (const badge of badges) {
		const won = badgesByChart.get(badge.chart) ?? [];
		won.push({ tier: badge.tier, pc: badge.pc });
		badgesByChart.set(badge.chart, won);
	}

	const byChart = new Map(trends.map((trend) => [trend.chartSlug, trend]));

	/*
	 * The twelve keys, in the order the wheel draws them.
	 *
	 * Every mode of a tonic folds into one swatch — B♭ major and G minor are the
	 * same seven notes under the hands, and the question this answers is "which
	 * corners of the keyboard have you been in", not "which mode". A key never
	 * played keeps its outline and no fill, which is the whole point: the empty
	 * swatches are the blind-spot report's first draft.
	 */
	const played = new Map<number, Slice>();
	for (const slice of spread.byKey) {
		const pc = tonicOf(slice.label);
		if (pc === null) continue;
		const held = played.get(pc) ?? { label: '', voiced: 0, landed: 0 };
		played.set(pc, {
			label: '',
			voiced: held.voiced + slice.voiced,
			landed: held.landed + slice.landed
		});
	}

	const keys = Array.from({ length: 12 }, (_, pc) => pc)
		.sort((a, b) => circleOfFifthsIndex(a) - circleOfFifthsIndex(b))
		.map((pc) => {
			const slice = played.get(pc);
			return {
				pc,
				// Spelled from the key itself, so C♯ and D♭ are named the way the
				// player would have met them rather than by a lookup table.
				label: keyLabel(SHARPS_AND_FLATS[pc]),
				voiced: slice?.voiced ?? 0,
				landed: slice?.landed ?? 0
			};
		});

	return {
		headline: {
			...headline,
			badgesEarned: badges.length,
			bestOnName: headline.bestOn
				? (names.get(headline.bestOn.chartSlug) ?? headline.bestOn.chartSlug)
				: null,
			bestOnPc: headline.bestOn ? tonicOf(headline.bestOn.keyCenter) : null
		},
		keys,
		tunes: tunes.map((tune) => ({
			...tune,
			name: names.get(tune.chartSlug) ?? tune.chartSlug,
			badges: badgesByChart.get(tune.chartSlug) ?? [],
			trend: byChart.get(tune.chartSlug) ?? null
		})),
		spread: {
			byKey: spread.byKey.map((slice) => ({
				...slice,
				label: keyLabel(slice.label),
				pc: tonicOf(slice.label)
			})),
			byQuality: spread.byQuality
		},
		recent: recent.map((run) => ({
			...run,
			name: names.get(run.chartSlug) ?? run.chartSlug,
			pc: tonicOf(run.keyCenter)
		})),
		badges: badges
			.map((badge) => ({ ...badge, name: names.get(badge.chart) ?? badge.chart }))
			.reverse(),
		practice
	};
};

/**
 * How each pitch class is spelled when it is a key of its own.
 *
 * The twelve names the play-along page offers, which are the ones the player
 * has actually been choosing between — five flats and one sharp side, rather
 * than a doctrinaire preference either way.
 */
const SHARPS_AND_FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
