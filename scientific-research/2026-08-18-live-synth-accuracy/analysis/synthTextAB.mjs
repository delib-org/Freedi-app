/**
 * Measure the TEXT a synthesis publishes — title and body — and A/B changes to
 * the prompt that writes it.
 *
 * `textFidelity.mjs` could only score the title, because no certified run
 * exported `description`. That understates the participant's view: a body is
 * where a secondary ask would survive. This closes the gap without an hour-long
 * emulator run, by calling the REAL synthesis function on the same inputs the
 * pipeline gave it.
 *
 * That "real" matters. The pipeline recovered all 50 ground-truth pairs exactly
 * on all three seeds, so the pairs it fed `generateSynthesizedProposal` ARE the
 * corpus's twin pairs — this feeds it the same thing. And it imports the
 * COMPILED function rather than restating its prompt: this study has already
 * shipped one wrong conclusion from a harness that re-implemented the code under
 * test and silently stopped matching it (RESULTS.md Finding 8). Copying a prompt
 * to measure a prompt is that same mistake.
 *
 * Because it drives the compiled artifact, the measured variant is whatever
 * `functions/lib` currently holds:
 *
 *     cd functions && npm run build          # after editing the prompt
 *     node synthTextAB.mjs --label=baseline  # label names the variant in cache
 *
 * Labels keep two variants' results apart in the judge cache, so re-running a
 * label is free and an A/B is just two labelled runs either side of an edit.
 *
 *   usage: node synthTextAB.mjs [--label=NAME] [--pairs=N] [corpus.json]
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { buildPrompt, buildScopePrompt, judge, loadEnv, JUDGE_MODEL } from '../textFidelity.mjs';

const REPO = '/Users/talyaron/Documents/Freedi-app';
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const label = (args.find((a) => a.startsWith('--label=')) ?? '--label=baseline').split('=')[1];
const modelOverride = (args.find((a) => a.startsWith('--model=')) ?? '--model=').split('=')[1] || undefined;
const pairLimit = Number((args.find((a) => a.startsWith('--pairs=')) ?? '--pairs=50').split('=')[1]);
const corpusPath =
	args.find((a) => !a.startsWith('--')) ?? 'scripts/seedSynthBenchmark.accuracy100.en.json';

loadEnv();

const corpus = JSON.parse(readFileSync(resolve(REPO, corpusPath), 'utf8'));

// The real thing, not a restatement of it.
const { generateSynthesizedProposal } = require(
	resolve(REPO, 'functions/lib/functions/src/services/integration-ai-service.js'),
);

/** Every ground-truth twin pair: exactly what the pipeline merged. */
const pairs = [];
for (const topic of corpus.topics) {
	for (const s of topic.synths) {
		if (s.paraphrases.length !== 2) continue;
		pairs.push({ topic: topic.name, name: s.name, members: s.paraphrases });
	}
}

console.log(`variant "${label}" — ${Math.min(pairLimit, pairs.length)} pairs, judge ${JUDGE_MODEL}\n`);

const counts = { preserved: 0, weakened: 0, lost: 0 };
let fabricated = 0;
let scopeInflated = 0;
let addedCommitments = 0;
let refused = 0;
const damaged = [];

for (const pair of pairs.slice(0, pairLimit)) {
	const proposal = await generateSynthesizedProposal(
		pair.members.map((text, i) => ({
			statementId: `${pair.name}-${i}`,
			statement: text,
			paragraphsText: '',
			numberOfEvaluators: 5,
			consensus: 0.5,
			sumEvaluations: 4,
		})),
		corpus.questionText,
		modelOverride ? { heavyModel: modelOverride } : undefined,
	);

	// A refusal on a true paraphrase pair is a synthesis-layer error, not a text
	// one; count it rather than scoring text that was never written.
	if (proposal.cannotSynthesize === true) {
		refused++;
		damaged.push({ kind: 'REFUSED', title: pair.name, detail: proposal.reason ?? '' });
		continue;
	}

	// The card preview plus the sections — everything a participant can read.
	const body = [proposal.description, ...(proposal.paragraphs ?? [])].filter(Boolean).join('\n\n');
	const verdict = await judge(
		// Label participates in the cache key so two variants never collide.
		`${buildPrompt({
			question: corpus.questionText,
			members: pair.members,
			title: proposal.title,
			description: body,
		})}\n\n[variant:${label}]`,
	);

	if (verdict.fabricated === true) fabricated++;

	// On a body, `fabricated` saturates — the prompt orders an implementation
	// plan, so something is always added. Scope inflation is the part that
	// changes what people are voting on.
	const scope = await judge(
		`${buildScopePrompt({
			question: corpus.questionText,
			members: pair.members,
			title: proposal.title,
			description: body,
		})}\n\n[variant:${label}]`,
	);
	if (scope.addedCommitments === true) addedCommitments++;
	if (scope.scopeInflated === true) {
		scopeInflated++;
		damaged.push({
			kind: 'SCOPE',
			title: proposal.title,
			detail: scope.scopeDetail ?? '',
		});
	}
	for (const v of verdict.verdicts ?? []) {
		const l = ['preserved', 'weakened', 'lost'].includes(v.verdict) ? v.verdict : 'weakened';
		counts[l]++;
		if (l !== 'preserved') {
			damaged.push({
				kind: l.toUpperCase(),
				title: proposal.title,
				member: pair.members[(v.index ?? 1) - 1],
				detail: v.why ?? '',
			});
		}
	}
}

const total = counts.preserved + counts.weakened + counts.lost;
console.log(`syntheses written : ${Math.min(pairLimit, pairs.length) - refused}  (refused ${refused})`);
console.log(`members preserved : ${counts.preserved}/${total}`);
console.log(`        weakened  : ${counts.weakened}`);
console.log(`        lost      : ${counts.lost}`);
console.log(`fidelity          : ${total ? (counts.preserved / total).toFixed(3) : 'n/a'}`);
const written = Math.min(pairLimit, pairs.length) - refused;
console.log(`fabricated (blunt): ${fabricated}/${written} syntheses`);
console.log(`SCOPE INFLATED    : ${scopeInflated}/${written}   <- the one that changes the vote`);
console.log(`added commitments : ${addedCommitments}/${written}  (expected — the prompt orders a plan)`);

if (damaged.length) {
	console.log(`\nevery member the text did not carry cleanly:`);
	for (const d of damaged) {
		console.log(`  ${d.kind.padEnd(10)} "${String(d.title).slice(0, 70)}"`);
		if (d.member) console.log(`             member: "${d.member}"`);
		console.log(`             ${d.detail}`);
	}
}
