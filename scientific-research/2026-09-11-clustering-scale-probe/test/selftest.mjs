// Offline self-test with a mock transport. No key, no network.
//   node --test test/selftest.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { executeJudgeCalls } from '../lib/executor.mjs';
import { BudgetExceeded, Ledger } from '../lib/ledger.mjs';
import { buildManifest, buildPools } from '../lib/pools.mjs';
import { actualChatUsd, chatInputBound, worstCaseChatUsd } from '../lib/pricing.mjs';
import { buildJudgeBody, renderUserPrompt } from '../lib/prompt.mjs';
import { scoreDecision } from '../lib/score.mjs';
import { validateDecision } from '../lib/validate.mjs';
import { readJsonl, STUDY_DIR, appendJsonl } from '../lib/util.mjs';

const study = JSON.parse(readFileSync(join(STUDY_DIR, 'study.json'), 'utf8'));
const price = study.pricing.models['gpt-5.6-luna'];
const tmp = () => mkdtempSync(join(tmpdir(), 'probe-selftest-'));

// ---------------------------------------------------------------- validator

test('validator: valid, truncated, schema, inconsistent, out-of-set', () => {
	const ids = new Set(['pa', 'pb']);
	const v = (content, finishReason = 'stop') => validateDecision({ content, finishReason }, ids);
	assert.deepEqual(v('{"decision":"same","target_id":"pa","reason":"x"}').valid, true);
	assert.equal(v('{"decision":"none","target_id":null,"reason":"x"}').decision, 'none');
	assert.equal(v('{"decision":"same","target_id":"pa","reason":"x"}', 'length').failure, 'truncated');
	assert.equal(v('not json').failure, 'unparseable');
	assert.equal(v('').failure, 'empty');
	assert.equal(v('{"decision":"maybe","target_id":null,"reason":"x"}').failure, 'schema');
	assert.equal(v('{"decision":"none","target_id":null,"reason":"x","confidence":1}').failure, 'schema');
	assert.equal(v('{"decision":"none","target_id":"pa","reason":"x"}').failure, 'inconsistent');
	assert.equal(v('{"decision":"same","target_id":null,"reason":"x"}').failure, 'inconsistent');
	assert.equal(v('{"decision":"same","target_id":"pz","reason":"x"}').failure, 'target-not-supplied');
	assert.equal(v('{"decision":"same","target_id":"[pa]","reason":"x"}').failure, 'target-not-supplied');
	assert.equal(validateDecision({ content: null, finishReason: 'stop', refusal: 'no' }, ids).failure, 'refusal');
});

// ---------------------------------------------------------------- pricing

test('pricing: cache writes surcharged, reasoning not double-counted, worst ≥ actual', () => {
	const usage = {
		prompt_tokens: 1599,
		completion_tokens: 75,
		prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 1596 },
		completion_tokens_details: { reasoning_tokens: 28 },
	};
	const c = actualChatUsd(usage, price);
	const expected = (3 * 0.2 + 1596 * 0.2 * 1.25 + 75 * 1.2) / 1e6;
	assert.ok(Math.abs(c.billedUsd - expected) < 1e-15);
	assert.ok(Math.abs(c.undiscountedUsd - (1599 * 0.2 + 75 * 1.2) / 1e6) < 1e-15);
	const cachedRead = actualChatUsd({ prompt_tokens: 1000, completion_tokens: 10, prompt_tokens_details: { cached_tokens: 800 } }, price);
	assert.ok(Math.abs(cachedRead.billedUsd - (200 * 0.2 + 800 * 0.02 + 10 * 1.2) / 1e6) < 1e-15);
	assert.equal(actualChatUsd({}, price), null);
	assert.ok(worstCaseChatUsd(1599, 4000, price) > c.billedUsd);
	const long = worstCaseChatUsd(300000, 100, price);
	assert.ok(Math.abs(long - (300000 * 0.4 * 1.25 + 100 * 1.8) / 1e6) < 1e-12);
});

// ---------------------------------------------------------------- ledger

