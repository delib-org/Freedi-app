/**
 * How a WizCol round deals classmates' texts to a reader.
 *
 * Pure: no Mithril, no Firestore. The view feeds it what it knows (who wrote
 * what, what I already weighed, how many readers each text has) and gets back
 * the ids to show, in order. The deal is computed ONCE and held in
 * sessionStorage, so a refresh shows the same cards in the same places —
 * a list that reshuffles under a reading finger costs the reader their place
 * for a reason they cannot see (the square's rule, kept here).
 *
 * Attention is allocated the way the square allocates it: texts I have not
 * weighed first, then the ones fewest classmates have read, then the
 * per-student shuffle so a whole class does not open on the same story.
 */

import { mergeLateArrivals, rankStalls, type OrderableProposal } from '../squareOrder';

export interface DealInput<T extends OrderableProposal> {
	/** Classmates' texts — mine excluded by the caller or here, both are safe */
	others: readonly T[];
	userId: string;
	/** Ids I have already weighed */
	rated: ReadonlySet<string>;
	/** How many readers a text has had so far */
	ratersOf: (statementId: string) => number;
	/** How many the round deals */
	sample: number;
	/** The deal held from before, or null on a fresh screen */
	stored: readonly string[] | null;
}

/**
 * The ids to show. A stored deal is kept intact — newcomers are appended
 * only while it is short of the sample, so a text posted late still reaches
 * readers who have room for it, without moving anyone's cards.
 */
export function dealRound<T extends OrderableProposal>(input: DealInput<T>): string[] {
	const others = input.others.filter((row) => row.creatorId !== input.userId);
	const ranked = rankStalls(others, input.userId, {
		mine: (statementId) => input.rated.has(statementId),
		openIdeas: (statementId) => input.ratersOf(statementId),
	});
	if (input.stored === null) return ranked.slice(0, Math.max(0, input.sample));

	// Drop stored ids that no longer exist (a text the teacher took down)
	const alive = new Set(others.map((row) => row.statementId));
	const kept = input.stored.filter((statementId) => alive.has(statementId));
	if (kept.length >= input.sample) return kept;

	const known = new Set(kept);
	const fill = ranked.filter((statementId) => !known.has(statementId));

	return mergeLateArrivals(
		kept,
		fill.slice(0, input.sample - kept.length).map((statementId) => ({
			statementId,
			creatorId: '',
			createdAt: 0,
		})),
	);
}

/** "Read more": another sample's worth from the ranked rest, after the current deal */
export function extendDeal(
	deal: readonly string[],
	ranked: readonly string[],
	sample: number,
): string[] {
	const known = new Set(deal);
	const more = ranked
		.filter((statementId) => !known.has(statementId))
		.slice(0, Math.max(0, sample));

	return [...deal, ...more];
}

/** Everything the round could still deal, in allocation order — for `extendDeal` */
export function rankedRest<T extends OrderableProposal>(
	input: Pick<DealInput<T>, 'others' | 'userId' | 'rated' | 'ratersOf'>,
): string[] {
	const others = input.others.filter((row) => row.creatorId !== input.userId);

	return rankStalls(others, input.userId, {
		mine: (statementId) => input.rated.has(statementId),
		openIdeas: (statementId) => input.ratersOf(statementId),
	});
}

/** How many of the dealt texts I have weighed */
export function roundRatedCount(deal: readonly string[], rated: ReadonlySet<string>): number {
	return deal.filter((statementId) => rated.has(statementId)).length;
}

export function dealStorageKey(sessionId: string, itemId: string): string {
	return `agora_${sessionId}_${itemId}_deal`;
}

/** The stored deal, or null when there is none or storage is unavailable */
export function restoreDeal(raw: string | null): string[] | null {
	if (!raw) return null;
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return null;

		return parsed.filter((value): value is string => typeof value === 'string');
	} catch {
		return null;
	}
}

export function readStoredDeal(sessionId: string, itemId: string): string[] | null {
	try {
		return restoreDeal(sessionStorage.getItem(dealStorageKey(sessionId, itemId)));
	} catch {
		return null;
	}
}

export function storeDeal(sessionId: string, itemId: string, deal: readonly string[]): void {
	try {
		sessionStorage.setItem(dealStorageKey(sessionId, itemId), JSON.stringify(deal));
	} catch {
		// Storage full or blocked: the deal is recomputed next time, nothing is lost
	}
}
