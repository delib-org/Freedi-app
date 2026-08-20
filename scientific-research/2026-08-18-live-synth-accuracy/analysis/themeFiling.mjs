#!/usr/bin/env node
/**
 * Where does theme impurity actually come from — and does showing the filing
 * judge each theme's contents, or flipping its doubt-bias, fix it?
 *
 * WHY THIS EXISTS. Finding 13 attributed the memberjudge run's regression
 * (0.910 → 0.865) to the consolidation sweep over-merging. The full audit trail
 * (audit-full.json, rescued from the emulator with prevState/newState intact)
 * refutes that attribution: neither impure final heading was a merge survivor
 * or donor. Every foreign member entered through FILING — `assignToTheme`
 * choosing a heading for a new proposal — or through the cosine topic-attach
 * path. The six sweep merges were themselves clean. The same signature (3–4
 * mixed headings, foreign members in whole-synth pairs) appears in every
 * certified baseline run, so filing is the accuracy ceiling of the theme layer
 * everywhere, and run-to-run "regressions" of ~0.05 are within its dice.
 *
 * WHAT THIS MEASURES. Every filing decision the run actually faced, re-asked
 * against the EXACT theme set that existed at that moment — reconstructed from
 * the audit events' own before/after membership snapshots, with creation-time
 * titles recovered from the emulator log (merge retitles applied at their
 * timestamps). This is deliberately the opposite of the mistake that produced
 * Finding 13's wrong prediction: no tidy end-states, only the mid-run states
 * the judge really saw. Reconstruction is certified two ways before any
 * judging: the sweep sizes must match the pump log (10 and 19), and the
 * post-sweep state must reproduce the live fingerprint byte-for-byte.
 *
 * THE 2×2. Two factors, isolated:
 *   evidence: theme titles+descriptions only (ships today)  vs  + member proposals
 *   bias:     "prefer an existing topic"    (ships today)  vs  "if unsure, NONE"
 * The bias flip is motivated by an economics change: when the shipped bias was
 * written there was no consolidation sweep, so a duplicate theme was permanent
 * clutter. Now a too-eager NONE self-heals (the sweep merges duplicate
 * headings) while a misfile is permanent. The cheap error has switched sides.
 *
 * F0 (ships today) is the COMPILED `assignToTheme`, not a copy of its prompt
 * (Finding 8: measuring a restatement measures the restatement). F1–F3 are
 * exploratory local prompts; a winner gets ported into source and re-measured
 * through the compiled path before anything else believes it.
 *
 *   usage: node themeFiling.mjs [runDir] [--repeats=3] [--variants=F0,F1,F2,F3]
 *   env:   OPENAI_API_KEY via functions/.env (loadEnv)
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { loadEnv } from '../textFidelity.mjs';

const REPO = '/Users/talyaron/Documents/Freedi-app';
const STUDY = resolve(REPO, 'scientific-research/2026-08-18-live-synth-accuracy');
const require = createRequire(import.meta.url);

const args = process.argv.slice(2);
const runDir = resolve(STUDY, 'runs', args.find((a) => !a.startsWith('--')) ?? 'en-seed42-memberjudge');
const REPEATS = Number((args.find((a) => a.startsWith('--repeats=')) ?? '--repeats=3').split('=')[1]);
const VARIANT_FILTER = (args.find((a) => a.startsWith('--variants=')) ?? '')
	.split('=')[1]
	?.split(',')
	.filter(Boolean);
const MODEL = process.env.OPENAI_FAST_MODEL || 'gpt-5.6-luna';
// Names the current functions/lib build in the compiled-path cache key. The
// local-prompt variants key on their full prompt text, but the compiled call's
// prompt lives inside the build — without a label, re-running after a rebuild
// would silently replay the OLD build's cached answers.
const LABEL = (args.find((a) => a.startsWith('--label=')) ?? '--label=ships').split('=')[1];
const CONTENTS_SHOWN = 4;

loadEnv();

/* ------------------------------------------------------------------ *
 * Load artifacts.
 * ------------------------------------------------------------------ */
