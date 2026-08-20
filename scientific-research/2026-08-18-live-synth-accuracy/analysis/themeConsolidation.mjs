/**
 * Offline: why does theme consolidation stop while redundant headings remain?
 *
 * The seed sweep left the synthesis layer exact (150/150 pairs, zero false
 * merges) and the theme layer variable: 11, 10 and 17 headings for a true 10.
 * The plan blamed the cap — `MAX_MERGES_PER_SWEEP = 8` in consolidateThemes.ts —
 * and proposed raising it. The run logs refute that directly:
 *
 *   seed 7    : 9 -> 7 (2 groups), 14 -> 11 (3), 11 -> 10 (1)
 *   seed 1234 : 8 -> 6 (2 groups), 19 -> 17 (2)
 *
 * The judge never proposed more than 3 groups in a sweep, so a cap of 8 was
 * never reached and raising it changes nothing. The binding constraint is what
 * the judge PROPOSES, and seed 1234's surviving 17 contain groupings a reader
 * would call obvious: "Household recycling services", "Air quality monitoring",
 * "Clean and efficient energy" and "Community gardens and urban agriculture"
 * are four headings over one topic.
 *
 * Two candidate causes, both testable without an emulator:
 *
 *   A. The judge sees only HEADINGS. "Air quality monitoring" and "Household
 *      recycling services" are not synonyms as strings; the proposals filed
 *      under them are what reveal one topic. This is the same lesson the
 *      reJudge gate already learned in the other direction (judge on members,
 *      not on titles — fn_synthesisReJudge.ts).
 *   B. One call per sweep is one pass. Merging is a fixpoint problem: absorbing
 *      two headings changes what the survivor covers, which can expose the next
 *      merge. Seed 7 reached 10 because it happened to get three sweeps.
 *
 * So this measures four mechanisms against the real final theme sets of all
 * three certified runs, using the shipped prompt verbatim as the baseline:
 *
 *   V0  titles only, one call            (what ships today)
 *   V1  titles only, looped to fixpoint  (isolates cause B)
 *   V2  with members, one call           (isolates cause A)
 *   V3  with members, looped to fixpoint (both)
 *
 * Scored against ground truth: a proposed group is CORRECT when every heading
 * in it resolves to the same ground-truth topic, and WRONG when it spans two.
 * A wrong merge is the expensive error — it destroys a distinct topic and is
 * invisible to a reader — so a variant that merges more is only better if it
 * merges more CORRECTLY. Seed 7 (already at the true 10) is the control: a
 * variant that damages it is over-merging, whatever it does for seed 1234.
 *
 *   usage: node themeConsolidation.mjs [runDir ...]
 *   env:   OPENAI_API_KEY (read from functions/.env, like the other scripts)
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const REPO = '/Users/talyaron/Documents/Freedi-app';
const RUNS = resolve(REPO, 'scientific-research/2026-08-18-live-synth-accuracy/runs');
const CACHE_DIR = resolve(REPO, 'scripts/.cache');

const DEFAULT_RUNS = [
	'en-seed42-consolidated',
	'en-seed7-consolidated',
	'en-seed1234-consolidated',
];
const REPEATS = Number(process.env.REPEATS ?? 2);
const MAX_ROUNDS = Number(process.env.MAX_ROUNDS ?? 5);
const MODEL = process.env.OPENAI_FAST_MODEL || 'gpt-5.6-luna';

// --- env, same loader the other analysis scripts use ---
for (const line of readFileSync(resolve(REPO, 'functions/.env'), 'utf8').split('\n')) {
	const t = line.trim();
	if (!t || t.startsWith('#')) continue;
	const i = t.indexOf('=');
	if (i === -1) continue;
	const k = t.slice(0, i).trim();
	let v = t.slice(i + 1).trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
		v = v.slice(1, -1);
	if (!(k in process.env)) process.env[k] = v;
}
if (!process.env.OPENAI_API_KEY) {
	console.error('OPENAI_API_KEY missing — set it in functions/.env (npm run env:dev).');
	process.exit(1);
}

/* ------------------------------------------------------------------ *
 * Load a run and rebuild each surviving theme with its contents and
 * its ground-truth topic.
 * ------------------------------------------------------------------ */
