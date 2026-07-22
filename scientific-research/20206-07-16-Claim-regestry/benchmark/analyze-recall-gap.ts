/**
 * Aggregates results/recall-gap-E.jsonl into RECALL_GAP.md: B1 (ungated judge)
 * vs A2 (embedding-gated judge) recall on verified same-stance rewrites,
 * broken down by cosine band, for the English-adversarial and Hebrew variants.
 *
 * Usage: npx tsx analyze-recall-gap.ts
 */
import { writeFileSync } from 'node:fs';
import { readJsonl, resultsPath } from './lib/io';
import { fmtRate, wilson } from './lib/metrics';
import type { RecallGapRow } from './run-recall-gap';

const MIN_CONFIDENCE = 0.6;
const GATE_RETRIEVAL = 0.45;
const GATE_PASS2 = 0.6;

interface Pair {
	id: string;
	dataset: string;
	cosCtx: number;
	attached: boolean;
	style: string;
}

function main(): void {
	const rows = readJsonl<RecallGapRow>('recall-gap-E.jsonl');
	const lines: string[] = [];
	const put = (s = ''): void => {
		lines.push(s);
	};

	put('# Condition E — Recall-Gap Benchmark (B1 ungated vs A2 gated)');
	put();
	put(`Anchors processed: ${rows.length}. Rewrites preserve stance (gpt-4o verified, lowest-cosine candidate first); the judge is the production classifier (gpt-4o-mini) against the anchor claim. Attach rule: expresses ∧ confidence ≥ ${MIN_CONFIDENCE}.`);
	put();

	for (const variant of ['english', 'hebrew'] as const) {
		const selected = rows.map((r) => r[variant]).filter((v) => v !== null);
		const pairs: Pair[] = rows.flatMap((r) => {
			const v = r[variant];
			if (!v || !v.verified || !v.classification) return [];

			return [
				{
					id: r.id,
					dataset: r.dataset,
					cosCtx: v.cosCtx,
					attached:
						v.classification.relation === 'expresses' &&
						v.classification.matchedClusterId !== null &&
						v.classification.confidence >= MIN_CONFIDENCE,
					style: v.style,
				},
			];
		});
		const verified = pairs;

		put(`## ${variant === 'english' ? 'English adversarial rewrites' : 'Hebrew paraphrases (cross-language)'}`);
		put();
		put(`Verified same-stance: ${verified.length}/${selected.length} (${selected.length - verified.length} dropped by the independent meaning check).`);
		put();

		const cosines = pairs.map((p) => p.cosCtx).sort((a, b) => a - b);
		if (cosines.length > 0) {
			const median = cosines[Math.floor(cosines.length / 2)];
			put(`Cosine to anchor (ctx format): median ${median.toFixed(3)}, min ${cosines[0].toFixed(3)}, max ${cosines[cosines.length - 1].toFixed(3)}.`);
			put();
		}

		const bands: Array<[string, (p: Pair) => boolean]> = [
			[`cos < ${GATE_RETRIEVAL} (invisible to retrieval)`, (p) => p.cosCtx < GATE_RETRIEVAL],
			[`${GATE_RETRIEVAL} ≤ cos < ${GATE_PASS2}`, (p) => p.cosCtx >= GATE_RETRIEVAL && p.cosCtx < GATE_PASS2],
			[`cos ≥ ${GATE_PASS2}`, (p) => p.cosCtx >= GATE_PASS2],
		];

		put('| Cosine band | n | B1 recall (judge always sees claim) | A2 recall, gate 0.45 | A2 recall, gate 0.60 |');
		put('|---|---|---|---|---|');
		for (const [label, inBand] of bands) {
			const band = pairs.filter(inBand);
			if (band.length === 0) {
				put(`| ${label} | 0 | — | — | — |`);
				continue;
			}
			const b1 = wilson(band.filter((p) => p.attached).length, band.length);
			const a2r = wilson(band.filter((p) => p.attached && p.cosCtx >= GATE_RETRIEVAL).length, band.length);
			const a2p = wilson(band.filter((p) => p.attached && p.cosCtx >= GATE_PASS2).length, band.length);
			put(`| ${label} | ${band.length} | ${fmtRate(b1)} | ${fmtRate(a2r)} | ${fmtRate(a2p)} |`);
		}
		const all = pairs;
		if (all.length > 0) {
			const b1 = wilson(all.filter((p) => p.attached).length, all.length);
			const a2r = wilson(all.filter((p) => p.attached && p.cosCtx >= GATE_RETRIEVAL).length, all.length);
			const a2p = wilson(all.filter((p) => p.attached && p.cosCtx >= GATE_PASS2).length, all.length);
			put(`| **All verified pairs** | ${all.length} | ${fmtRate(b1)} | ${fmtRate(a2r)} | ${fmtRate(a2p)} |`);
		}
		put();

		const styleCounts = new Map<string, number>();
		for (const p of pairs) styleCounts.set(p.style, (styleCounts.get(p.style) ?? 0) + 1);
		if (variant === 'english') {
			put(`Selected styles (lowest-cosine verified candidate): ${[...styleCounts.entries()].map(([s, c]) => `${s} ${c}`).join(', ')}.`);
			put();
		}
	}

	put('## Reading the table');
	put();
	put('- **B1 − A2 in each row is the recall gap**: statements a gated (RAG-style) architecture structurally cannot file, because the embedding never retrieves the right claim for the judge to see.');
	put('- The main hard-triplet benchmark could not measure this: all its pairs were high-cosine by construction (its A2 tied B1 exactly).');
	put('- Precision control: the same judge\'s false-attach rate on stance-flipped distractors is measured in the main benchmark (B1: 2.1% on n=875) — low-cosine recall here is not bought with indiscriminate attaching.');
	put();

	const out = resultsPath('../RECALL_GAP.md');
	writeFileSync(out, lines.join('\n'));
	console.info(`Wrote ${out}`);
	console.info(lines.join('\n'));
}

main();
