import researchData from '../data/party-stance-research.json';

/**
 * ====================  PARTY STANCE RESEARCH  ====================
 * The canonical source of the parties' continuous evaluation scores
 * (−1..1 per stance), estimated from published materials: platforms,
 * Knesset votes, public statements.
 *
 * The JSON is keyed by ISLAND SLUG and PARTY SLUG (the two identifiers
 * that survive re-seeding — statementIds are minted per seed), with each
 * party's entry an array aligned with the island's `stances` order in
 * `DEFAULT_ISLANDS`. Citations, confidence and inference flags live ONLY
 * here — the game doc carries just the numbers.
 *
 * Review workflow: `scripts/render-research-review.ts` renders each
 * island into `docs/review/<slug>.md` for human review; corrections are
 * made HERE (the MD is generated, never edited) and validated by
 * `scripts/validate-research.ts`.
 * =================================================================
 */

export interface ResearchSource {
	title: string;
	url: string;
	quote?: string;
	date?: string;
}

export interface ResearchEntry {
	/** −1 (opposes) .. +1 (supports) */
	score: number;
	confidence: 'high' | 'medium' | 'low';
	/** true = no findable published position; estimated from general ideology */
	inferred: boolean;
	rationale: string;
	sources: ResearchSource[];
}

/** islandSlug → partySlug → entries aligned with the island's stances order */
export type ResearchIslands = Record<string, Record<string, ResearchEntry[]>>;

export interface PartyStanceResearch {
	version: number;
	updated: string;
	islands: ResearchIslands;
}

export function partyStanceResearch(): PartyStanceResearch {
	return researchData as PartyStanceResearch;
}

/** partySlug → islandSlug → scores aligned with that island's stances order */
export function researchedAttitudes(): Record<string, Record<string, number[]>> {
	const byParty: Record<string, Record<string, number[]>> = {};
	for (const [islandSlug, parties] of Object.entries(partyStanceResearch().islands)) {
		for (const [partySlug, entries] of Object.entries(parties)) {
			byParty[partySlug] = byParty[partySlug] ?? {};
			byParty[partySlug][islandSlug] = entries.map((entry) => entry.score);
		}
	}

	return byParty;
}

/** Island slugs that carry researched scores (their legacy positions are dropped). */
export function researchedIslandSlugs(): string[] {
	return Object.keys(partyStanceResearch().islands);
}
