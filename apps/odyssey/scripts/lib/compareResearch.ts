/**
 * Pure comparison helpers for reviewing a candidate party-stance research
 * file against the repo (defaults.ts is the source of truth for wording).
 */
import type { PartyStanceResearch, ResearchEntry } from '../../src/lib/research';

export const BIG_DELTA_THRESHOLD = 0.3;
export const TOP_CHANGES_COUNT = 15;
export const RATIONALE_SNIPPET_LENGTH = 90;

export interface IslandSpec {
	slug: string;
	stances: string[];
}

export interface PartySpec {
	slug: string;
}

export interface MappingFile {
	islands: IslandSpec[];
	parties?: PartySpec | PartySpec[];
}

export interface Change {
	island: string;
	party: string;
	stance: number;
	oldScore: number;
	newScore: number;
	delta: number;
	oldConfidence: string;
	newConfidence: string;
	rationale: string;
}

export interface PartyStats {
	party: string;
	cells: number;
	meanAbsDelta: number;
	bigCount: number;
}

export interface ScoreComparison {
	changes: Change[];
	perParty: PartyStats[];
	missingInBaseline: string[];
}

/** Structural + wording check of candidate (and optional mapping) vs the expected spec. */
export function checkStructure(
	expectedIslands: IslandSpec[],
	expectedPartySlugs: string[],
	candidate: PartyStanceResearch,
	mapping?: MappingFile,
): string[] {
	const problems: string[] = [];
	const expectedSlugs = expectedIslands.map((i) => i.slug);
	const candIslands = Object.keys(candidate.islands);

	for (const slug of expectedSlugs) {
		if (!candIslands.includes(slug)) problems.push(`candidate: island "${slug}" missing`);
	}
	for (const slug of candIslands) {
		if (!expectedSlugs.includes(slug)) problems.push(`candidate: unknown island "${slug}"`);
	}

	for (const island of expectedIslands) {
		const parties = candidate.islands[island.slug];
		if (!parties) continue;
		const partyKeys = Object.keys(parties);
		for (const p of expectedPartySlugs) {
			if (!parties[p]) problems.push(`candidate ${island.slug}: party "${p}" missing`);
		}
		for (const p of partyKeys) {
			if (!expectedPartySlugs.includes(p)) {
				problems.push(`candidate ${island.slug}: unknown party "${p}"`);
				continue;
			}
			if (parties[p].length !== island.stances.length) {
				problems.push(
					`candidate ${island.slug}/${p}: ${parties[p].length} entries, expected ${island.stances.length}`,
				);
			}
		}
	}

	if (mapping) {
		const mapIslands = new Map(mapping.islands.map((i) => [i.slug, i]));
		for (const island of expectedIslands) {
			const m = mapIslands.get(island.slug);
			if (!m) {
				problems.push(`mapping: island "${island.slug}" missing`);
				continue;
			}
			if (m.stances.length !== island.stances.length) {
				problems.push(
					`mapping ${island.slug}: ${m.stances.length} statements, repo has ${island.stances.length}`,
				);
			}
			island.stances.forEach((text, idx) => {
				const mt = m.stances[idx];
				if (mt === undefined) return;
				if (mt !== text) {
					const other = island.stances.indexOf(mt);
					const note = other >= 0 ? ` (text matches repo position ${other + 1}: ORDER differs)` : ' (WORDING differs)';
					problems.push(
						`mapping ${island.slug} #${idx + 1}${note}\n    repo:    ${text}\n    mapping: ${mt}`,
					);
				}
			});
		}
		for (const slug of mapIslands.keys()) {
			if (!expectedSlugs.includes(slug)) problems.push(`mapping: unknown island "${slug}"`);
		}
		const mp = mapping.parties === undefined ? [] : Array.isArray(mapping.parties) ? mapping.parties : [mapping.parties];
		for (const p of mp) {
			if (!expectedPartySlugs.includes(p.slug)) problems.push(`mapping: unknown party "${p.slug}"`);
		}
	}

	return problems;
}

function round(n: number): number {
	return Math.round(n * 1000) / 1000;
}

/** Cell-by-cell score deltas between candidate and baseline (shared cells only). */
export function compareScores(baseline: PartyStanceResearch, candidate: PartyStanceResearch): ScoreComparison {
	const changes: Change[] = [];
	const missingInBaseline: string[] = [];
	const sums = new Map<string, { n: number; sum: number; big: number }>();

	for (const [island, parties] of Object.entries(candidate.islands)) {
		for (const [party, entries] of Object.entries(parties)) {
			const old: ResearchEntry[] | undefined = baseline.islands[island]?.[party];
			if (!old) {
				missingInBaseline.push(`${island}/${party}`);
				continue;
			}
			entries.forEach((entry, i) => {
				const prev = old[i];
				if (!prev) return;
				const delta = round(entry.score - prev.score);
				changes.push({
					island,
					party,
					stance: i + 1,
					oldScore: prev.score,
					newScore: entry.score,
					delta,
					oldConfidence: prev.confidence,
					newConfidence: entry.confidence,
					rationale: entry.rationale,
				});
				const s = sums.get(party) ?? { n: 0, sum: 0, big: 0 };
				s.n += 1;
				s.sum += Math.abs(delta);
				if (Math.abs(delta) > BIG_DELTA_THRESHOLD) s.big += 1;
				sums.set(party, s);
			});
		}
	}

	const perParty: PartyStats[] = [...sums.entries()].map(([party, s]) => ({
		party,
		cells: s.n,
		meanAbsDelta: round(s.sum / s.n),
		bigCount: s.big,
	}));
	return { changes, perParty, missingInBaseline };
}

export function topChanges(changes: Change[], count: number = TOP_CHANGES_COUNT): Change[] {
	return [...changes].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, count);
}

/** Stable text blob of island slugs + statements in order; hash it to pin wording. */
export function statementFingerprintSource(islands: IslandSpec[]): string {
	return islands.map((i) => `${i.slug}\n${i.stances.map((s, n) => `${n + 1}. ${s}`).join('\n')}`).join('\n\n');
}
