#!/usr/bin/env node
/**
 * Self-contained validation scorer — NO dependencies, NO emulator, NO API keys.
 *
 * Reads a test folder's `statements.json` (input + ground-truth labels) and
 * `results.json` (the produced synths + topic-clusters) and recomputes the
 * metrics in that test's report.md, so any reader can independently verify the
 * verdict from the committed artifacts alone.
 *
 * USAGE:
 *   node score.mjs <test-folder>
 *   e.g. node score.mjs 1-6-2026-40-20-10-validation
 *
 * This verifies the REPORTED structure against ground truth. To re-derive the
 * structure itself from the raw embeddings (the clustering step), use
 * functions/scripts/verifyFromEmbeddings.ts (see report.md → Reproduction).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
	console.error('Usage: node score.mjs <test-folder>');
	process.exit(1);
}
const statements = JSON.parse(readFileSync(join(dir, 'statements.json'), 'utf-8'));
const results = JSON.parse(readFileSync(join(dir, 'results.json'), 'utf-8'));

// Ground truth: option id -> {topic, synth}
const gt = new Map(statements.statements.map((s) => [s.id, { topic: s.groundTruthTopic, synth: s.groundTruthSynth }]));
const synths = results.synths.items;
const topics = results.topicClusters.items;

const checks = [];
const check = (name, expected, observed, pass) => checks.push({ name, expected, observed, pass });

// --- counts ---
check('synth count', 4, synths.length, synths.length === 4);
check('topic-cluster count', 2, topics.length, topics.length === 2);

// --- per-synth purity (dominant ground-truth label / members) ---
let allPure = true;
const synthLabel = new Map(); // synthId -> dominant ground-truth synth
for (const s of synths) {
	const dist = {};
	for (const m of s.members) {
		const lbl = gt.get(m.id)?.synth ?? '?';
		dist[lbl] = (dist[lbl] ?? 0) + 1;
	}
	const [domLabel, domCount] = Object.entries(dist).sort((a, b) => b[1] - a[1])[0] ?? ['?', 0];
	const purity = s.members.length ? domCount / s.members.length : 0;
	synthLabel.set(s.id, domLabel);
	const pure = purity === 1 && s.members.length === 10;
	allPure &&= pure;
	check(`synth "${s.title.slice(0, 32)}…"`, '10 members, 100% pure', `${s.members.length} members, ${(purity * 100).toFixed(0)}% (${domLabel})`, pure);
}

// --- overlap: any option claimed by >1 synth ---
const claims = new Map();
for (const s of synths) for (const m of s.members) claims.set(m.id, (claims.get(m.id) ?? 0) + 1);
const doubleClaimed = [...claims.values()].filter((n) => n > 1).length;
check('options claimed by >1 synth', 0, doubleClaimed, doubleClaimed === 0);

// --- coverage: every ground-truth option assigned exactly once ---
const assigned = claims.size;
check('options assigned', statements.statements.length, assigned, assigned === statements.statements.length);

// --- topic grouping: each topic groups synths of one ground-truth topic ---
let topicsCorrect = true;
for (const t of topics) {
	const topicGts = new Set(
		t.memberSynthIds.map((sid) => {
			const dom = synthLabel.get(sid);
			// map dominant synth label -> its ground-truth topic
			const opt = statements.statements.find((o) => o.groundTruthSynth === dom);

			return opt?.groundTruthTopic ?? '?';
		}),
	);
	const ok = topicGts.size === 1 && !topicGts.has('?');
	topicsCorrect &&= ok;
	check(`topic "${t.title.slice(0, 28)}…"`, 'groups one topic', [...topicGts].join('+'), ok);
}

// --- print ---
console.info(`\nValidation score — ${statements.test}\n`);
for (const c of checks) {
	console.info(`  ${c.pass ? '✅' : '❌'}  ${c.name.padEnd(46)} expected ${String(c.expected).padEnd(22)} got ${c.observed}`);
}
const passed = checks.every((c) => c.pass);
console.info(`\n${passed ? '✅ PASS' : '❌ FAIL'} — ${checks.filter((c) => c.pass).length}/${checks.length} checks\n`);
process.exit(passed ? 0 : 1);
