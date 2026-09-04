#!/usr/bin/env node
/**
 * LLM-only clustering baseline for the 100-statement live-synth benchmark.
 *
 * Measures how well a BARE chat model — no embeddings, no queue, no judges, no
 * consolidation — clusters `scripts/seedSynthBenchmark.accuracy100.en.json`, so
 * the number can sit next to the production pipeline's as a baseline.
 *
 * Self-contained: Node 18+ `fetch`, no npm deps, no emulator. The only external
 * thing it touches is the OpenAI chat-completions API.
 *
 * CONDITIONS
 *   L1  one-shot batch: one prompt holds the question and all 100 statements
 *       (seeded arrival order, id-prefixed); the model returns syntheses + topics.
 *   L2  incremental placement: statements arrive one at a time; per arrival one
 *       call decides join-an-existing-synthesis vs new (join needs confidence
 *       >= 0.6); one final call groups the syntheses into topics.
 *
 * Arrival order is EXACTLY the pipeline harness's (scripts/runAccuracyBenchmark.ts):
 * flatten topic -> synth -> paraphrase, then Fisher-Yates driven by mulberry32(seed).
 * Ids s001..s100 follow the ORIGINAL corpus order so they are stable across seeds.
 *
 * USAGE
 *   node llmBaseline.mjs --condition=L1 --model=gpt-5.6-luna --seed=42
 *   node llmBaseline.mjs --all            # every condition x model x seed, pool of 3
 *   node llmBaseline.mjs --all --only=L2  # subset
 *
 * OUTPUT  runs/<condition>-<model>-seed<N>/{statements,results,raw,meta,scores}.json + scores.md
 * The API key is read from functions/.env (OPENAI_API_KEY) and never printed.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const CORPUS_PATH = join(REPO, 'scripts', 'seedSynthBenchmark.accuracy100.en.json');
const SCORER = join(REPO, 'scientific-research', '2026-08-18-live-synth-accuracy', 'score100.mjs');
const RUNS_DIR = join(HERE, 'runs');

const MODELS = { worker: 'gpt-5.6-luna', taxonomy: 'gpt-5.6-terra' };
const FALLBACK = { 'gpt-5.6-luna': 'gpt-4o-mini', 'gpt-5.6-terra': 'gpt-4o' };
const SEEDS = [42, 7, 1234];
/** $ per 1M tokens, [input, output]. */
const PRICE = {
	'gpt-5.6-luna': [0.2, 1.2],
	'gpt-5.6-terra': [2, 12],
	'gpt-4o-mini': [0.15, 0.6],
	'gpt-4o': [2.5, 10],
};
const L1_MAX_COMPLETION = 16000;
const L2_STEP_MAX_COMPLETION = 2000;
const L2_TOPIC_MAX_COMPLETION = 8000;
const JOIN_CONFIDENCE = 0.6;
const MAX_ATTEMPTS = 6;
const POOL = 3;

// ---------------------------------------------------------------- args
const argv = process.argv.slice(2);
const flag = (name, fallback) => {
	const raw = argv.find((a) => a.startsWith(`--${name}=`));

	return raw ? raw.slice(name.length + 3) : fallback;
};
const runAll = argv.includes('--all');
const only = flag('only', null);
const force = argv.includes('--force');

// ---------------------------------------------------------------- key
function loadApiKey() {
	if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
	const envPath = join(REPO, 'functions', '.env');
	const text = readFileSync(envPath, 'utf-8');
	const line = text.split('\n').find((l) => l.startsWith('OPENAI_API_KEY='));
	if (!line) throw new Error('OPENAI_API_KEY not found in functions/.env');
	let value = line.slice('OPENAI_API_KEY='.length).trim();
	if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
		value = value.slice(1, -1);
	}

	return value;
}
const API_KEY = loadApiKey();

