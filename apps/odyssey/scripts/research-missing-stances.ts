/**
 * research-missing-stances — the entry point of the standing research
 * protocol (scientific-research/2026-08-24-party-stance-estimation §7.1).
 *
 * When an admin adds an island or a stance in a live game, no party carries
 * a researched score for it. This script scans the live game document,
 * reports every stance lacking scores, and emits a READY-TO-DISPATCH
 * research brief per gap island: the statement texts, the party list, a
 * proposed research slug, the islandMeta block to add to
 * src/data/party-stance-research.json, and the standard agent prompt
 * (report Appendix A) pre-filled — so estimates stay comparable with the
 * original dataset.
 *
 *   ODYSSEY_FIRESTORE_HOST=localhost:8181 \
 *     npx tsx apps/odyssey/scripts/research-missing-stances.ts --game default
 *
 * Output: apps/odyssey/docs/research-briefs/<gameId>-<island-slug>.md
 * Follow-up: run the research agent(s) with the brief → add the JSON to
 * party-stance-research.json (islands + islandMeta) → validate-research →
 * render-research-review → patch-party-attitudes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_ISLANDS } from '../src/lib/defaults';
import { partyStanceResearch } from '../src/lib/research';

const PROJECT_ID = process.env.ODYSSEY_PROJECT_ID ?? 'freedi-test';
const FIRESTORE_HOST = process.env.ODYSSEY_FIRESTORE_HOST ?? 'localhost:8081';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIEFS_DIR = resolve(HERE, '../docs/research-briefs');

function arg(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`);

	return index === -1 ? undefined : process.argv[index + 1];
}

const gameId = arg('game') ?? 'default';

process.env.FIRESTORE_EMULATOR_HOST = FIRESTORE_HOST;
const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

interface GameIsland {
	statementId: string;
	title: string;
	issue?: string;
	centralQuestion?: string;
	sortOrder: number;
	enabled: boolean;
}

interface GameParty {
	partyId: string;
	name: string;
	enabled: boolean;
	attitudes?: Record<string, number>;
}

/** The report's Appendix-A prompt, pre-filled for one island. */
function agentPrompt(input: {
	title: string;
	issue: string;
	question: string;
	stances: string[];
	partySlugs: string[];
}): string {
	const statements = input.stances
		.map((stance, index) => `${index + 1}. ${stance}`)
		.join('\n');

	return `You are a political-positions researcher for an Israeli civic game. Today is ${new Date().toISOString().slice(0, 10)}; check the current Israeli political context (coalition composition, upcoming elections) before scoring.

TASK: For EACH of ${input.partySlugs.length} parties, estimate its stand on EACH of the ${input.stances.length} statements below, as a continuous score in [-1, +1]: -1 = strongly opposes this exact statement, +1 = strongly supports it, fractions encouraged. Ground every score in PUBLISHED materials via web search (party platforms, Knesset votes, leader statements; prefer the last two years).

TOPIC: ${input.title} — ${input.issue}
Question: ${input.question}
Statements:
${statements}

RULES:
- Do 6-14 targeted web searches (Hebrew queries work best). Verify claims before scoring.
- confidence: "high" = explicit platform/vote/statement on this exact issue; "medium" = derived from clear adjacent positions; "low" = weak evidence.
- If NO findable published position: inferred:true, confidence:"low", sources:[], rationale explains the ideological inference. Every party × statement MUST have an entry.
- Non-inferred entries MUST have >=1 source: {"title","url"(http/https),"quote"(optional),"date"(optional)}.
- rationale: 1-2 sentences in Hebrew.
- Party slugs exactly: ${input.partySlugs.join(', ')}.

OUTPUT: Return ONLY a valid JSON object (no markdown fences, no commentary): keys = the party slugs; each value = array of EXACTLY ${input.stances.length} entries (statement order), each entry {"score": number, "confidence": "high"|"medium"|"low", "inferred": boolean, "rationale": string, "sources": [{"title": string, "url": string, "quote"?: string, "date"?: string}]}.`;
}