const audit = JSON.parse(readFileSync(resolve(runDir, 'audit-full.json'), 'utf8'));
const stmts = JSON.parse(readFileSync(resolve(runDir, 'statements-full.json'), 'utf8'));
const corpus = JSON.parse(readFileSync(resolve(runDir, 'statements.json'), 'utf8'));
const sweepState = existsSync(resolve(runDir, 'sweep-state.json'))
	? JSON.parse(readFileSync(resolve(runDir, 'sweep-state.json'), 'utf8'))
	: [];

const truthOf = new Map(corpus.statements.map((s) => [s.id, s.groundTruthTopic]));
const docById = new Map(stmts.map((s) => [s.statementId, s]));
const QUESTION = corpus.question;

/** Creation-time theme titles, recovered from the emulator log. */
const creationTitle = new Map();
{
	const rawPath = process.env.THEME_LOG ?? resolve(runDir, 'theme-created.jsonl');
	// One-time import: the grep extract lives in scratchpad; keep a parsed copy
	// in the run folder so the evidence survives scratchpad cleanup.
	const scratch =
		'/private/tmp/claude-501/-Users-talyaron-Documents-Freedi-app/859c56fb-da66-402a-a750-2b67673f5f33/scratchpad/theme-log-raw.txt';
	if (!existsSync(rawPath) && existsSync(scratch)) {
		const out = [];
		for (const line of readFileSync(scratch, 'utf8').split('\n')) {
			if (!line.includes('themeCreated')) continue;
			const start = line.indexOf('{');
			if (start === -1) continue;
			// balanced-brace scan: the line holds the JSON twice, take the first
			let depth = 0;
			let end = -1;
			for (let i = start; i < line.length; i++) {
				if (line[i] === '{') depth++;
				else if (line[i] === '}' && --depth === 0) {
					end = i;
					break;
				}
			}
			if (end === -1) continue;
			try {
				const j = JSON.parse(line.slice(start, end + 1));
				if (j.topicClusterId && j.title) out.push({ id: j.topicClusterId, title: j.title });
			} catch {
				/* not a JSON payload line */
			}
		}
		writeFileSync(rawPath, out.map((o) => JSON.stringify(o)).join('\n') + '\n');
	}
	if (existsSync(rawPath)) {
		for (const line of readFileSync(rawPath, 'utf8').split('\n')) {
			if (!line.trim()) continue;
			const { id, title } = JSON.parse(line);
			creationTitle.set(id, title);
		}
	}
}

/* ------------------------------------------------------------------ *
 * Reconstruct each theme's timeline: created, membership snapshots,
 * title changes (merges retitle the survivor), hidden (absorbed).
 * ------------------------------------------------------------------ */
const themeIds = new Set(
	audit.filter((e) => e.triggerSource?.endsWith(':themeCreate')).map((e) => e.clusterId),
);
const timelines = new Map(); // themeId -> {createdAt, hiddenAt, titles:[{ts,title}], members:[{ts,ids}]}

for (const id of themeIds) {
	const doc = docById.get(id) ?? {};
	timelines.set(id, {
		createdAt: Infinity,
		hiddenAt: Infinity,
		titles: [],
		members: [],
		description: doc.description ?? '',
	});
}
for (const e of audit) {
	if (e.triggerSource?.endsWith(':themeCreate') && themeIds.has(e.clusterId)) {
		const t = timelines.get(e.clusterId);
		t.createdAt = e.timestamp;
		t.titles.push({
			ts: e.timestamp,
			title: creationTitle.get(e.clusterId) ?? docById.get(e.clusterId)?.statement ?? '(unknown)',
		});
		t.members.push({ ts: e.timestamp, ids: e.newState?.integratedOptions ?? [] });
	} else if (themeIds.has(e.clusterId) && e.newState?.integratedOptions) {
		const t = timelines.get(e.clusterId);
		t.members.push({ ts: e.timestamp, ids: e.newState.integratedOptions });
		if (e.action === 'merge') {
			const m = /themes consolidated into "(.+)"/.exec(e.reason ?? '');
			if (m) t.titles.push({ ts: e.timestamp, title: m[1] });
			for (const absorbed of e.newState?.absorbed ?? []) {
				const a = timelines.get(absorbed);
				if (a) a.hiddenAt = Math.min(a.hiddenAt, e.timestamp);
			}
		}
	}
}