// ---------------------------------------------------------------- corpus
const corpusBytes = readFileSync(CORPUS_PATH);
const corpus = JSON.parse(corpusBytes.toString('utf-8'));
const corpusSha = createHash('sha256').update(corpusBytes).digest('hex').slice(0, 12);
const QUESTION = corpus.questionText;

/** Flatten in corpus order, assigning stable ids s001..s100. */
function flattenCorpus() {
	const flat = [];
	for (const topic of corpus.topics) {
		for (const synth of topic.synths) {
			for (const text of synth.paraphrases) {
				flat.push({
					id: `s${String(flat.length + 1).padStart(3, '0')}`,
					text,
					groundTruthTopic: topic.name,
					groundTruthSynth: `${topic.name}/${synth.name}`,
				});
			}
		}
	}
	if (flat.length !== 100) throw new Error(`expected 100 statements, got ${flat.length}`);

	return flat;
}

/** Same PRNG as scripts/runAccuracyBenchmark.ts so arrival orders match the pipeline runs. */
function mulberry32(seed) {
	let a = seed >>> 0;

	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function arrivalOrder(seed) {
	const flat = flattenCorpus();
	const rand = mulberry32(seed);
	for (let i = flat.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1));
		[flat[i], flat[j]] = [flat[j], flat[i]];
	}

	return flat.map((row, arrivalIndex) => ({ ...row, arrivalIndex }));
}

// ---------------------------------------------------------------- OpenAI
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(res) {
	const ms = res.headers.get('retry-after-ms');
	if (ms && Number.isFinite(Number(ms))) return Number(ms);
	const s = res.headers.get('retry-after');
	if (s && Number.isFinite(Number(s))) return Number(s) * 1000;

	return null;
}

function modelParams(model, maxCompletion) {
	if (model.startsWith('gpt-5')) return { max_completion_tokens: maxCompletion };

	return { max_tokens: maxCompletion, temperature: 0 };
}

/**
 * One chat completion. Returns {content, usage, finishReason, attempts, model}.
 * Throws {modelRejected:true} when the model name itself is refused so the caller
 * can fall back and label the run honestly.
 */
async function chat(model, messages, maxCompletion, stats) {
	let lastError = null;
	for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
		stats.calls++;
		let res;
		try {
			res = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: { 'content-type': 'application/json', authorization: `Bearer ${API_KEY}` },
				body: JSON.stringify({
					model,
					messages,
					response_format: { type: 'json_object' },
					...modelParams(model, maxCompletion),
				}),
			});
		} catch (error) {
			lastError = error;
			await sleep(1000 * 2 ** attempt);
			continue;
		}
		if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
			const body = await res.text().catch(() => '');
			lastError = new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
			const wait = retryAfterMs(res) ?? 1000 * 2 ** attempt;
			stats.retries++;
			await sleep(Math.min(wait, 60_000));
			continue;
		}
		const json = await res.json();
		if (!res.ok) {
			const msg = json?.error?.message ?? JSON.stringify(json).slice(0, 300);
			const err = new Error(`HTTP ${res.status}: ${msg}`);
			if (/model|does not exist|not found|invalid_request/i.test(msg) && /model/i.test(msg)) err.modelRejected = true;
			if (/temperature/i.test(msg)) err.temperatureRejected = true;
			throw err;
		}
		const choice = json.choices?.[0];
		const usage = json.usage ?? {};
		stats.promptTokens += usage.prompt_tokens ?? 0;
		stats.completionTokens += usage.completion_tokens ?? 0;
		stats.reasoningTokens += usage.completion_tokens_details?.reasoning_tokens ?? 0;

		return {
			content: choice?.message?.content ?? '',
			finishReason: choice?.finish_reason ?? null,
			usage,
			attempts: attempt,
			model: json.model ?? model,
		};
	}
	throw lastError ?? new Error('exhausted retries');
}