async function main(): Promise<void> {
	const research = partyStanceResearch();
	const gameSnap = await db.collection('odysseyGames').doc(gameId).get();
	const game = gameSnap.data();
	if (!game) throw new Error(`game "${gameId}" not found on ${FIRESTORE_HOST}`);

	const islands = (game.islands as GameIsland[]).filter((island) => island.enabled !== false);
	const parties = (game.parties as GameParty[]).filter((party) => party.enabled !== false);
	const partySlugs = parties.map((party) => party.partyId);
	const defaultTitles = new Map(DEFAULT_ISLANDS.map((island) => [island.title, island.slug]));

	mkdirSync(BRIEFS_DIR, { recursive: true });

	let gapIslands = 0;
	let gapCells = 0;
	for (const island of islands) {
		const stancesSnap = await db
			.collection('statements')
			.where('parentId', '==', island.statementId)
			.get();
		const stances = stancesSnap.docs
			.map(
				(docSnap) =>
					docSnap.data() as { statementId: string; statement: string; statementType: string; order?: number },
			)
			.filter((statement) => statement.statementType === 'option')
			.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		if (stances.length === 0) continue;

		// A cell is missing when an enabled party has no researched score for a stance.
		const missing = parties.flatMap((party) =>
			stances
				.filter((stance) => party.attitudes?.[stance.statementId] === undefined)
				.map((stance) => ({ party: party.partyId, stanceId: stance.statementId })),
		);
		if (missing.length === 0) continue;

		gapIslands += 1;
		gapCells += missing.length;

		const slug =
			defaultTitles.get(island.title) ?? `island-${island.statementId.toLowerCase()}`;
		const isDefault = defaultTitles.has(island.title);
		const question = island.centralQuestion ?? island.issue ?? island.title;

		const metaBlock = isDefault
			? '(default island — no islandMeta needed; key the research by its default slug)'
			: [
					'```json',
					JSON.stringify(
						{
							[slug]: {
								title: island.title,
								statementId: island.statementId,
								question,
								stances: stances.map((stance) => stance.statement),
							},
						},
						null,
						1,
					),
					'```',
				].join('\n');

		const lines = [
			`# Research brief — ${island.title} (${slug})`,
			'',
			`Game: \`${gameId}\` · island statementId: \`${island.statementId}\` · ${missing.length} missing party×stance cells (${parties.length} parties × ${stances.length} stances scanned).`,
			'',
			'## Protocol',
			'',
			'1. Dispatch a research agent with the prompt below (unchanged — comparability rule, see the method report §7.1).',
			`2. Add its JSON to \`src/data/party-stance-research.json\` under \`islands.${slug}\`${isDefault ? '' : ' and register the island in `islandMeta`:'}`,
			metaBlock,
			'3. `npx tsx apps/odyssey/scripts/validate-research.ts`',
			'4. `npx tsx apps/odyssey/scripts/render-research-review.ts` → human review of the sheet',
			`5. \`ODYSSEY_FIRESTORE_HOST=${FIRESTORE_HOST} npx tsx apps/odyssey/scripts/patch-party-attitudes.ts --game ${gameId} --dry-run\`, then without --dry-run`,
			'',
			'## Agent prompt',
			'',
			'```',
			agentPrompt({
				title: island.title,
				issue: island.issue ?? '',
				question,
				stances: stances.map((stance) => stance.statement),
				partySlugs,
			}),
			'```',
			'',
		];

		const outPath = resolve(BRIEFS_DIR, `${gameId}-${slug}.md`);
		writeFileSync(outPath, lines.join('\n'));
		console.info(`✗ ${island.title}: ${missing.length} missing cells → brief at ${outPath}`);
	}

	if (gapIslands === 0) {
		console.info(
			`✓ full coverage: every enabled party has a score on every stance of ${islands.length} islands in "${gameId}"`,
		);
	} else {
		console.info(`${gapIslands} island(s) need research (${gapCells} cells total)`);
		process.exitCode = 1;
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
