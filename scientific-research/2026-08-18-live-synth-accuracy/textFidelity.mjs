/**
 * Does the merged proposal still say what the people it merged were asking for?
 *
 * Everything this study has measured so far is about MEMBERSHIP — which
 * statements ended up in one group. That reached ground truth exactly (150/150
 * pairs across three seeds, zero false merges). But membership is only half of
 * being right. A synthesis holds the correct two statements and then replaces
 * them, in the list participants read and vote on, with wording an LLM wrote.
 * Nothing has ever read that wording. A merge can group the right two people and
 * still publish a proposal that carries only one of them — and the member whose
 * ask was dropped has been silently disenfranchised by a system whose scoreboard
 * says 1.000.
 *
 * This scores the text. Per member statement inside each synthesis:
 *
 *   preserved — a reader of the merged proposal would know this was asked for
 *   weakened  — the idea is there but its specific ask is generalised away
 *   lost      — a reader would not know this was asked for
 *
 * and per synthesis, whether the merged text commits to something NO member
 * asked for (fabrication). Weakening is called out separately from loss on
 * purpose: over-generalisation is this pipeline's known failure direction — a
 * synth title that abstracted far enough to pull in a neighbouring idea is what
 * cost precision in two earlier rounds (RESULTS.md Finding 5).
 *
 * VALIDATE THE INSTRUMENT FIRST. An LLM judge that says "preserved" to
 * everything would report a perfect score on a pipeline that had destroyed half
 * its input, and would look exactly like good news:
 *
 *     node textFidelity.selftest.mjs
 *
 * Then:
 *     node textFidelity.mjs <run-folder> [...]
 *
 * A note on what is scorable. Runs before the exporter carried `description`
 * hold only the synthesis TITLE, so on those this measures the title alone —
 * a harsher test than the participant's view, since the body is where a
 * secondary ask would survive. The output says which it scored, and mixing the
 * two in one comparison would be measuring two different things.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const REPO = '/Users/talyaron/Documents/Freedi-app';
const RUNS = resolve(REPO, 'scientific-research/2026-08-18-live-synth-accuracy/runs');
const CACHE_FILE = resolve(REPO, 'scripts/.cache/text-fidelity-judge.jsonl');

// Heavy tier: this is the careful-judgement call, not a labelling chore, and it
// is the same tier the pipeline uses to write the text being judged.
export const JUDGE_MODEL = process.env.OPENAI_HEAVY_MODEL || 'gpt-5.6-terra';

export function loadEnv() {
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
		console.error('OPENAI_API_KEY missing — set it in env/.env.dev and run `npm run env:dev`.');
		process.exit(1);
	}
}

/* ------------------------------------------------------------------ *
 * The judge
 * ------------------------------------------------------------------ */
export function buildPrompt({ question, members, title, description }) {
	const memberLines = members.map((m, i) => `${i + 1}. "${m}"`).join('\n');
	const body = description?.trim() ? description.trim() : '(no body — the title is all a reader gets)';

	return `Residents answered this question with their own proposals:

QUESTION: "${question}"

These proposals were judged to be the same idea and were merged into one. The
originals are no longer shown to anyone; the merged version below replaces them.

ORIGINAL PROPOSALS:
${memberLines}

THE MERGED PROPOSAL AS PUBLISHED:
TITLE: ${title}
BODY: ${body}

For EACH original proposal, decide what happened to the specific thing it asked
for. Judge only what the merged text actually says — not what a reader might
generously assume, and not whether the proposals were similar enough to merge.

  "preserved" — someone reading only the merged proposal would understand that
                this specific thing was being asked for.
  "weakened"  — the idea is recognisable, but the concrete ask has been
                generalised, softened, or folded into a broader statement, so
                the reader would not know what was actually wanted.
  "lost"      — a reader would have no idea this was asked for.

Two proposals that genuinely said the SAME thing should both be "preserved" by a
single faithful sentence — do not mark one "lost" merely because it is not
quoted separately.

Then: does the merged proposal commit to anything that NO original proposal
asked for — a mechanism, a budget, a scope, a beneficiary that was invented?

Return JSON:
{
  "verdicts": [
    { "index": 1, "verdict": "preserved|weakened|lost", "why": "one short sentence" }
  ],
  "fabricated": true|false,
  "fabricationDetail": "what was invented, or empty"
}`;
}

