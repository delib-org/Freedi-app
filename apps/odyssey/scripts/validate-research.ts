/**
 * validate-research — the research file's gatekeeper.
 *
 * Checks apps/odyssey/src/data/party-stance-research.json against
 * DEFAULT_ISLANDS / DEFAULT_PARTIES:
 *   - every island slug exists;
 *   - per researched island, EVERY party is present (full-coverage rule)
 *     with exactly one entry per stance;
 *   - scores in [−1, 1]; confidence is high|medium|low;
 *   - inferred entries must be low-confidence (they are ideology estimates);
 *   - non-inferred entries must cite at least one http(s) source.
 *
 *   npx tsx apps/odyssey/scripts/validate-research.ts
 */
import { DEFAULT_ISLANDS, DEFAULT_PARTIES } from '../src/lib/defaults';
import { partyStanceResearch } from '../src/lib/research';

const CONFIDENCES = new Set(['high', 'medium', 'low']);

const islandsBySlug = new Map(DEFAULT_ISLANDS.map((island) => [island.slug, island]));
const partySlugs = DEFAULT_PARTIES.map((party) => party.slug);

const problems: string[] = [];
const research = partyStanceResearch();

for (const [islandSlug, parties] of Object.entries(research.islands)) {
	const island = islandsBySlug.get(islandSlug);
	if (!island) {
		problems.push(`island "${islandSlug}" does not exist in DEFAULT_ISLANDS`);
		continue;
	}

	for (const partySlug of partySlugs) {
		if (!parties[partySlug]) {
			problems.push(`${islandSlug}: party "${partySlug}" is missing (full coverage required)`);
		}
	}

	for (const [partySlug, entries] of Object.entries(parties)) {
		const where = `${islandSlug}/${partySlug}`;
		if (!partySlugs.includes(partySlug)) {
			problems.push(`${where}: unknown party slug`);
			continue;
		}
		if (entries.length !== island.stances.length) {
			problems.push(
				`${where}: ${entries.length} entries for ${island.stances.length} stances`,
			);
			continue;
		}
		entries.forEach((entry, index) => {
			const stanceWhere = `${where} stance ${index + 1}`;
			if (typeof entry.score !== 'number' || entry.score < -1 || entry.score > 1) {
				problems.push(`${stanceWhere}: score ${entry.score} outside [−1, 1]`);
			}
			if (!CONFIDENCES.has(entry.confidence)) {
				problems.push(`${stanceWhere}: confidence "${entry.confidence}" invalid`);
			}
			if (entry.inferred && entry.confidence !== 'low') {
				problems.push(`${stanceWhere}: inferred entries must be confidence "low"`);
			}
			if (!entry.inferred && entry.sources.length === 0) {
				problems.push(`${stanceWhere}: non-inferred entry needs at least one source`);
			}
			if (!entry.rationale?.trim()) {
				problems.push(`${stanceWhere}: rationale is required`);
			}
			for (const source of entry.sources) {
				if (!/^https?:\/\//.test(source.url)) {
					problems.push(`${stanceWhere}: source url "${source.url}" is not http(s)`);
				}
			}
		});
	}
}

const islandCount = Object.keys(research.islands).length;
if (problems.length > 0) {
	console.error(`✗ ${problems.length} problem(s) in party-stance-research.json:`);
	for (const problem of problems) console.error(`  - ${problem}`);
	process.exit(1);
}
console.info(
	`✓ research file valid: ${islandCount} island(s), ${partySlugs.length} parties, full coverage`,
);