function parseJson(text) {
	if (typeof text !== 'string') return null;
	let t = text.trim();
	const fence = t.match(/^```(?:json)?\s*([\s\S]*?)```$/);
	if (fence) t = fence[1].trim();
	try {
		return JSON.parse(t);
	} catch {
		const start = t.indexOf('{');
		const end = t.lastIndexOf('}');
		if (start >= 0 && end > start) {
			try {
				return JSON.parse(t.slice(start, end + 1));
			} catch {
				return null;
			}
		}

		return null;
	}
}

function newStats() {
	return { calls: 0, retries: 0, promptTokens: 0, completionTokens: 0, reasoningTokens: 0 };
}

function cost(model, stats) {
	const [pin, pout] = PRICE[model] ?? [0, 0];

	return (stats.promptTokens * pin + stats.completionTokens * pout) / 1e6;
}

// ---------------------------------------------------------------- prompts
const RULES = [
	'A SYNTHESIS groups statements that propose essentially the SAME specific action in different words.',
	'A synthesis has at least 2 members. Statements on the same topic but proposing a DIFFERENT action must NOT be merged.',
	'Leave a statement alone (in no synthesis) if it has no paraphrase in the list.',
	'Every statement id may appear in at most ONE synthesis.',
].join('\n');

function l1Prompt(order) {
	const list = order.map((r) => `${r.id}: ${r.text}`).join('\n');

	return [
		{
			role: 'system',
			content:
				'You cluster citizen suggestions for a deliberation platform. Output strictly valid JSON, nothing else.',
		},
		{
			role: 'user',
			content: `Question asked to residents: "${QUESTION}"

Below are ${order.length} suggestions, each prefixed with its id.

Task 1 — SYNTHESES.
${RULES}

Task 2 — TOPICS.
Group the syntheses (and the statements you left alone) into broad topics. Each synthesis belongs to exactly one topic (refer to it by its 0-based index in your "syntheses" array). Each loose statement belongs to exactly one topic.

Output JSON of this exact shape:
{"syntheses":[{"title":"short title","memberIds":["s0xx","s0yy"]}],
 "topics":[{"title":"short topic title","synthesisIndices":[0,3],"looseStatementIds":["s0zz"]}]}

Suggestions:
${list}`,
		},
	];
}

function l2StepPrompt(syntheses, row) {
	const list =
		syntheses.length === 0
			? '(none yet)'
			: syntheses
					.map((s, i) => `[${i}]\n` + s.members.map((m) => `  - ${m.text}`).join('\n'))
					.join('\n');

	return [
		{
			role: 'system',
			content:
				'You file citizen suggestions into syntheses for a deliberation platform. Output strictly valid JSON, nothing else.',
		},
		{
			role: 'user',
			content: `Question asked to residents: "${QUESTION}"

Current syntheses (index, then every member statement verbatim):
${list}

New statement:
"${row.text}"

Rule: JOIN a synthesis only if the new statement proposes essentially the SAME specific action as that synthesis's members. Same topic but a different action = NEW. When in doubt, NEW.

Output JSON of this exact shape:
{"action":"join"|"new","synthesisIndex":<integer or null>,"confidence":<0..1>,"reason":"one sentence"}`,
		},
	];
}

function l2TopicPrompt(syntheses) {
	const list = syntheses
		.map((s, i) => `[${i}]\n` + s.members.map((m) => `  - ${m.text}`).join('\n'))
		.join('\n');

	return [
		{
			role: 'system',
			content:
				'You organise citizen suggestions into topics for a deliberation platform. Output strictly valid JSON, nothing else.',
		},
		{
			role: 'user',
			content: `Question asked to residents: "${QUESTION}"

Below are ${syntheses.length} syntheses (index, then their member statements). Group them into broad topics. Every synthesis index must appear in exactly one topic.

Output JSON of this exact shape:
{"topics":[{"title":"short topic title","synthesisIndices":[0,3,7]}]}

Syntheses:
${list}`,
		},
	];
}