function loadRun(dir) {
	const root = resolve(RUNS, dir);
	const results = JSON.parse(readFileSync(resolve(root, 'results.json'), 'utf8'));
	const corpus = JSON.parse(readFileSync(resolve(root, 'statements.json'), 'utf8'));

	const truthById = new Map(corpus.statements.map((s) => [s.id, s.groundTruthTopic]));
	const textById = new Map(corpus.statements.map((s) => [s.id, s.text]));
	const synthById = new Map(results.synths.items.map((s) => [s.id, s]));

	const themes = results.topicClusters.items
		.filter((t) => !t.hidden)
		.map((t) => {
			const synths = (t.memberSynthIds ?? []).map((id) => synthById.get(id)).filter(Boolean);
			const memberIds = [
				...(t.members ?? []).map((m) => m.id ?? m),
				...synths.flatMap((s) => (s.members ?? []).map((m) => m.id ?? m)),
			];
			// A heading's ground truth is the topic most of its statements came from.
			const counts = new Map();
			for (const id of memberIds) {
				const topic = truthById.get(id);
				if (topic) counts.set(topic, (counts.get(topic) ?? 0) + 1);
			}
			const truth = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

			return {
				id: t.id,
				title: t.title,
				truth,
				statementCount: memberIds.length,
				// What a reader actually sees under the heading.
				contents: synths.length
					? synths.map((s) => s.title)
					: memberIds.map((id) => textById.get(id)).filter(Boolean),
			};
		})
		// A heading with no resolvable content cannot be scored either way.
		.filter((t) => t.truth !== null);

	return { question: corpus.question, seed: corpus.seed, themes };
}

/* ------------------------------------------------------------------ *
 * Prompts. V0/V1 are the SHIPPED prompt verbatim — copying it is the
 * point of the baseline, and any divergence would measure the copy.
 * ------------------------------------------------------------------ */
function promptTitlesOnly(themes, question) {
	const themeLines = themes.map((t, i) => `${i + 1}. [${t.id}] ${t.title}`).join('\n');

	return `You are tidying the topic headings of a community consultation.

QUESTION: "${question}"

CURRENT TOPICS:
${themeLines}

These headings grew one at a time as ideas arrived, so some are narrower than
they should be and several may name the same area of concern.

TASK: Find groups of topics that should be ONE topic, and give each group a
heading that covers it.

Group topics that describe the same area of life or the same domain of city
activity — a narrow heading should be absorbed into a broader one that covers it
("Smaller class sizes" and "Student nutrition programs" both belong under
schools). Do NOT group topics merely because both are about the city, or because
both are broadly civic; the result must still be a heading a reader would find
useful for browsing.

Leave a topic out of every group when it genuinely stands alone. Returning no
groups at all is a valid answer.

Return JSON:
{
  "groups": [
    { "ids": ["id1", "id2"], "title": "3–6 word heading for the merged topic" }
  ]
}`;
}

function promptWithMembers(themes, question) {
	const themeLines = themes
		.map((t, i) => {
			const shown = t.contents.slice(0, 4).map((c) => `     - ${c}`);
			const more = t.contents.length > 4 ? `     - (+${t.contents.length - 4} more)` : null;

			return [
				`${i + 1}. [${t.id}] ${t.title}  (${t.contents.length} proposal${t.contents.length === 1 ? '' : 's'})`,
				...shown,
				...(more ? [more] : []),
			].join('\n');
		})
		.join('\n');

	return `You are tidying the topic headings of a community consultation.

QUESTION: "${question}"

CURRENT TOPICS, each with the proposals filed under it:
${themeLines}

These headings grew one at a time as ideas arrived. A heading was written when
its first proposal arrived, so it describes THAT proposal rather than the topic
it has come to stand for. Judge by the proposals underneath, not by how similar
the headings sound: two headings that share no words can still be one topic.

TASK: Find groups of topics that should be ONE topic, and give each group a
heading that covers it.

Group topics whose proposals a resident would expect to browse together — the
same area of life or the same domain of city activity ("Smaller class sizes" and
"Student nutrition programs" both belong under schools; "Household recycling"
and "Air quality monitoring" both belong under the environment). A heading
holding a single proposal is usually a heading written too early, so look hard
for where it belongs before leaving it alone. Do NOT group topics merely because
both are about the city, or because both are broadly civic; the result must
still be a heading a reader would find useful for browsing, and two genuinely
different concerns must stay apart.

Leave a topic out of every group when it genuinely stands alone. Returning no
groups at all is a valid answer.

Return JSON:
{
  "groups": [
    { "ids": ["id1", "id2"], "title": "3–6 word heading for the merged topic" }
  ]
}`;
}