/**
 * A sharper question than `fabricated`, for when there is a BODY to judge.
 *
 * `fabricated` asks "does this commit to anything no original asked for". On a
 * title that is a good question and fires rarely. On a body it saturates: the
 * synthesis prompt explicitly orders an implementation plan — "who does what, on
 * what timeline, with what success measure", 2–4 paragraphs of 80–140 words —
 * from inputs that are often a single sentence each. Measured, it flags 3 of 3.
 * A signal that is always on cannot rank anything, and would make a real
 * regression invisible.
 *
 * So the two things it was conflating are asked separately, because they are not
 * equally bad:
 *
 *   scopeInflated    — the text widened WHO or WHAT is covered. "in underserved
 *                      neighborhoods" becomes "citywide"; "workers" becomes
 *                      "residents". This changes what people are voting on, and
 *                      it is the failure mode this pipeline is known to have —
 *                      over-abstraction is what cost precision in Finding 5.
 *   addedCommitments — launch dates, reporting duties, named departments the
 *                      inputs never mentioned. Expected, since the prompt asks
 *                      for them; worth counting, not alarming on.
 */
export function buildScopePrompt({ question, members, title, description }) {
	const memberLines = members.map((m, i) => `${i + 1}. "${m}"`).join('\n');

	return `Residents answered this question with their own proposals:

QUESTION: "${question}"

ORIGINAL PROPOSALS:
${memberLines}

THESE WERE MERGED AND PUBLISHED AS:
TITLE: ${title}
BODY: ${description?.trim() || '(none)'}

Answer two separate questions about the published text.

1. SCOPE. Does it widen WHO is covered or WHAT is covered, beyond what the
   originals asked for? Examples of widening: originals say "in underserved
   neighborhoods", text says "citywide"; originals say "workers", text says
   "all residents"; originals say "route 5", text says "the whole network".
   Restating the same scope in different words is NOT widening. Narrowing is
   also not widening — report it only under question 2 if relevant.

2. ADDED COMMITMENTS. Does it commit to mechanisms, timelines, budgets, named
   departments, reporting or monitoring duties that no original mentioned?

Return JSON:
{
  "scopeInflated": true|false,
  "scopeDetail": "the original wording -> the published wording, or empty",
  "addedCommitments": true|false,
  "commitmentDetail": "briefly what was added, or empty"
}`;
}

const cache = new Map();
mkdirSync(resolve(REPO, 'scripts/.cache'), { recursive: true });
if (existsSync(CACHE_FILE)) {
	for (const line of readFileSync(CACHE_FILE, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		const r = JSON.parse(line);
		cache.set(r.key, r.value);
	}
}

export async function judge(prompt, { useCache = true } = {}) {
	const key = `${JUDGE_MODEL}::${prompt}`;
	if (useCache && cache.has(key)) return cache.get(key);

	let lastError = null;
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const res = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
				},
				body: JSON.stringify({
					model: JUDGE_MODEL,
					messages: [{ role: 'user', content: prompt }],
					response_format: { type: 'json_object' },
					max_completion_tokens: 4096,
				}),
			});
			if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
			const bodyJson = await res.json();
			const text = (bodyJson.choices?.[0]?.message?.content ?? '')
				.replace(/```json\s*/gi, '')
				.replace(/```\s*/g, '')
				.trim();
			const parsed = JSON.parse(text);
			cache.set(key, parsed);
			writeFileSync(CACHE_FILE, `${JSON.stringify({ key, value: parsed })}\n`, { flag: 'a' });

			return parsed;
		} catch (error) {
			lastError = error;
			await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
		}
	}
	throw new Error(`judge failed after retries: ${lastError?.message ?? lastError}`);
}

/* ------------------------------------------------------------------ *
 * Scoring a run
 * ------------------------------------------------------------------ */