// ---------------------------------------------------------------- L1
function validateL1(parsed, order) {
	const known = new Set(order.map((r) => r.id));
	const counts = {
		invented: 0,
		duplicatedAcrossSyntheses: 0,
		missing: 0,
		singletonSyntheses: 0,
		badSynthesisIndex: 0,
		synthesisInMultipleTopics: 0,
		looseAlsoInSynthesis: 0,
		unfiledSyntheses: 0,
		invalidOutput: 0,
	};
	if (!parsed || typeof parsed !== 'object') {
		counts.invalidOutput = 1;

		return { synths: [], topics: [], counts, orphanIds: [...known] };
	}
	const rawSynths = Array.isArray(parsed.syntheses) ? parsed.syntheses : [];
	const rawTopics = Array.isArray(parsed.topics) ? parsed.topics : [];

	const claimed = new Set();
	/** index in rawSynths -> synth item (or null when dropped) */
	const synthByRawIndex = [];
	const synths = [];
	for (const raw of rawSynths) {
		const members = [];
		for (const id of Array.isArray(raw?.memberIds) ? raw.memberIds : []) {
			const sid = String(id).trim();
			if (!known.has(sid)) {
				counts.invented++;
				continue;
			}
			if (claimed.has(sid)) {
				counts.duplicatedAcrossSyntheses++;
				continue;
			}
			claimed.add(sid);
			members.push(sid);
		}
		if (members.length < 2) {
			counts.singletonSyntheses++;
			for (const sid of members) claimed.delete(sid); // released back to loose
			synthByRawIndex.push({ dropped: true, members });
			continue;
		}
		const item = { id: `syn${String(synths.length + 1).padStart(3, '0')}`, title: String(raw?.title ?? ''), members: members.map((id) => ({ id })) };
		synths.push(item);
		synthByRawIndex.push({ dropped: false, item });
	}

	const filedSynth = new Set();
	const filedLoose = new Set();
	const topics = [];
	for (const raw of rawTopics) {
		const memberSynthIds = [];
		const members = [];
		for (const idx of Array.isArray(raw?.synthesisIndices) ? raw.synthesisIndices : []) {
			const entry = synthByRawIndex[Number(idx)];
			if (!Number.isInteger(Number(idx)) || !entry) {
				counts.badSynthesisIndex++;
				continue;
			}
			if (entry.dropped) {
				// its released member(s) become loose members of this topic
				for (const sid of entry.members) if (!filedLoose.has(sid)) {
					filedLoose.add(sid);
					members.push({ id: sid });
				}
				continue;
			}
			if (filedSynth.has(entry.item.id)) {
				counts.synthesisInMultipleTopics++;
				continue;
			}
			filedSynth.add(entry.item.id);
			memberSynthIds.push(entry.item.id);
		}
		for (const id of Array.isArray(raw?.looseStatementIds) ? raw.looseStatementIds : []) {
			const sid = String(id).trim();
			if (!known.has(sid)) {
				counts.invented++;
				continue;
			}
			if (claimed.has(sid)) {
				counts.looseAlsoInSynthesis++;
				continue;
			}
			if (filedLoose.has(sid)) continue;
			filedLoose.add(sid);
			members.push({ id: sid });
		}
		if (members.length === 0 && memberSynthIds.length === 0) continue;
		topics.push({ id: `top${String(topics.length + 1).padStart(3, '0')}`, title: String(raw?.title ?? ''), members, memberSynthIds });
	}
	counts.unfiledSyntheses = synths.filter((s) => !filedSynth.has(s.id)).length;
	const orphanIds = [...known].filter((id) => !claimed.has(id) && !filedLoose.has(id));
	counts.missing = orphanIds.length;

	return { synths, topics, counts, orphanIds };
}