/* ------------------------------------------------------------------ *
 * Model call. Cached on the prompt so a re-run is free and a partial
 * failure can be resumed.
 * ------------------------------------------------------------------ */
mkdirSync(CACHE_DIR, { recursive: true });
const CACHE_FILE = resolve(CACHE_DIR, 'theme-consolidation-judge.jsonl');
const cache = new Map();
if (existsSync(CACHE_FILE)) {
	for (const line of readFileSync(CACHE_FILE, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		const r = JSON.parse(line);
		cache.set(r.key, r.value);
	}
}

async function judge(prompt, attempt) {
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
					// gpt-5 family: max_completion_tokens, no temperature — same rule
					// as functions/src/config/openai-chat.ts buildModelParams().
					max_completion_tokens: 4096,
				}),
			});
			if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
			const body = await res.json();
			const text = (body.choices?.[0]?.message?.content ?? '')
				.replace(/```json\s*/gi, '')
				.replace(/```\s*/g, '')
				.trim();
			const parsed = JSON.parse(text);
			const groups = Array.isArray(parsed.groups) ? parsed.groups : [];
			cache.set(key, groups);
			writeFileSync(CACHE_FILE, `${JSON.stringify({ key, value: groups })}\n`, { flag: 'a' });

			return groups;
		} catch (error) {
			lastError = error;
			await new Promise((r) => setTimeout(r, 1000 * 2 ** tryNo));
		}
	}
	console.error(`   judge failed after retries: ${lastError?.message ?? lastError}`);

	return [];
}

/**
 * The same sanitising the production function applies: only ids that were
 * offered, and no heading in two groups. Measuring an unsanitised response
 * would credit the model for merges the code would discard.
 */
function sanitise(rawGroups, themes) {
	const known = new Set(themes.map((t) => t.id));
	const claimed = new Set();
	const out = [];
	for (const raw of rawGroups) {
		if (!raw || !Array.isArray(raw.ids)) continue;
		const ids = raw.ids.filter((id) => typeof id === 'string' && known.has(id) && !claimed.has(id));
		if (ids.length < 2) continue;
		ids.forEach((id) => claimed.add(id));
		const title =
			typeof raw.title === 'string' && raw.title.trim()
				? raw.title.trim()
				: (themes.find((t) => t.id === ids[0])?.title ?? '');
		if (!title) continue;
		out.push({ ids, title });
	}

	return out;
}

/** Apply merges the way consolidateThemes does: survivor keeps the union. */
function applyGroups(themes, groups) {
	const byId = new Map(themes.map((t) => [t.id, t]));
    const dropped = new Set();
	for (const g of groups) {
		const members = g.ids.map((id) => byId.get(id)).filter(Boolean);
		if (members.length < 2) continue;
		const survivor = [...members].sort((a, b) => b.statementCount - a.statementCount)[0];
		survivor.title = g.title;
		for (const m of members) {
			if (m.id === survivor.id) continue;
			survivor.statementCount += m.statementCount;
			survivor.contents = [...survivor.contents, ...m.contents];
			dropped.add(m.id);
		}
		// The survivor's ground truth is recomputed from the merged membership,
		// so a wrong merge shows up as a topic that no longer has a heading.
		const counts = new Map();
		for (const m of members) counts.set(m.truth, (counts.get(m.truth) ?? 0) + m.statementCount);
		survivor.truth = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
	}

	return themes.filter((t) => !dropped.has(t.id));
}

function scoreGroups(groups, themes) {
	const byId = new Map(themes.map((t) => [t.id, t]));
	let correct = 0;
	let wrong = 0;
	const wrongDetail = [];
	for (const g of groups) {
		const truths = new Set(g.ids.map((id) => byId.get(id)?.truth).filter(Boolean));
		if (truths.size === 1) correct++;
		else {
			wrong++;
			wrongDetail.push(`${g.title} <- ${[...truths].join(' + ')}`);
		}
	}

	return { correct, wrong, wrongDetail };
}

