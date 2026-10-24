/** Step 1 (no AI): themes per end state, their dominant true topic, and the pairs sharing one. */
import { RUNS, loadState, topicPairs } from './common.mjs';

for (const run of RUNS) {
	const s = loadState(run);
	const pairs = topicPairs(s.themes);
	const live = s.results.auditCounts ?? {};
	console.info(`\n== ${run}  themes=${s.themes.length} hidden=${s.results.hiddenClusters.length} sharedTopicPairs=${pairs.length} audit=${JSON.stringify(live)}`);
	for (const t of s.themes) {
		console.info(
			`  ${t.id.slice(0, 6)} n=${String(t.statementIds.length).padStart(2)} ${t.dominant.padEnd(22)} pur=${t.purity.toFixed(2)} ${t.title.slice(0, 40)} :: ${(t.description ?? '').slice(0, 60)}`,
		);
	}
}