const lastAtOrBefore = (list, ts) => {
	let found = null;
	for (const item of list) {
		if (item.ts <= ts) found = item;
		else break;
	}

	return found;
};

/** The visible theme set at instant ts, exactly as liveThemes() would list it. */
function themesAt(ts) {
	return [...timelines.entries()]
		.filter(([, t]) => t.createdAt <= ts && t.hiddenAt > ts)
		.map(([id, t]) => ({
			id,
			title: lastAtOrBefore(t.titles, ts)?.title ?? '(unknown)',
			description: t.description,
			memberIds: lastAtOrBefore(t.members, ts)?.ids ?? [],
			createdAt: t.createdAt,
		}))
		.sort((a, b) => a.createdAt - b.createdAt);
}

/* ------------------------------------------------------------------ *
 * Ground truth.
 * ------------------------------------------------------------------ */
function rawIdsOf(id, seen = new Set()) {
	if (seen.has(id)) return [];
	seen.add(id);
	if (truthOf.has(id)) return [id];
	const doc = docById.get(id);

	return doc ? (doc.integratedOptions ?? []).flatMap((m) => rawIdsOf(m, seen)) : [];
}
function dominantTruth(ids) {
	const counts = new Map();
	for (const id of ids)
		for (const raw of rawIdsOf(id)) {
			const t = truthOf.get(raw);
			if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
		}
	const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

	return best ? best[0] : null;
}
const titleOf = (id) => docById.get(id)?.statement ?? '(unknown)';

/* ------------------------------------------------------------------ *
 * Certify the reconstruction before judging anything with it.
 * ------------------------------------------------------------------ */
const mergeTs = audit.filter((e) => e.action === 'merge').map((e) => e.timestamp);
const sweeps = [];
for (const ts of mergeTs.sort((a, b) => a - b)) {
	const last = sweeps[sweeps.length - 1];
	if (last && ts - last.end < 60_000) last.end = ts;
	else sweeps.push({ start: ts, end: ts });
}
console.log('=== reconstruction checks');
for (const s of sweeps) {
	console.log(`  sweep at ${new Date(s.start).toISOString().slice(11, 19)}: ${themesAt(s.start - 1).length} visible themes`);
}
if (sweepState[0]) {
	const at = sweepState[0].judgedAt;
	const fp = themesAt(at)
		.map((t) => `${t.id}:${t.memberIds.length}`)
		.sort()
		.join('|');
	const ok = fp === sweepState[0].fingerprint;
	console.log(`  fingerprint @judgedAt: ${ok ? 'EXACT MATCH' : 'MISMATCH'}`);
	if (!ok) {
		console.log(`    live : ${sweepState[0].fingerprint}`);
		console.log(`    built: ${fp}`);
	}
}

/* ------------------------------------------------------------------ *
 * The decisions the run faced.
 * ------------------------------------------------------------------ */
const decisions = [];
for (const e of audit) {
	const ts = e.timestamp - 1; // the instant BEFORE the decision took effect
	if (e.triggerSource?.endsWith(':nest') && themeIds.has(e.clusterId)) {
		decisions.push({ kind: 'nest', ts, proposalId: e.optionId, liveChoice: e.clusterId });
	} else if (e.triggerSource?.endsWith(':optionTheme')) {
		decisions.push({ kind: 'option', ts, proposalId: e.optionId, liveChoice: e.clusterId });
	} else if (e.triggerSource?.endsWith(':themeCreate')) {
		if (themesAt(ts).length > 0)
			decisions.push({ kind: 'create', ts, proposalId: e.optionId, liveChoice: null });
	} else if (e.action === 'attach' && e.triggerSource === 'pipeline:onCreate' && themeIds.has(e.clusterId)) {
		decisions.push({ kind: 'cosine', ts, proposalId: e.optionId, liveChoice: e.clusterId });
	}
}
for (const d of decisions) {
	const doc = docById.get(d.proposalId);
	d.title = doc?.statement ?? '(unknown)';
	d.description = doc?.description;
	d.truth = dominantTruth([d.proposalId]);
	d.context = themesAt(d.ts).map((t) => ({ ...t, truth: dominantTruth(t.memberIds) }));
	d.correctIds = d.context.filter((t) => t.truth === d.truth).map((t) => t.id);
}