/* ------------------------------------------------------------------ *
 * One variant, one repeat: run to fixpoint (or a single call).
 * ------------------------------------------------------------------ */
async function runVariant(run, { withMembers, loop }, attempt) {
	let themes = run.themes.map((t) => ({ ...t, contents: [...t.contents] }));
	const started = themes.length;
	let correct = 0;
	let wrong = 0;
	const wrongDetail = [];
	let rounds = 0;

	for (let round = 0; round < (loop ? MAX_ROUNDS : 1); round++) {
		const prompt = withMembers
			? promptWithMembers(themes, run.question)
			: promptTitlesOnly(themes, run.question);
		const groups = sanitise(await judge(prompt, `${attempt}:${round}`), themes);
		rounds++;
		if (groups.length === 0) break;
		const s = scoreGroups(groups, themes);
		correct += s.correct;
		wrong += s.wrong;
		wrongDetail.push(...s.wrongDetail);
		themes = applyGroups(themes, groups);
	}

	// How many of the 10 true topics still have a heading standing for them,
	// and how many headings there are in total. Both matter: 10 headings that
	// cover 7 topics is not a success.
	const topicsCovered = new Set(themes.map((t) => t.truth)).size;

	return {
		started,
		final: themes.length,
		topicsCovered,
		correct,
		wrong,
		wrongDetail,
		rounds,
		titles: themes.map((t) => t.title),
	};
}

/* ------------------------------------------------------------------ */
const VARIANTS = [
	{ name: 'V0 titles, 1 call  (ships today)', withMembers: false, loop: false },
	{ name: 'V1 titles, to fixpoint', withMembers: false, loop: true },
	{ name: 'V2 members, 1 call', withMembers: true, loop: false },
	{ name: 'V3 members, to fixpoint', withMembers: true, loop: true },
];

const dirs = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_RUNS;
const summary = [];

for (const dir of dirs) {
	const run = loadRun(basename(dir));
	const trueTopics = new Set(run.themes.map((t) => t.truth)).size;
	console.log(`\n=== ${basename(dir)} — seed ${run.seed}`);
	console.log(
		`    ${run.themes.length} headings standing for ${trueTopics} true topics ` +
			`(${run.themes.length - trueTopics} redundant)\n`,
	);

	for (const variant of VARIANTS) {
		const reps = [];
		for (let attempt = 0; attempt < REPEATS; attempt++) {
			reps.push(await runVariant(run, variant, attempt));
		}
		const avg = (f) => reps.reduce((s, r) => s + f(r), 0) / reps.length;
		const line = {
			run: basename(dir),
			seed: run.seed,
			variant: variant.name,
			started: reps[0].started,
			trueTopics,
			final: avg((r) => r.final),
			topicsCovered: avg((r) => r.topicsCovered),
			correct: avg((r) => r.correct),
			wrong: avg((r) => r.wrong),
			rounds: avg((r) => r.rounds),
		};
		summary.push(line);
		console.log(
			`  ${variant.name.padEnd(36)} ${String(reps[0].started).padStart(2)} -> ` +
				`${line.final.toFixed(1).padStart(4)} headings   ` +
				`merges ok ${line.correct.toFixed(1)} / wrong ${line.wrong.toFixed(1)}   ` +
				`topics kept ${line.topicsCovered.toFixed(1)}/${trueTopics}   ` +
				`rounds ${line.rounds.toFixed(1)}`,
		);
		for (const r of reps) {
			for (const w of r.wrongDetail) console.log(`        WRONG MERGE  ${w}`);
		}
	}

	// Show what the best variant actually leaves a reader.
	const best = await runVariant(run, VARIANTS[3], 0);
	console.log(`\n    V3 final headings (${best.final}):`);
	for (const t of best.titles) console.log(`      - ${t}`);
}

console.log('\n\n=== summary ===');
console.log(
	'run                        variant                               start  final  ok  wrong  kept',
);
for (const s of summary) {
	console.log(
		`${s.run.padEnd(26)} ${s.variant.padEnd(36)} ${String(s.started).padStart(5)}  ` +
			`${s.final.toFixed(1).padStart(5)}  ${s.correct.toFixed(1).padStart(3)}  ` +
			`${s.wrong.toFixed(1).padStart(5)}  ${s.topicsCovered.toFixed(1)}/${s.trueTopics}`,
	);
}