async function runL1(model, seed, outDir) {
	const order = arrivalOrder(seed);
	const stats = newStats();
	const t0 = Date.now();
	let usedModel = model;
	let fallbackNote = null;
	let reply;
	try {
		reply = await chat(model, l1Prompt(order), L1_MAX_COMPLETION, stats);
	} catch (error) {
		if (error.modelRejected && FALLBACK[model]) {
			fallbackNote = `model "${model}" rejected by API (${error.message}); fell back to ${FALLBACK[model]}`;
			console.error(`! ${fallbackNote}`);
			usedModel = FALLBACK[model];
			reply = await chat(usedModel, l1Prompt(order), L1_MAX_COMPLETION, stats);
		} else throw error;
	}
	const parsed = parseJson(reply.content);
	const { synths, topics, counts, orphanIds } = validateL1(parsed, order);
	const wallSeconds = (Date.now() - t0) / 1000;

	writeRun(outDir, {
		condition: 'L1',
		model: usedModel,
		requestedModel: model,
		fallbackNote,
		seed,
		order,
		synths,
		topics,
		stats,
		wallSeconds,
		counts,
		extra: { finishReason: reply.finishReason, truncated: reply.finishReason === 'length', orphanIds, apiModel: reply.model },
		raw: { request: 'L1 one-shot', finishReason: reply.finishReason, usage: reply.usage, content: reply.content, parsed },
	});
}