const judged = decisions.filter((d) => d.kind !== 'cosine');
console.log(`\n=== ${decisions.length} decisions (${judged.length} judged, ${decisions.length - judged.length} cosine)`);

function verdict(choice, d) {
	if (choice === null) return d.correctIds.length === 0 ? 'correct-none' : 'over-none';

	return d.correctIds.includes(choice) ? 'correct-file' : 'misfile';
}
function tally(rows) {
	const t = { 'correct-file': 0, 'correct-none': 0, 'over-none': 0, misfile: 0 };
	for (const r of rows) t[r]++;
	const total = rows.length || 1;

	return { ...t, accuracy: (t['correct-file'] + t['correct-none']) / total };
}

// Live behaviour, for reference (cosine attaches shown separately: no judge involved).
console.log('\n=== live outcome');
console.log('  judged :', JSON.stringify(tally(judged.map((d) => verdict(d.liveChoice, d)))));
console.log('  cosine :', JSON.stringify(tally(decisions.filter((d) => d.kind === 'cosine').map((d) => verdict(d.liveChoice, d)))));
for (const d of decisions) {
	const v = verdict(d.liveChoice, d);
	if (v === 'misfile') {
		const chosen = d.context.find((t) => t.id === d.liveChoice);
		console.log(
			`    MISFILE(${d.kind}) "${d.title.slice(0, 50)}" [${d.truth}] -> "${chosen?.title}" [${chosen?.truth}]`,
		);
	}
}

/* ------------------------------------------------------------------ *
 * Prompt variants. F0 is the compiled function; F1–F3 explore the 2×2.
 * ------------------------------------------------------------------ */
const compiled = require(resolve(REPO, 'functions/lib/functions/src/services/integration-ai-service.js'));

function themeLines(context, withContents) {
	return context
		.map((t, i) => {
			const head = `${i + 1}. [${t.id}] ${t.title}${t.description ? ` — ${t.description}` : ''}`;
			if (!withContents) return head;
			const titles = t.memberIds.map(titleOf);
			const shown = titles.slice(0, CONTENTS_SHOWN).map((c) => `     - ${c}`);
			const more = titles.length > CONTENTS_SHOWN ? [`     - (+${titles.length - CONTENTS_SHOWN} more)`] : [];

			return [head + `  (${titles.length} proposal${titles.length === 1 ? '' : 's'})`, ...shown, ...more].join('\n');
		})
		.join('\n');
}

const SHIPPED_BIAS = `Answer "NONE" only when the proposal genuinely belongs to no listed topic — a new
area of concern that none of them covers. Prefer an existing topic when one
plausibly fits; a proliferation of near-duplicate topics is worse for the reader
than a slightly broad one.`;

const FLIPPED_BIAS = `File the proposal under a topic only when it clearly belongs to the same area of
concern as what that topic already holds. When unsure, answer "NONE": a topic
created too eagerly is cheap, because a later tidy-up sweep merges duplicate
topics — but a proposal filed under the wrong topic stays there for every
reader. Do not choose a topic just because its title sounds broad enough to
cover anything.`;

/**
 * F5: F2's veto economics verbatim, plus ONE narrow carve-out for the
 * granularity refusals that dominated F2's over-NONEs (a class-size proposal
 * refused a home under "Student Nutrition Programs" — same area of life,
 * narrower title). F4 proved the carve-out must not become a general duty to
 * file: its "choose it even if the fit is imperfect" took misfiles straight
 * back up (17 → 30).
 */
const F5_BIAS = `File the proposal under a topic only when it clearly belongs to the same area of
concern as what that topic already holds. When unsure, answer "NONE": a topic
created too eagerly is cheap, because a later tidy-up sweep merges duplicate
topics — but a proposal filed under the wrong topic stays there for every
reader. Do not choose a topic just because its title sounds broad enough to
cover anything.

One narrowness exception: a topic whose proposals are clearly in the same area
of life as this proposal IS its home, even when the topic's title is narrower
than the proposal (a class-size proposal belongs with a school-meals topic —
both are about schools). "NONE" is for a different area of life, not for a
different sub-topic within the same area.`;