test('ledger: stage and total caps, retain keeps reservation, persistence', () => {
	const dir = tmp();
	const path = join(dir, 'l.jsonl');
	const l = new Ledger(path, { capUsd: 1, stageCaps: { smoke: 0.3 } });
	const r1 = l.reserve({ callId: 'c1', attempt: 1, stage: 'smoke', amountUsd: 0.2 });
	assert.throws(() => l.reserve({ callId: 'c2', attempt: 1, stage: 'smoke', amountUsd: 0.2 }), BudgetExceeded);
	l.settle(r1, { billedUsd: 0.05, undiscountedUsd: 0.05, tokens: {} });
	const r2 = l.reserve({ callId: 'c2', attempt: 1, stage: 'smoke', amountUsd: 0.2 });
	l.retain(r2, 'timeout');
	assert.ok(Math.abs(l.spent() - 0.25) < 1e-12);
	assert.throws(() => l.reserve({ callId: 'c3', attempt: 1, stage: 'main', amountUsd: 0.8 }), BudgetExceeded);
	const again = new Ledger(path, { capUsd: 1, stageCaps: { smoke: 0.3 } });
	assert.ok(Math.abs(again.spent() - 0.25) < 1e-12);
	assert.equal(again.attemptsFor('c2'), 1);
});

// ---------------------------------------------------------------- executor fixtures

const bank = ['pa', 'pb', 'pc', 'pd', 'pe', 'pf'].map((id) => ({ id, text: `text of ${id}` }));
const textOf = (id) => bank.find((b) => b.id === id).text;
const spec = (callId, extra = {}) => ({ callId, queryId: 'q1', split: 'test', size: 6, orderIndex: 0, method: 'A', anchorId: 'pa', shownIds: bank.map((b) => b.id), queryText: 'new idea', ...extra });
const okBody = (content, extra = {}) => ({
	kind: 'response',
	status: 200,
	json: {
		model: 'gpt-5.6-luna',
		choices: [{ finish_reason: extra.finish ?? 'stop', message: { content } }],
		usage: { prompt_tokens: 300, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 290 }, completion_tokens_details: { reasoning_tokens: 12 } },
		...(extra.json ?? {}),
	},
	elapsedMs: 5,
});
const s1 = { ...study, judge: { ...study.judge, concurrency: 2 } };

// buildJudgeBody does not carry the call id; wrap the transport to recover it from the query text.
function byQuery(map) {
	const calls = [];

	return {
		calls,
		chat: async (body) => {
			const q = body.messages[1].content.match(/New proposal:\n"(.*)"/)[1];
			calls.push(q);
			const n = calls.filter((c) => c === q).length;
			await new Promise((r) => setTimeout(r, 1));

			return map[q](n);
		},
	};
}

