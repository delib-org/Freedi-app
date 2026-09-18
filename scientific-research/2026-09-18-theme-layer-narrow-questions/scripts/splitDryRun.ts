/**
 * Offline dry run of the theme split (fix C) and the label guard (fix A) on a
 * question snapshot — REAL LLM calls, no Firestore, nothing written to any
 * project. Applies the proposed split to a copy of the snapshot so
 * `scoreVsFanny.py` can score the result.
 *
 * USAGE (from functions/, so module resolution and the env file line up):
 *   npx tsx --env-file=.env \
 *     ../scientific-research/2026-09-18-theme-layer-narrow-questions/scripts/splitDryRun.ts \
 *     <snapshot.json> <out.json>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Statement } from '@freedi/shared-types';
import {
	labelRestatesQuestion,
	proposeThemeSplit,
} from '../../../functions/src/services/integration-ai-service';
import { isOversized, leafCount } from '../../../functions/src/synthesis/pipeline/splitThemes';

interface Snapshot {
	question: Statement;
	children: Statement[];
}

async function main(): Promise<void> {
	const [inPath, outPath] = process.argv.slice(2);
	if (!inPath || !outPath) {
		console.error('usage: splitDryRun.ts <snapshot.json> <out.json>');
		process.exit(1);
	}
	const snap = JSON.parse(readFileSync(inPath, 'utf8')) as Snapshot;
	const question = snap.question.statement ?? '';
	const children = snap.children.map((c) => ({ ...c }));
	const byId = new Map(children.map((c) => [c.statementId, c]));
	const themes = children.filter(
		(s) => s.isCluster === true && s.hide !== true && s.derivedByPipeline !== 'synthesis',
	);

	console.info(`question: ${question.slice(0, 80)}`);
	console.info(`themes: ${themes.length}`);
	for (const t of themes) {
		const restates = await labelRestatesQuestion(t.statement ?? '', question);
		console.info(`  [${t.statementId}] "${t.statement}"  leaves=${leafCount(t, byId)}  restatesQuestion=${restates}`);
	}

	const leaves = new Map(themes.map((t) => [t.statementId, leafCount(t, byId)]));
	const placedTotal = Array.from(leaves.values()).reduce((a, b) => a + b, 0);
	const candidates = themes
		.filter((t) => isOversized(leaves.get(t.statementId) ?? 0, placedTotal))
		.sort((a, b) => (leaves.get(b.statementId) ?? 0) - (leaves.get(a.statementId) ?? 0));
	console.info(`placed=${placedTotal}, split candidates=${candidates.length}`);

	let created = 0;
	for (const theme of candidates) {
		const members = (theme.integratedOptions ?? [])
			.map((id) => ({ id, title: byId.get(id)?.statement ?? '' }))
			.filter((m) => m.title.length > 0);
		const started = Date.now();
		const subTopics = await proposeThemeSplit({
			theme: { id: theme.statementId, title: theme.statement ?? '', description: theme.description },
			members,
			questionContext: question,
			otherThemeTitles: themes
				.filter((t) => t.statementId !== theme.statementId)
				.map((t) => t.statement ?? ''),
			placedTotal,
		});
		console.info(
			`\nsplit of "${theme.statement}" (${members.length} direct members, ${leaves.get(theme.statementId)} leaves) → ${subTopics.length} sub-topics in ${((Date.now() - started) / 1000).toFixed(1)}s`,
		);
		const assigned = new Set<string>();
		for (const sub of subTopics) {
			sub.memberIds.forEach((id) => assigned.add(id));
			const subLeaves = sub.memberIds.reduce((n, id) => {
				const m = byId.get(id);

				return n + (m?.derivedByPipeline === 'synthesis' ? (m.integratedOptions ?? []).length : 1);
			}, 0);
			console.info(`  • "${sub.title}" — ${sub.description}  (${sub.memberIds.length} members, ${subLeaves} leaves)`);
			for (const id of sub.memberIds) console.info(`      - ${byId.get(id)?.statement?.slice(0, 90)}`);
		}
		const unassigned = members.filter((m) => !assigned.has(m.id));
		if (unassigned.length > 0) {
			console.info(`  unassigned (${unassigned.length}):`);
			for (const m of unassigned) console.info(`      - ${m.title.slice(0, 90)}`);
		}
		if (subTopics.length === 0) continue;

		// Apply to the copy, the way applySplit does.
		theme.hide = true;
		theme.integratedOptions = [];
		for (const sub of subTopics) {
			created++;
			children.push({
				...theme,
				statementId: `split-${theme.statementId}-${created}`,
				statement: sub.title,
				description: sub.description,
				integratedOptions: sub.memberIds,
				hide: false,
				createdAt: Date.now(),
			} as Statement);
		}
	}

	writeFileSync(outPath, JSON.stringify({ ...snap, children }));
	console.info(`\nwrote ${outPath} (${created} sub-topics created)`);
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
