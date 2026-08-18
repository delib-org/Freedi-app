#!/usr/bin/env node
/**
 * Side-by-side comparison of two scored benchmark runs — normally the English and
 * Hebrew runs of the same corpus at the same seed, where the only intended
 * difference is language.
 *
 * Reads each folder's statements.json + results.json, recomputes the scores by
 * invoking score100.mjs (so the two never drift), and writes COMPARISON.md.
 *
 * USAGE:  node compare.mjs <run-folder-a> <run-folder-b> [--out=COMPARISON.md]
 */
import { writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const SCORER = join(here, 'score100.mjs');

const args = process.argv.slice(2);
const folders = args.filter((a) => !a.startsWith('--'));
if (folders.length !== 2) {
	console.error('Usage: node compare.mjs <run-folder-a> <run-folder-b> [--out=COMPARISON.md]');
	process.exit(1);
}
const outArg = args.find((a) => a.startsWith('--out='));
const outPath = outArg ? resolve(outArg.slice('--out='.length)) : join(here, 'COMPARISON.md');

const reports = folders.map((folder) => {
	const raw = execFileSync('node', [SCORER, folder, '--json'], { encoding: 'utf-8' });

	return { folder, ...JSON.parse(raw) };
});
const [a, b] = reports;

const fmt = (n, digits = 3) => (typeof n === 'number' ? n.toFixed(digits) : String(n));
const delta = (x, y) => {
	if (typeof x !== 'number' || typeof y !== 'number') return '';
	const d = y - x;

	return `${d >= 0 ? '+' : ''}${d.toFixed(3)}`;
};

const rows = [
	['ACCURACY (composite)', a.composite, b.composite],
	['grade', a.grade, b.grade],
	['synth F1', a.synth.f1, b.synth.f1],
	['synth precision', a.synth.precision, b.synth.precision],
	['synth recall', a.synth.recall, b.synth.recall],
	['synth ARI', a.synth.ari, b.synth.ari],
	['pair recovery rate', a.synth.pairRecoveryRate, b.synth.pairRecoveryRate],
	['false merges (pairs)', a.synth.falseMerges, b.synth.falseMerges],
	['synths produced', a.synth.producedCount, b.synth.producedCount],
	['topic F1', a.topic.f1, b.topic.f1],
	['topic precision', a.topic.precision, b.topic.precision],
	['topic recall', a.topic.recall, b.topic.recall],
	['topics produced', a.topic.producedCount, b.topic.producedCount],
	['coverage rate', a.coverage.rate, b.coverage.rate],
];

const label = (r) => `${r.language}${r.parameters?.seed !== undefined ? ` (seed ${r.parameters.seed})` : ''}`;
const header = `| metric | ${label(a)} | ${label(b)} | Δ |`;
const divider = '| --- | --- | --- | --- |';
const body = rows
	.map(([name, x, y]) => {
		const isNum = typeof x === 'number' && typeof y === 'number';
		const fx = isNum ? fmt(x) : String(x);
		const fy = isNum ? fmt(y) : String(y);

		return `| ${name} | ${fx} | ${fy} | ${isNum ? delta(x, y) : ''} |`;
	})
	.join('\n');

const paramNote = (r) => {
	const p = r.parameters ?? {};
	const overrides = p.synthesisOverrides && Object.keys(p.synthesisOverrides).length > 0
		? JSON.stringify(p.synthesisOverrides)
		: 'shipped defaults';

	return `- **${r.language}** — \`${r.folder}\`, corpus \`${p.corpus ?? '?'}\` (sha ${p.corpusSha ?? '?'}), settings: ${overrides}, git ${p.gitSha ?? '?'}`;
};

const md = `# EN / HE comparison — live-synth accuracy

${header}
${divider}
${body}

## Runs

${paramNote(a)}
${paramNote(b)}

> Both corpora encode the same ground truth (10 topics x 5 synth-groups x 2
> paraphrases), and the Hebrew statements are sentence-by-sentence translations of
> the English, so a gap in these numbers is a language effect rather than a
> difference in task difficulty. Check each corpus's separability first
> (\`npx tsx scripts/preflightCorpusCosines.ts <corpus>\`): when a language's
> ground-truth partners are not nearest neighbours, the ceiling is set by the
> embedding model and no threshold change can lift the score.
`;

writeFileSync(outPath, md);
console.info(md);
console.info(`\nwrote ${outPath}`);
