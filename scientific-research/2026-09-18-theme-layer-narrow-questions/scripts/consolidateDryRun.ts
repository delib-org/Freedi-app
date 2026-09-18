/**
 * Offline dry run of the theme MERGE sweep on a snapshot — what the next reJudge
 * tick would do to the sub-topics a split produced. REAL LLM call, no Firestore.
 * Applies the merges (with the split-sibling guard) to a copy of the snapshot.
 *
 * USAGE (from functions/):
 *   npx tsx --env-file=.env \
 *     ../scientific-research/2026-09-18-theme-layer-narrow-questions/scripts/consolidateDryRun.ts \
 *     <snapshot.json> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Statement } from '@freedi/shared-types';
import { groupEquivalentThemes } from '../../../functions/src/services/integration-ai-service';

interface Snapshot {
	question: Statement;
	children: Statement[];
}

async function main(): Promise<void> {
	const [inPath, outPath] = process.argv.slice(2);
	if (!inPath || !outPath) {
		console.error('usage: consolidateDryRun.ts <snapshot.json> <out.json>');
		process.exit(1);
	}
	const snap = JSON.parse(readFileSync(inPath, 'utf8')) as Snapshot;
	const children = snap.children.map((c) => ({ ...c }));
	const byId = new Map(children.map((c) => [c.statementId, c]));
	const themes = children.filter(
		(s) => s.isCluster === true && s.hide !== true && s.derivedByPipeline !== 'synthesis',
	);
	console.info(`themes offered: ${themes.length}`);
	const groups = await groupEquivalentThemes({
		themes: themes.map((t) => ({ id: t.statementId, title: t.statement ?? '', description: t.description })),
		questionContext: snap.question.statement ?? '',
	});
	console.info(`groups proposed: ${groups.length}`);
	let merges = 0;
	for (const group of groups) {
		const members = group.ids.map((id) => byId.get(id)).filter((t): t is Statement => Boolean(t));
		const origins = members.map((m) => (m as unknown as { splitFrom?: string }).splitFrom ?? '').filter(Boolean);
		const siblings = new Set(origins).size < origins.length;
		console.info(
			`  ${siblings ? 'REFUSED (split siblings)' : 'merge'}: "${group.title}" ← ${members.map((m) => `"${m.statement}"`).join(' + ')}`,
		);
		if (siblings || members.length < 2) continue;
		const survivor = [...members].sort(
			(a, b) => (b.integratedOptions ?? []).length - (a.integratedOptions ?? []).length,
		)[0];
		const merged = new Set(survivor.integratedOptions ?? []);
		for (const donor of members) {
			if (donor === survivor) continue;
			for (const id of donor.integratedOptions ?? []) merged.add(id);
			donor.hide = true;
			donor.integratedOptions = [];
		}
		survivor.statement = group.title;
		survivor.integratedOptions = Array.from(merged);
		merges += members.length - 1;
	}
	writeFileSync(outPath, JSON.stringify({ ...snap, children }));
	console.info(`wrote ${outPath} (${merges} merges applied)`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