/**
 * F4: the F2 rule, aimed. F2's blanket "when unsure, NONE" cut misfiles 28→17
 * but doubled over-NONEs (31→48) — it licenses refusal on mere hesitation. This
 * makes the veto conditional on an actual area-CONFLICT with what the topic
 * holds, and states the positive duty to file when a same-area topic exists.
 */
const TARGETED_BIAS = `Match the proposal to the topic whose EXISTING PROPOSALS are about the same
area of concern. If such a topic exists, choose it — do not answer "NONE" merely
because the fit is imperfect or the topic's title is narrower than the proposal.
Titles lag their contents; a topic IS what it holds.

Answer "NONE" only when every listed topic's proposals are about a DIFFERENT
area of concern than this proposal — when filing it would make the chosen topic
less coherent for a reader browsing it. A "NONE" is cheap: a duplicate topic
gets merged by a later tidy-up sweep. A proposal filed under the wrong topic
stays there for every reader. Never file under a topic just because its title
sounds broad enough to cover anything.`;

function buildPrompt({ withContents, variantBias }, d) {
	const contextHeader = withContents
		? 'EXISTING TOPICS, each with the proposals filed under it:'
		: 'EXISTING TOPICS:';
	const judgeLine = withContents
		? `A topic groups proposals that address the same general area of concern, even when
they propose completely different actions. "Run buses more often" and "Add bike
lanes" are different actions but the same topic (getting around the city). Judge
by what is actually filed under a topic, not by how its title sounds — a title
is a compression of whatever arrived first, and may read broader or narrower
than the topic's real contents.`
		: `A topic groups proposals that address the same general area of concern, even when
they propose completely different actions. "Run buses more often" and "Add bike
lanes" are different actions but the same topic (getting around the city). Judge
by the area of life the proposal is about, NOT by whether the actions resemble
each other.`;

	return `You are filing a community proposal under the topic it belongs to.

QUESTION: "${QUESTION}"

${contextHeader}
${themeLines(d.context, withContents)}

PROPOSAL:
${d.title}${d.description ? `\n${d.description}` : ''}

TASK: Choose the ONE existing topic this proposal belongs under.

${judgeLine}

${variantBias === 'targeted' ? TARGETED_BIAS : variantBias === 'f5' ? F5_BIAS : variantBias === 'flipped' ? FLIPPED_BIAS : SHIPPED_BIAS}

Return JSON:
{
  "topicId": "the id in [brackets] of the chosen topic, or NONE",
  "reason": "≤ 12 words"
}`;
}

/* ------------------------------------------------------------------ *
 * Judge call with cache (same pattern as themeConsolidation.mjs).
 * ------------------------------------------------------------------ */
const CACHE_FILE = resolve(REPO, 'scripts/.cache/theme-filing-judge.jsonl');
mkdirSync(resolve(REPO, 'scripts/.cache'), { recursive: true });
const cache = new Map();
if (existsSync(CACHE_FILE)) {
	for (const line of readFileSync(CACHE_FILE, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		const r = JSON.parse(line);
		cache.set(r.key, r.value);
	}
}
async function callModel(prompt, attempt) {
	const key = `${MODEL}::${attempt}::${prompt}`;
	if (cache.has(key)) return cache.get(key);
	let lastError = null;
	for (let tryNo = 0; tryNo < 4; tryNo++) {
		try {
			const res = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
				},
				body: JSON.stringify({
					model: MODEL,
					messages: [{ role: 'user', content: prompt }],
					response_format: { type: 'json_object' },
					max_completion_tokens: 2048,
				}),
			});
			if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
			const body = await res.json();
			const parsed = JSON.parse(
				(body.choices?.[0]?.message?.content ?? '').replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim(),
			);
			const raw = typeof parsed.topicId === 'string' ? parsed.topicId.trim() : '';
			const value = !raw || raw.toUpperCase() === 'NONE' ? null : raw;
			cache.set(key, value);
			writeFileSync(CACHE_FILE, `${JSON.stringify({ key, value })}\n`, { flag: 'a' });

			return value;
		} catch (error) {
			lastError = error;
			await new Promise((r) => setTimeout(r, 1000 * 2 ** tryNo));
		}
	}
	console.error(`   judge failed: ${lastError?.message ?? lastError}`);

	return null;
}