async function scoreRun(dir) {
	const root = resolve(RUNS, basename(dir));
	const results = JSON.parse(readFileSync(resolve(root, 'results.json'), 'utf8'));
	const corpus = JSON.parse(readFileSync(resolve(root, 'statements.json'), 'utf8'));
	const textById = new Map(corpus.statements.map((s) => [s.id, s.text]));

	const synths = results.synths.items.filter((s) => !s.hidden);
	const withBody = synths.filter((s) => s.description?.trim()).length;

	const counts = { preserved: 0, weakened: 0, lost: 0 };
	let fabricated = 0;
	let scored = 0;
	const damaged = [];

	for (const synth of synths) {
		const members = (synth.members ?? [])
			.map((m) => textById.get(m.id ?? m))
			.filter(Boolean);
		// A synthesis whose members are not in the corpus (nested synths) is not
		// a text-fidelity question; skip rather than score it as perfect.
		if (members.length < 2) continue;

		const verdict = await judge(
			buildPrompt({
				question: corpus.question,
				members,
				title: synth.title,
				description: synth.description,
			}),
		);
		scored++;
		if (verdict.fabricated === true) {
			fabricated++;
			damaged.push({
				kind: 'FABRICATED',
				title: synth.title,
				detail: verdict.fabricationDetail ?? '',
			});
		}
		for (const v of verdict.verdicts ?? []) {
			const label = ['preserved', 'weakened', 'lost'].includes(v.verdict) ? v.verdict : 'weakened';
			counts[label]++;
			if (label !== 'preserved') {
				damaged.push({
					kind: label.toUpperCase(),
					title: synth.title,
					member: members[(v.index ?? 1) - 1],
					detail: v.why ?? '',
				});
			}
		}
	}

	const totalMembers = counts.preserved + counts.weakened + counts.lost;

	return {
		run: basename(dir),
		synthsScored: scored,
		bodyCoverage: `${withBody}/${synths.length}`,
		scoredField: withBody === synths.length ? 'title+body' : withBody === 0 ? 'title only' : 'MIXED',
		totalMembers,
		...counts,
		fidelity: totalMembers ? counts.preserved / totalMembers : 0,
		lossRate: totalMembers ? counts.lost / totalMembers : 0,
		fabricated,
		damaged,
	};
}

/* ------------------------------------------------------------------ */
if (import.meta.url === `file://${process.argv[1]}`) {
	loadEnv();
	const dirs = process.argv.slice(2);
	if (dirs.length === 0) {
		console.error('usage: node textFidelity.mjs <run-folder> [...]');
		process.exit(1);
	}

	const rows = [];
	for (const dir of dirs) {
		const r = await scoreRun(dir);
		rows.push(r);
		console.log(`\n=== ${r.run}`);
		console.log(
			`    scored ${r.synthsScored} syntheses on ${r.scoredField} (bodies present: ${r.bodyCoverage})`,
		);
		console.log(
			`    members  preserved ${r.preserved}  weakened ${r.weakened}  lost ${r.lost}  (of ${r.totalMembers})`,
		);
		console.log(
			`    fidelity ${r.fidelity.toFixed(3)}   loss ${r.lossRate.toFixed(3)}   fabricated syntheses ${r.fabricated}`,
		);
		if (r.damaged.length) {
			console.log(`\n    every member the merge did not carry cleanly:`);
			for (const d of r.damaged) {
				console.log(`      ${d.kind.padEnd(10)} "${d.title}"`);
				if (d.member) console.log(`                 member: "${d.member}"`);
				console.log(`                 ${d.detail}`);
			}
		}
	}

	if (rows.length > 1) {
		console.log('\n\n=== summary ===');
		console.log('run                        scored  field        fidelity  weakened  lost  fabricated');
		for (const r of rows) {
			console.log(
				`${r.run.padEnd(26)} ${String(r.synthsScored).padStart(6)}  ${r.scoredField.padEnd(11)} ` +
					`${r.fidelity.toFixed(3).padStart(8)}  ${String(r.weakened).padStart(8)}  ` +
					`${String(r.lost).padStart(4)}  ${String(r.fabricated).padStart(10)}`,
			);
		}
	}
}

export { scoreRun };