test('executor: joins, misses, invalid ids, truncation, retry charging, timeouts', async () => {
	const dir = tmp();
	const ledger = new Ledger(join(dir, 'ledger.jsonl'), { capUsd: 5, stageCaps: {} });
	const specs = [
		spec('ok-join', { queryText: 'ok-join' }),
		spec('wrong-join', { queryText: 'wrong-join' }),
		spec('abstain', { queryText: 'abstain' }),
		spec('bad-id', { queryText: 'bad-id' }),
		spec('trunc', { queryText: 'trunc' }),
		spec('rate-then-ok', { queryText: 'rate-then-ok' }),
		spec('timeouts', { queryText: 'timeouts' }),
	];
	const t = byQuery({
		'ok-join': () => okBody('{"decision":"same","target_id":"pa","reason":"r"}'),
		'wrong-join': () => okBody('{"decision":"same","target_id":"pc","reason":"r"}'),
		abstain: () => okBody('{"decision":"none","target_id":null,"reason":"r"}'),
		'bad-id': () => okBody('{"decision":"same","target_id":"p404","reason":"r"}'),
		trunc: () => okBody('{"decision":"sa', { finish: 'length' }),
		'rate-then-ok': (n) => (n === 1 ? { kind: 'response', status: 429, json: { error: { message: 'slow down' } }, retryAfterMs: 1, elapsedMs: 1 } : okBody('{"decision":"same","target_id":"pb","reason":"r"}')),
		timeouts: () => ({ kind: 'timeout', error: 'aborted', elapsedMs: 9 }),
	});
	const res = await executeJudgeCalls({ specs, stage: 'main', study: s1, ledger, transport: t, outDir: dir, textOf, labelStatus: 'provisional' });
	assert.equal(res.missing.length, 0);
	const d = Object.fromEntries(readdirSync(join(dir, 'decisions')).map((f) => [f.replace('.json', ''), JSON.parse(readFileSync(join(dir, 'decisions', f), 'utf8'))]));
	const label = { matches: ['pa', 'pb'] };
	const cell = { ids: bank.map((b) => b.id), ranking: bank.map((b, i) => [b.id, 1 - i / 10]) };
	const sc = (id) => scoreDecision(d[id], label, cell).outcome;
	assert.equal(sc('ok-join'), 'correct');
	assert.equal(sc('wrong-join'), 'false-join');
	assert.equal(sc('abstain'), 'miss-abstain');
	assert.equal(sc('bad-id'), 'invalid-output');
	assert.equal(sc('trunc'), 'truncated');
	assert.equal(sc('rate-then-ok'), 'correct');
	assert.equal(sc('timeouts'), 'technical');
	assert.equal(d['rate-then-ok'].attempts, 2);
	assert.equal(d.timeouts.attempts, 2);
	// Every attempt is charged: two timeouts retain two full reservations.
	const events = readJsonl(join(dir, 'ledger.jsonl'));
	const timeoutRes = events.filter((e) => e.type === 'reserve' && e.callId === 'timeouts');
	assert.equal(timeoutRes.length, 2);
	assert.equal(events.filter((e) => e.type === 'retain' && timeoutRes.some((r) => r.resId === e.resId)).length, 2);
	assert.equal(events.filter((e) => e.type === 'reserve' && e.callId === 'rate-then-ok').length, 2);
	// No-match query: a join is a false join, none is correct.
	const neg = { matches: [] };
	assert.equal(scoreDecision(d['wrong-join'], neg, cell).outcome, 'false-join');
	assert.equal(scoreDecision(d.abstain, neg, cell).outcome, 'correct');
	// Retrieval miss for B: approved target not shown.
	const bRow = { ...d.abstain, method: 'B', shownIds: ['pc', 'pd'] };
	assert.equal(scoreDecision(bRow, label, cell).outcome, 'miss-no-retrieval');
	assert.equal(scoreDecision(bRow, label, cell).candidateRecall, false);
});

test('executor: budget exhaustion with 2 concurrent workers never overspends', async () => {
	const dir = tmp();
	const one = worstCaseChatUsd(chatInputBound(buildJudgeBody({ question: study.question, candidates: bank.map((b) => ({ id: b.id, text: b.text })), query: 'q0', judge: study.judge })), study.judge.maxCompletionTokens, price);
	const cap = one * 3.5; // room for 3 concurrent reservations, not 4
	const ledger = new Ledger(join(dir, 'ledger.jsonl'), { capUsd: cap, stageCaps: {} });
	const specs = Array.from({ length: 10 }, (_, i) => spec(`c${i}`, { queryText: `q${i}` }));
	const map = Object.fromEntries(specs.map((s) => [s.queryText, () => okBody('{"decision":"none","target_id":null,"reason":"r"}', { json: { usage: { prompt_tokens: 300, completion_tokens: 3900, prompt_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } } } })]));
	const t = byQuery(map);
	const res = await executeJudgeCalls({ specs, stage: 'main', study: s1, ledger, transport: t, outDir: dir, textOf, labelStatus: 'provisional' });
	assert.equal(res.stop?.reason, 'budget');
	assert.ok(ledger.committed() <= cap + 1e-12);
	assert.ok(res.missing.length > 0);
	assert.equal(res.missing.length + readdirSync(join(dir, 'decisions')).length, 10);
});