// ---------------------------------------------------------------- L2
async function runL2(model, seed, outDir) {
	const order = arrivalOrder(seed);
	const stats = newStats();
	const t0 = Date.now();
	let usedModel = model;
	let fallbackNote = null;
	const syntheses = []; // {members:[{id,text}]}
	const decisions = [];
	const counts = { joins: 0, news: 0, invalidOutput: 0, lowConfidenceJoinRefused: 0, badSynthesisIndex: 0, truncatedSteps: 0 };
	const promptTokensPerStep = [];

	for (const row of order) {
		let reply;
		try {
			reply = await chat(usedModel, l2StepPrompt(syntheses, row), L2_STEP_MAX_COMPLETION, stats);
		} catch (error) {
			if (error.modelRejected && FALLBACK[usedModel] && !fallbackNote) {
				fallbackNote = `model "${model}" rejected by API (${error.message}); fell back to ${FALLBACK[model]}`;
				console.error(`! ${fallbackNote}`);
				usedModel = FALLBACK[model];
				reply = await chat(usedModel, l2StepPrompt(syntheses, row), L2_STEP_MAX_COMPLETION, stats);
			} else throw error;
		}
		promptTokensPerStep.push(reply.usage?.prompt_tokens ?? 0);
		if (reply.finishReason === 'length') counts.truncatedSteps++;
		const parsed = parseJson(reply.content);
		let placed = null;
		let verdict = 'new';
		if (!parsed || typeof parsed !== 'object' || !['join', 'new'].includes(parsed.action)) {
			counts.invalidOutput++;
			verdict = 'invalid→new';
		} else if (parsed.action === 'join') {
			const idx = Number(parsed.synthesisIndex);
			const conf = Number(parsed.confidence);
			if (!Number.isInteger(idx) || idx < 0 || idx >= syntheses.length) {
				counts.badSynthesisIndex++;
				verdict = 'badIndex→new';
			} else if (!(conf >= JOIN_CONFIDENCE)) {
				counts.lowConfidenceJoinRefused++;
				verdict = 'lowConf→new';
			} else {
				placed = idx;
				verdict = 'join';
			}
		}
		if (placed === null) {
			syntheses.push({ members: [{ id: row.id, text: row.text }] });
			counts.news++;
		} else {
			syntheses[placed].members.push({ id: row.id, text: row.text });
			counts.joins++;
		}
		decisions.push({
			arrivalIndex: row.arrivalIndex,
			id: row.id,
			groundTruthSynth: row.groundTruthSynth,
			verdict,
			synthesisIndex: placed,
			model: parsed && typeof parsed === 'object' ? { action: parsed.action, synthesisIndex: parsed.synthesisIndex, confidence: parsed.confidence, reason: parsed.reason } : null,
			finishReason: reply.finishReason,
			usage: reply.usage,
			rawContent: parsed ? undefined : reply.content,
		});
		if ((row.arrivalIndex + 1) % 20 === 0) console.info(`  ${outDir.split('/').pop()}: ${row.arrivalIndex + 1}/100 (${syntheses.length} syntheses)`);
	}

	// topic pass
	const topicReply = await chat(usedModel, l2TopicPrompt(syntheses), L2_TOPIC_MAX_COMPLETION, stats);
	const topicParsed = parseJson(topicReply.content);
	const topicCounts = { invalidOutput: 0, badSynthesisIndex: 0, synthesisInMultipleTopics: 0, unfiledSyntheses: 0, truncated: topicReply.finishReason === 'length' };

	// convert: >=2-member syntheses -> synth items; singletons -> loose topic members
	const synthItemByIndex = new Map();
	const synths = [];
	syntheses.forEach((s, i) => {
		if (s.members.length >= 2) {
			const item = { id: `syn${String(synths.length + 1).padStart(3, '0')}`, title: s.members[0].text, members: s.members.map((m) => ({ id: m.id })) };
			synths.push(item);
			synthItemByIndex.set(i, item);
		}
	});
	const topics = [];
	const filed = new Set();
	const rawTopics = topicParsed && Array.isArray(topicParsed.topics) ? topicParsed.topics : null;
	if (!rawTopics) topicCounts.invalidOutput = 1;
	for (const raw of rawTopics ?? []) {
		const members = [];
		const memberSynthIds = [];
		for (const idxRaw of Array.isArray(raw?.synthesisIndices) ? raw.synthesisIndices : []) {
			const idx = Number(idxRaw);
			if (!Number.isInteger(idx) || idx < 0 || idx >= syntheses.length) {
				topicCounts.badSynthesisIndex++;
				continue;
			}
			if (filed.has(idx)) {
				topicCounts.synthesisInMultipleTopics++;
				continue;
			}
			filed.add(idx);
			const item = synthItemByIndex.get(idx);
			if (item) memberSynthIds.push(item.id);
			else members.push({ id: syntheses[idx].members[0].id });
		}
		if (members.length === 0 && memberSynthIds.length === 0) continue;
		topics.push({ id: `top${String(topics.length + 1).padStart(3, '0')}`, title: String(raw?.title ?? ''), members, memberSynthIds });
	}
	topicCounts.unfiledSyntheses = syntheses.length - filed.size;
	const wallSeconds = (Date.now() - t0) / 1000;
	const meanPrompt = promptTokensPerStep.reduce((a, b) => a + b, 0) / promptTokensPerStep.length;

	writeRun(outDir, {
		condition: 'L2',
		model: usedModel,
		requestedModel: model,
		fallbackNote,
		seed,
		order,
		synths,
		topics,
		stats,
		wallSeconds,
		counts: { ...counts, topicPass: topicCounts },
		extra: {
			synthesesIncludingSingletons: syntheses.length,
			multiMemberSyntheses: synths.length,
			meanPromptTokensPerStep: Math.round(meanPrompt),
			maxPromptTokensPerStep: Math.max(...promptTokensPerStep),
			apiModel: topicReply.model,
		},
		raw: { decisions, topicPass: { finishReason: topicReply.finishReason, usage: topicReply.usage, content: topicReply.content, parsed: topicParsed } },
	});
}

