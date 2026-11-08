/**
 * compare-research-candidate — read-only review of a candidate research file.
 *
 *   npx tsx apps/odyssey/scripts/compare-research-candidate.ts <candidate.json> [--mapping statement-map.json]
 *
 * defaults.ts is the source of truth for party/island slugs and statement
 * text+order. Exits 1 on any structural mismatch. Never writes anything.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_ISLANDS, DEFAULT_PARTIES } from '../src/lib/defaults';
import type { PartyStanceResearch } from '../src/lib/research';
import {
	RATIONALE_SNIPPET_LENGTH,
	BIG_DELTA_THRESHOLD,
	checkStructure,
	compareScores,
	statementFingerprintSource,
	topChanges,
	type MappingFile,
} from './lib/compareResearch';

const REPO_RESEARCH = fileURLToPath(new URL('../src/data/party-stance-research.json', import.meta.url));
const HASH_PREFIX_LENGTH = 16;

function sha(text: string): string {
	return createHash('sha256').update(text).digest('hex');
}

function readJson<T>(path: string): { data: T; raw: string } {
	const raw = readFileSync(path, 'utf8');

	return { data: JSON.parse(raw) as T, raw };
}

const args = process.argv.slice(2);
const mapIdx = args.indexOf('--mapping');
const mappingPath = mapIdx >= 0 ? args[mapIdx + 1] : undefined;
const candidatePath = args.find((a, i) => !a.startsWith('--') && i !== mapIdx + 1);
if (!candidatePath) {
	console.error('usage: compare-research-candidate.ts <candidate.json> [--mapping statement-map.json]');
	process.exit(2);
}

const candidate = readJson<PartyStanceResearch>(resolve(candidatePath));
const baseline = readJson<PartyStanceResearch>(REPO_RESEARCH);
const mapping = mappingPath ? readJson<MappingFile>(resolve(mappingPath)) : undefined;

const problems = checkStructure(
	DEFAULT_ISLANDS,
	DEFAULT_PARTIES.map((p) => p.slug),
	candidate.data,
	mapping?.data,
);

console.info('== Structure (vs defaults.ts) ==');
if (problems.length === 0) console.info('OK: slugs, 4 statements/island, wording and order match');
for (const p of problems) console.info(`MISMATCH ${p}`);

const { changes, perParty, missingInBaseline } = compareScores(baseline.data, candidate.data);
console.info('\n== Per-party |Δscore| vs repo research ==');
console.info('party'.padEnd(20) + 'cells'.padStart(6) + 'mean|Δ|'.padStart(9) + `  |Δ|>${BIG_DELTA_THRESHOLD}`);
for (const s of [...perParty].sort((a, b) => b.meanAbsDelta - a.meanAbsDelta)) {
	console.info(s.party.padEnd(20) + String(s.cells).padStart(6) + s.meanAbsDelta.toFixed(3).padStart(9) + String(s.bigCount).padStart(8));
}
console.info(`total cells |Δ|>${BIG_DELTA_THRESHOLD}: ${perParty.reduce((n, s) => n + s.bigCount, 0)} of ${changes.length}`);
if (missingInBaseline.length) console.info(`not in repo baseline: ${missingInBaseline.join(', ')}`);

console.info('\n== Top changes ==');
for (const c of topChanges(changes)) {
	console.info(
		`${c.island}/${c.party} #${c.stance}: ${c.oldScore} -> ${c.newScore} (Δ${c.delta >= 0 ? '+' : ''}${c.delta}) conf ${c.oldConfidence} -> ${c.newConfidence}\n    ${c.rationale.slice(0, RATIONALE_SNIPPET_LENGTH)}`,
	);
}

console.info('\n== Hashes ==');
console.info(`candidate sha256:        ${sha(candidate.raw)}`);
console.info(`repo research sha256:    ${sha(baseline.raw)}`);
console.info(`repo statements fingerprint (defaults.ts): ${sha(statementFingerprintSource(DEFAULT_ISLANDS)).slice(0, HASH_PREFIX_LENGTH)}`);
if (mapping) {
	console.info(`mapping statements fingerprint:            ${sha(statementFingerprintSource(mapping.data.islands)).slice(0, HASH_PREFIX_LENGTH)}`);
}

process.exit(problems.length ? 1 : 0);