test('executor: resume never repeats a success; orphan reconciled from attempt log', async () => {
	const dir = tmp();
	const ledgerPath = join(dir, 'ledger.jsonl');
	const specs = [spec('a1', { queryText: 'a1' }), spec('a2', { queryText: 'a2' }), spec('a3', { queryText: 'a3' })];
	const answer = () => okBody('{"decision":"none","target_id":null,"reason":"r"}');
	const t1 = byQuery({ a1: answer, a2: answer, a3: answer });
	await executeJudgeCalls({ specs: specs.slice(0, 2), stage: 'main', study: s1, ledger: new Ledger(ledgerPath, { capUsd: 5, stageCaps: {} }), transport: t1, outDir: dir, textOf, labelStatus: 'provisional' });
	// Simulate a crash for a3: reservation + successful attempt persisted, no settle, no decision.
	const l = new Ledger(ledgerPath, { capUsd: 5, stageCaps: {} });
	const resId = l.reserve({ callId: 'a3', attempt: 1, stage: 'main', amountUsd: 0.01 });
	const ok = answer();
	appendJsonl(join(dir, 'attempts.jsonl'), { callId: 'a3', attempt: 1, resId, endpoint: 'chat/completions', requestedModel: 'gpt-5.6-luna', kind: 'response', status: 200, model: 'gpt-5.6-luna', finishReason: 'stop', content: ok.json.choices[0].message.content, usage: ok.json.usage, elapsedMs: 3 });
	const t2 = byQuery({ a1: answer, a2: answer, a3: answer });
	const ledger2 = new Ledger(ledgerPath, { capUsd: 5, stageCaps: {} });
	const res = await executeJudgeCalls({ specs, stage: 'main', study: s1, ledger: ledger2, transport: t2, outDir: dir, textOf, labelStatus: 'provisional' });
	assert.equal(t2.calls.length, 0, 'no request re-sent on resume');
	assert.equal(res.missing.length, 0);
	const events = readJsonl(ledgerPath);
	assert.ok(events.some((e) => e.type === 'settle' && e.resId === resId), 'orphan settled at actual usage');
	assert.equal(ledger2.reserved(), 0);
});

test('executor: returned model mismatch stops the run (no silent substitution)', async () => {
	const dir = tmp();
	const ledger = new Ledger(join(dir, 'ledger.jsonl'), { capUsd: 5, stageCaps: {} });
	const specs = Array.from({ length: 6 }, (_, i) => spec(`m${i}`, { queryText: `m${i}` }));
	const t = byQuery(Object.fromEntries(specs.map((s) => [s.queryText, () => okBody('{"decision":"none","target_id":null,"reason":"r"}', { json: { model: 'gpt-4o-mini' } })])));
	const res = await executeJudgeCalls({ specs, stage: 'main', study: { ...s1, judge: { ...s1.judge, concurrency: 1 } }, ledger, transport: t, outDir: dir, textOf, labelStatus: 'provisional' });
	assert.equal(res.stop?.reason, 'model-mismatch');
	assert.equal(t.calls.length, 1);
	const d = JSON.parse(readFileSync(join(dir, 'decisions', 'm0.json'), 'utf8'));
	assert.equal(d.failure, 'model-mismatch');
});

// ---------------------------------------------------------------- pools

