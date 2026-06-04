#!/usr/bin/env node
/**
 * Self-contained validation scorer — NO dependencies, NO emulator, NO API keys.
 *
 * Reads a test folder's `statements.json` (input + ground-truth labels) and
 * `results.json` (produced synths + topic-clusters) and recomputes the metrics
 * in that test's report.md, so any reader can verify the verdict from the
 * committed artifacts alone.
 *
 * The EXPECTED structure is derived from the per-statement ground-truth labels,
 * so this works for any test shape (any number of topics/synths, uneven sizes,
 * singletons). Conventions (see DESIGNING-TEST-CORPORA.md):
 *   - `groundTruthSynth` label with >= 2 statements  → an expected synth of that size.
 *   - label with exactly 1 statement, OR a statement with `expectedRole`
 *     "singleton"/"noise"                            → expected to stay UNCLUSTERED
 *                                                      (the pipeline only merges >= 2).
 *   - a ground-truth topic with >= 2 synths          → an expected topic-cluster.
 *
 * USAGE:  node score.mjs <test-folder>
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

const rows = statements.statements;
const synths = results.synths?.items ?? [];
const topics = results.topicClusters?.items ?? [];

// --- derive expected structure from the ground-truth labels ---
const bySynth = new Map(); // label -> [ids]
const topicOfSynth = new Map(); // label -> topic
for (const r of rows) {
	const lbl = r.groundTruthSynth ?? '?';
	(bySynth.get(lbl) ?? bySynth.set(lbl, []).get(lbl)).push(r);
	if (r.groundTruthTopic) topicOfSynth.set(lbl, r.groundTruthTopic);
}
const isSingletonLabel = (lbl, members) =>
	members.length < 2 || members.some((m) => m.expectedRole === 'singleton' || m.expectedRole === 'noise');

const expectedSynths = new Map(); // label -> expected size  (>= 2 members)
const expectedSingletonIds = new Set();
for (const [lbl, members] of bySynth) {
	if (isSingletonLabel(lbl, members)) members.forEach((m) => expectedSingletonIds.add(m.id));
	else expectedSynths.set(lbl, members.length);
}
const synthLabelsByTopic = new Map(); // topic -> Set(synth labels)
for (const lbl of expectedSynths.keys()) {
	const t = topicOfSynth.get(lbl) ?? '?';
	(synthLabelsByTopic.get(t) ?? synthLabelsByTopic.set(t, new Set()).get(t)).add(lbl);
}
const expectedTopics = [...synthLabelsByTopic.entries()].filter(([, s]) => s.size >= 2).map(([t]) => t);

const checks = [];
const check = (name, expected, observed, pass) => checks.push({ name, expected, observed, pass });

// --- counts ---
check('synth count', expectedSynths.size, synths.length, synths.length === expectedSynths.size);
check('topic-cluster count', expectedTopics.length, topics.length, topics.length === expectedTopics.length);

// --- per produced synth: dominant gt label, purity, size match, bijection ---
const producedSynthLabel = new Map();
const recovered = new Set();
for (const s of synths) {
	const dist = {};
	for (const m of s.members) {
		const lbl = rows.find((r) => r.id === m.id)?.groundTruthSynth ?? '?';
		dist[lbl] = (dist[lbl] ?? 0) + 1;
	}
	const [domLabel, domCount] = Object.entries(dist).sort((a, b) => b[1] - a[1])[0] ?? ['?', 0];
	producedSynthLabel.set(s.id, domLabel);
	const purity = s.members.length ? domCount / s.members.length : 0;
	const expSize = expectedSynths.get(domLabel);
	const pure = purity === 1 && expSize !== undefined && s.members.length === expSize && !recovered.has(domLabel);
	if (pure) recovered.add(domLabel);
	check(
		`synth "${(s.title ?? '').slice(0, 30)}…"`,
		expSize !== undefined ? `${expSize} members, 100% pure` : `unexpected label`,
		`${s.members.length} members, ${(purity * 100).toFixed(0)}% (${domLabel})`,
		pure,
	);
}
check('all expected synths recovered', [...expectedSynths.keys()].join(','), [...recovered].join(','), recovered.size === expectedSynths.size);

// --- overlap, coverage ---
const claims = new Map();
for (const s of synths) for (const m of s.members) claims.set(m.id, (claims.get(m.id) ?? 0) + 1);
check('options claimed by >1 synth', 0, [...claims.values()].filter((n) => n > 1).length, ![...claims.values()].some((n) => n > 1));

const expectedAssigned = rows.length - expectedSingletonIds.size;
check('synth-member options assigned', expectedAssigned, claims.size, claims.size === expectedAssigned);

// --- singletons must NOT be swallowed into a synth ---
if (expectedSingletonIds.size) {
	const swallowed = [...expectedSingletonIds].filter((id) => claims.has(id)).length;
	check('singletons kept out of synths', 0, swallowed, swallowed === 0);
}

// --- topic grouping: each produced topic groups synths of one gt topic ---
for (const t of topics) {
	const gts = new Set((t.memberSynthIds ?? []).map((sid) => topicOfSynth.get(producedSynthLabel.get(sid)) ?? '?'));
	check(`topic "${(t.title ?? '').slice(0, 26)}…"`, 'groups one topic', [...gts].join('+'), gts.size === 1 && !gts.has('?'));
}

// --- print ---
console.info(`\nValidation score — ${statements.test}`);
console.info(`expected: ${expectedSynths.size} synths, ${expectedTopics.length} topic-clusters, ${expectedSingletonIds.size} singleton(s)\n`);
for (const c of checks) {
	console.info(`  ${c.pass ? '✅' : '❌'}  ${c.name.padEnd(46)} expected ${String(c.expected).padEnd(24)} got ${c.observed}`);
}
const passed = checks.every((c) => c.pass);
console.info(`\n${passed ? '✅ PASS' : '❌ FAIL'} — ${checks.filter((c) => c.pass).length}/${checks.length} checks\n`);
process.exit(passed ? 0 : 1);
