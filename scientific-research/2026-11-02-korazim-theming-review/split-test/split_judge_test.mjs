#!/usr/bin/env node
/**
 * Offline. arm=control calls the COMPILED production proposeThemeSplit; arm=candidate
 * sends the coherence-first prompt below to the same fast model. No Firestore access.
 * usage: node split_judge_test.mjs <rawDir> [repeats]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const LIB = resolve(REPO, 'functions/lib/functions/src');
const require = createRequire(import.meta.url);
for (const line of readFileSync(resolve(REPO, 'functions/.env'), 'utf8').split('\n')) {
	const t = line.trim();
	if (!t || t.startsWith('#')) continue;
	const i = t.indexOf('=');
	if (i === -1) continue;
	const k = t.slice(0, i).trim();
	let v = t.slice(i + 1).trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
	if (!(k in process.env)) process.env[k] = v;
}
const RAW = process.argv[2], REPEATS = Number(process.argv[3] ?? 3);
const { proposeThemeSplit } = require(join(LIB, 'services/integration-ai-service.js'));
const openaiChat = require(join(LIB, 'config/openai-chat.js'));
const { LLM_MODEL_FAST } = require(join(LIB, 'config/gemini.js'));
const usage = { prompt: 0, completion: 0, calls: 0 };
const client = openaiChat.getOpenAI();
const create = client.chat.completions.create.bind(client.chat.completions);
client.chat.completions.create = async (b, o) => {
	const r = await create(b, o);
	usage.calls++;
	usage.prompt += r.usage?.prompt_tokens ?? 0;
	usage.completion += r.usage?.completion_tokens ?? 0;

	return r;
};

function candidatePrompt(c) {
	const lang = /[֐-׿]/.test(c.members[0].title) ? 'Write every title and description in Hebrew.' : 'Write every title and description in the same language as the proposals.';
	const lines = c.members.map((m, i) => `${i + 1}. [${m.id}] ${m.title}`).join('\n');

	return `You are checking one topic heading of a community consultation.

QUESTION: "${c.question}"

TOPIC: "${c.theme.title}"${c.theme.description ? ` — ${c.theme.description}` : ''}

PROPOSALS UNDER THIS TOPIC (${c.members.length}):
${lines}

STEP 1. Decide whether these proposals belong to ONE area of concern: would a resident reading
the list recognise a shared area of life or domain, even though the proposals suggest different
actions, actors or tools? Judge by what the proposals are about, not by the heading.
Size is never a reason to divide: a topic may be large because many people care about it.
Different actions, actors or tools within one area are never a reason to divide.
Answer oneArea: true unless the list clearly mixes separate areas that have little in common
beyond answering the question.

STEP 2. Only if oneArea is false, divide the proposals into 2-6 sub-topics, one per separate area.
Each holds at least 2 proposals; place each proposal in exactly one. Never use a title that
restates the question or the current heading.

${lang}

Return JSON:
{ "oneArea": true or false, "reason": "≤ 12 words", "subTopics": [ { "title": "3-6 word heading", "description": "≤ 20 words", "memberIds": ["id"] } ] }
(subTopics is an empty list when oneArea is true.)`;
}

async function candidate(c) {
	if (c.members.length < 4) return { n: 0, sizes: [] };
	const raw = await openaiChat.callLLM({ model: LLM_MODEL_FAST, system: 'Return only JSON.', user: candidatePrompt(c), maxTokens: 2048, temperature: 0, jsonMode: true });
	const p = JSON.parse(openaiChat.extractJson(raw));
	if (p.oneArea === true) return { n: 0, sizes: [], reason: p.reason };
	const known = new Set(c.members.map((m) => m.id));
	const seen = new Set();
	const subs = (p.subTopics ?? []).map((s) => (s.memberIds ?? []).filter((i) => known.has(i) && !seen.has(i) && seen.add(i))).filter((x) => x.length);

	return { n: subs.length >= 2 ? subs.length : 0, sizes: subs.map((x) => x.length), reason: p.reason };
}
async function control(c) {
	const subs = await proposeThemeSplit({ theme: c.theme, members: c.members, questionContext: c.question, otherThemeTitles: [], placedTotal: c.placedTotal });

	return { n: subs.length, sizes: subs.map((s) => s.memberIds.length) };
}

const cases = JSON.parse(readFileSync(join(RAW, 'split-test/cases.json'), 'utf8'));
const jobs = [];
for (const c of cases) for (const arm of ['control', 'candidate']) for (let r = 1; r <= REPEATS; r++) jobs.push({ c, arm, r });
const out = [];
let next = 0, errors = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
	while (next < jobs.length) {
		const { c, arm, r } = jobs[next++];
		try {
			const v = await (arm === 'control' ? control(c) : candidate(c));
			out.push({ id: c.id, set: c.set, arm, r, ...v });
		} catch (e) {
			errors++;
			out.push({ id: c.id, set: c.set, arm, r, error: String(e.message ?? e).slice(0, 120) });
		}
	}
}));
const usd = (usage.prompt * 0.2 + usage.completion * 1.2) / 1e6;
writeFileSync(join(RAW, 'split-test/raw-results.json'), JSON.stringify({ out, usage, usd, model: LLM_MODEL_FAST }));
console.info('jobs', jobs.length, 'errors', errors, 'usd', usd.toFixed(3), 'model', LLM_MODEL_FAST);
process.exit(0);