// ---------------------------------------------------------------- output
function writeRun(outDir, r) {
	mkdirSync(outDir, { recursive: true });
	const runName = outDir.split('/').pop();
	writeFileSync(
		join(outDir, 'statements.json'),
		JSON.stringify(
			{
				test: `llm-only-${runName}`,
				language: 'en',
				question: QUESTION,
				questionId: corpus.questionId,
				corpus: 'scripts/seedSynthBenchmark.accuracy100.en.json',
				corpusSha,
				seed: r.seed,
				statements: r.order,
			},
			null,
			2,
		),
	);
	writeFileSync(
		join(outDir, 'results.json'),
		JSON.stringify(
			{
				synths: { items: r.synths },
				topicClusters: { items: r.topics },
				parameters: { language: 'en', corpus: 'scripts/seedSynthBenchmark.accuracy100.en.json', corpusSha, seed: r.seed, condition: r.condition, model: r.model },
			},
			null,
			2,
		),
	);
	writeFileSync(join(outDir, 'raw.json'), JSON.stringify({ usage: r.stats, ...r.raw }, null, 2));
	const meta = {
		condition: r.condition,
		model: r.model,
		requestedModel: r.requestedModel,
		fallbackNote: r.fallbackNote,
		seed: r.seed,
		apiCalls: r.stats.calls,
		retries: r.stats.retries,
		promptTokens: r.stats.promptTokens,
		completionTokens: r.stats.completionTokens,
		reasoningTokens: r.stats.reasoningTokens,
		totalTokens: r.stats.promptTokens + r.stats.completionTokens,
		estimatedCostUsd: Number(cost(r.model, r.stats).toFixed(4)),
		wallClockSeconds: Number(r.wallSeconds.toFixed(1)),
		synthesesProduced: r.synths.length,
		topicsProduced: r.topics.length,
		invalid: r.counts,
		...r.extra,
		ranAt: new Date().toISOString(),
	};
	writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta, null, 2));

	// score: text mode writes scores.md; --json captured to scores.json
	const text = spawnSync('node', [SCORER, outDir], { encoding: 'utf-8' });
	if (text.status !== 0) console.error(text.stderr);
	const json = spawnSync('node', [SCORER, outDir, '--json'], { encoding: 'utf-8' });
	if (json.status === 0) writeFileSync(join(outDir, 'scores.json'), json.stdout);
	else console.error(json.stderr);
	const score = json.status === 0 ? JSON.parse(json.stdout) : null;
	console.info(
		`✓ ${runName}: composite=${score?.composite?.toFixed(3) ?? '?'} synthF1=${score?.synth?.f1?.toFixed(3) ?? '?'} topicF1=${score?.topic?.f1?.toFixed(3) ?? '?'} synths=${r.synths.length} topics=${r.topics.length} calls=${r.stats.calls} $${meta.estimatedCostUsd} ${meta.wallClockSeconds}s`,
	);
}

// ---------------------------------------------------------------- main
async function runOne(condition, model, seed) {
	const outDir = join(RUNS_DIR, `${condition}-${model}-seed${seed}`);
	if (!force && existsSync(join(outDir, 'scores.json'))) {
		console.info(`· skip ${outDir.split('/').pop()} (exists; --force to redo)`);

		return;
	}
	console.info(`▶ ${condition} ${model} seed ${seed}`);
	if (condition === 'L1') await runL1(model, seed, outDir);
	else if (condition === 'L2') await runL2(model, seed, outDir);
	else throw new Error(`unknown condition ${condition}`);
}

async function pool(tasks, size) {
	const queue = [...tasks];
	const failures = [];
	const workers = Array.from({ length: size }, async () => {
		while (queue.length) {
			const task = queue.shift();
			try {
				await task();
			} catch (error) {
				console.error('✗', error.message);
				failures.push(error);
			}
		}
	});
	await Promise.all(workers);
	if (failures.length) process.exitCode = 1;
}

if (runAll) {
	const tasks = [];
	if (!only || only === 'L1') {
		for (const model of [MODELS.worker, MODELS.taxonomy]) for (const seed of SEEDS) tasks.push(() => runOne('L1', model, seed));
	}
	if (!only || only === 'L2') {
		for (const seed of SEEDS) tasks.push(() => runOne('L2', MODELS.worker, seed));
	}
	await pool(tasks, POOL);
} else {
	const condition = flag('condition', 'L1');
	const model = flag('model', MODELS.worker);
	const seed = Number(flag('seed', '42'));
	await runOne(condition, model, seed);
}