/** F0 through the compiled artifact. Repeat-cached by wrapping in the same cache. */
async function callCompiled(d, attempt) {
	const key = `compiled::${LABEL}::${MODEL}::${attempt}::${d.proposalId}::${d.ts}`;
	if (cache.has(key)) return cache.get(key);
	const res = await compiled.assignToTheme({
		proposalTitle: d.title,
		proposalDescription: d.description,
		// Full member-title lists — the compiled function applies its own
		// CONTENTS_SHOWN_PER_THEME cap, exactly as live callers do.
		themes: d.context.map((t) => ({
			id: t.id,
			title: t.title,
			description: t.description,
			contents: t.memberIds.map(titleOf).filter(Boolean),
		})),
		questionContext: QUESTION,
	});
	const value = res.themeId ?? null;
	cache.set(key, value);
	writeFileSync(CACHE_FILE, `${JSON.stringify({ key, value })}\n`, { flag: 'a' });

	return value;
}

const VARIANTS = [
	{ name: 'F0 titles, prefer-file (ships, compiled)', compiled: true },
	{ name: 'F1 contents, prefer-file', withContents: true, variantBias: 'shipped' },
	{ name: 'F2 contents, unsure->NONE', withContents: true, variantBias: 'flipped' },
	{ name: 'F3 titles, unsure->NONE', withContents: false, variantBias: 'flipped' },
	{ name: 'F4 contents, conflict->NONE', withContents: true, variantBias: 'targeted' },
	{ name: 'F5 contents, NONE+narrowness-exception', withContents: true, variantBias: 'f5' },
].filter((v) => !VARIANT_FILTER?.length || VARIANT_FILTER.includes(v.name.split(' ')[0]));

console.log(`\n=== replaying ${judged.length} judged decisions × ${VARIANTS.length} variants × ${REPEATS} repeats (${MODEL})`);
const results = [];
for (const variant of VARIANTS) {
	const rows = [];
	const misfiles = new Map();
	const overNones = new Map();
	for (let attempt = 0; attempt < REPEATS; attempt++) {
		for (const d of judged) {
			const choice = variant.compiled
				? await callCompiled(d, attempt)
				: await callModel(buildPrompt(variant, d), attempt);
			// A hallucinated id (not offered) counts as NONE, like the shipped sanitiser.
			const clean = choice && d.context.some((t) => t.id === choice) ? choice : null;
			const v = verdict(clean, d);
			rows.push(v);
			if (v === 'misfile') {
				const chosen = d.context.find((t) => t.id === clean);
				const label = `"${d.title.slice(0, 45)}" [${d.truth}] -> "${chosen?.title.slice(0, 40)}" [${chosen?.truth}]`;
				misfiles.set(label, (misfiles.get(label) ?? 0) + 1);
			} else if (v === 'over-none') {
				const should = d.context.find((t) => d.correctIds.includes(t.id));
				const label = `"${d.title.slice(0, 45)}" [${d.truth}] had home "${should?.title.slice(0, 40)}"`;
				overNones.set(label, (overNones.get(label) ?? 0) + 1);
			}
		}
	}
	const t = tally(rows);
	results.push({ variant: variant.name, ...t, n: rows.length });
	console.log(`\n  ${variant.name}`);
	console.log(`    accuracy ${(t.accuracy * 100).toFixed(1)}%   file-ok ${t['correct-file']}  none-ok ${t['correct-none']}  MISFILE ${t.misfile}  over-none ${t['over-none']}   (n=${t['correct-file'] + t['correct-none'] + t.misfile + t['over-none']})`);
	for (const [label, n] of [...misfiles.entries()].sort((a, b) => b[1] - a[1])) {
		console.log(`      misfile ×${n}  ${label}`);
	}
	for (const [label, n] of [...overNones.entries()].sort((a, b) => b[1] - a[1])) {
		console.log(`      over-none ×${n}  ${label}`);
	}
}

console.log('\n=== summary (accuracy | misfiles | over-none, per decision-repeat)');
for (const r of results) {
	console.log(
		`  ${r.variant.padEnd(42)} ${(r.accuracy * 100).toFixed(1).padStart(5)}%   misfile ${String(r.misfile).padStart(3)}   over-none ${String(r['over-none']).padStart(3)}`,
	);
}