test('pools: nested, core at every size, ambiguous excluded, B ⊂ A in A order, labels never in prompt', () => {
	const N = 700;
	const items = Array.from({ length: N }, (_, i) => ({ id: `x${String(i).padStart(3, '0')}`, text: `item ${i} ${'w'.repeat(i % 50)}`, chars: 10 + (i % 150) }));
	const vec = new Map(items.map((it, i) => [it.id, Float32Array.from([Math.cos(i), Math.sin(i), (i % 7) / 7])]));
	const mk = (q, split, status, matches, hard, amb) => ({ queryId: q, split, status, matches, hardDistractors: hard.map((id) => ({ id, why: 't' })), ambiguous: amb });
	const labels = [mk('x000', 'test', 'match', ['x001', 'x002'], ['x003', 'x004'], ['x005']), mk('x010', 'test', 'none', [], ['x011', 'x012'], ['x013']), mk('x020', 'dev', 'match', ['x021'], ['x022'], [])];
	const cfg = { ...study, sizes: [100, 200, 500] };
	const { bank, pools } = buildPools({ bankAll: items, labels, vectors: vec, study: cfg });
	assert.equal(bank.length, N - 3);
	for (const p of pools) {
		const s100 = new Set(p.sizes[100].ids);
		const s200 = new Set(p.sizes[200].ids);
		const s500 = new Set(p.sizes[500].ids);
		assert.equal(s100.size, 100);
		assert.equal(s500.size, 500);
		assert.ok([...s100].every((x) => s200.has(x)) && [...s200].every((x) => s500.has(x)), 'nested');
		for (const c of p.core) assert.ok(s100.has(c));
		for (const e of p.excluded) assert.ok(!s500.has(e));
		assert.ok(!s500.has(p.queryId));
		assert.equal(p.sizes[100].orders[0].order[p.sizes[100].orders[0].anchorPosition], p.anchorId);
		assert.equal(p.sizes[500].orders[1].anchorPosition, Math.round(0.5 * 499));
	}
	const queriesById = new Map(items.map((x) => [x.id, x]));
	const specs = buildManifest({ pools, queriesById, study: cfg, stage: 'main', sizes: [100, 200, 500], orderIndices: [0, 1], splits: ['test'] });
	assert.equal(specs.length, 2 * 3 * 2 * 2);
	for (const sp of specs.filter((x) => x.method === 'B')) {
		const a = specs.find((x) => x.method === 'A' && x.queryId === sp.queryId && x.size === sp.size && x.orderIndex === sp.orderIndex);
		assert.equal(sp.shownIds.length, 15);
		assert.deepEqual(sp.shownIds, a.shownIds.filter((id) => sp.shownIds.includes(id)));
	}
	const prompt = renderUserPrompt({ question: 'Q', candidates: specs[0].shownIds.slice(0, 3).map((id) => ({ id, text: queriesById.get(id).text })), query: 'new' });
	for (const word of ['match', 'distractor', 'ambiguous', 'status', 'anchor']) assert.ok(!prompt.toLowerCase().includes(word), `prompt leaks "${word}"`);
	// Deterministic.
	const again = buildPools({ bankAll: items, labels, vectors: vec, study: cfg });
	assert.deepEqual(again.pools[0].sizes[200].orders[1], pools[0].sizes[200].orders[1]);
});

// ---------------------------------------------------------------- key hygiene

test('offline commands and imports never read functions/.env; only transport.mjs touches process.env', () => {
	const preload = join(tmp(), 'guard.cjs');
	writeFileSync(
		preload,
		`const fs=require('fs');const m=require('module');const orig=fs.readFileSync;
fs.readFileSync=function(p,...a){if(String(p).endsWith('functions/.env'))throw new Error('KEY FILE READ: '+p);return orig.call(this,p,...a)};
m.syncBuiltinESMExports();`,
	);
	const env = { ...process.env };
	delete env.OPENAI_API_KEY;
	const run = (args) => execFileSync(process.execPath, ['-r', preload, ...args], { cwd: STUDY_DIR, env, encoding: 'utf8' });
	run(['probe.mjs', '--help']);
	run(['probe.mjs', 'status']);
	run(['--input-type=module', '-e', "for (const m of ['util','rng','corpus','retrieval','pricing','ledger','prompt','validate','executor','pools','score','transport']) await import('./lib/'+m+'.mjs')"]);
	const libs = readdirSync(join(STUDY_DIR, 'lib'));
	for (const f of libs) {
		const src = readFileSync(join(STUDY_DIR, 'lib', f), 'utf8');
		if (f !== 'transport.mjs') assert.ok(!src.includes('process.env'), `${f} reads process.env`);
	}
	assert.ok(!readFileSync(join(STUDY_DIR, 'probe.mjs'), 'utf8').includes('process.env'));
});
