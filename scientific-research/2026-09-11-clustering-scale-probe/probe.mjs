#!/usr/bin/env node
// Clustering-scale probe CLI. Only `smoke` and `run` can reach a model API
// (they dynamic-import lib/transport.mjs, the one module that reads a key).
// `--help`, `prepare`, `dry-run`, `status` and importing any lib/ module are
// offline and read no key.
//
//   node probe.mjs prepare --step=bank|screen|pools|freeze [--limit=N]
//   node probe.mjs dry-run
//   node probe.mjs smoke
//   node probe.mjs run --stage=embed
//   node probe.mjs run [--resume] [--allow-provisional]
//   node probe.mjs status
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildBankAll, parseCsv } from './lib/corpus.mjs';
import { executeEmbeddings, executeJudgeCalls } from './lib/executor.mjs';
import { acquireLock, Ledger } from './lib/ledger.mjs';
import { buildManifest, buildPools } from './lib/pools.mjs';
import { chatInputBound, worstCaseChatUsd } from './lib/pricing.mjs';
import { buildJudgeBody, PROMPT_VERSION, templateText } from './lib/prompt.mjs';
import { buildBm25, loadVectors, rankByCosine, saveVectors } from './lib/retrieval.mjs';
import { seededShuffle } from './lib/rng.mjs';
import { parseArgs, readJson, readJsonl, sha256, sha256File, STUDY_DIR, sum, writeFileAtomic, writeJson, writeJsonl } from './lib/util.mjs';

const REPO = join(STUDY_DIR, '..', '..');
const P = (...parts) => join(STUDY_DIR, ...parts);
const PATHS = {
	study: P('study.json'),
	bankAll: P('data', 'bank-all.jsonl'),
	bankMeta: P('data', 'bank-all.meta.json'),
	vecSmall: P('.cache', 'emb-3small'),
	vecLarge: P('.cache', 'emb-3large'),
	shortlists: P('annotation', 'shortlists.jsonl'),
	shortlistsMd: P('annotation', 'shortlists.md'),
	provisional: P('annotation', 'labels.provisional.jsonl'),
	frozen: P('frozen'),
	ledger: P('budget-ledger.jsonl'),
	lock: P('.probe.lock'),
	prereg: P('PREREGISTRATION.md'),
};

const HELP = `Usage: node probe.mjs <command> [options]
  prepare --step=bank      parse Pol.is CSV → data/bank-all.jsonl (offline)
  prepare --step=screen    seeded query candidates + annotation shortlists (offline; needs vectors)
  prepare --step=pools     nested pools, orders, manifests → frozen/ (offline; needs labels)
  prepare --step=freeze    SHA-256 of frozen inputs, prompt, study.json, PREREGISTRATION.md
  dry-run                  worst-case pricing of every request → dry-run.json (offline)
  run --stage=embed        PAID: embed the bank (3-small for B, 3-large for screening only)
  smoke                    PAID: 8 dev judgements (4 dev queries × n=100 × A/B), not scored
  run [--resume] [--allow-provisional]
                           PAID: the 240-call main manifest (refuses provisional labels unless allowed)
  status                   budget ledger summary (offline)`;

const study = () => readJson(PATHS.study);
const embedText = (s, text) => `Question: ${s.question}\nAnswer: ${text}`;

function ledgerFor(s) {
	return new Ledger(PATHS.ledger, { capUsd: s.budget.capUsd, stageCaps: s.budget.stageCapsUsd });
}

async function transport() {
	const { createOpenAITransport } = await import('./lib/transport.mjs');

	return createOpenAITransport({ repoRoot: REPO });
}

// ---------------------------------------------------------------- prepare

function prepareBank() {
	const s = study();
	for (const [rel, hash] of Object.entries(s.source.files)) {
		const got = sha256File(P(rel));
		if (got !== hash) throw new Error(`${rel}: sha256 ${got} ≠ recorded ${hash}`);
	}
	const rows = parseCsv(readFileSync(P('data', 'source', 'bowling-green', 'comments.csv'), 'utf8'));
	const { items, excluded, sourceRows } = buildBankAll(rows, { idSeed: s.seeds.ids });
	writeJsonl(PATHS.bankAll, items);
	const chars = items.map((x) => x.chars).sort((a, b) => a - b);
	writeJson(PATHS.bankMeta, {
		sourceRows,
		eligible: items.length,
		excluded,
		chars: { min: chars[0], median: chars[chars.length >> 1], max: chars.at(-1), total: sum(chars) },
		bankAllSha256: sha256File(PATHS.bankAll),
	});
	console.info(`bank-all: ${items.length} eligible of ${sourceRows} rows`, excluded);
}

function loadBankAll() {
	return readJsonl(PATHS.bankAll);
}

function prepareScreen(args) {
	const s = study();
	const bankAll = loadBankAll();
	const small = loadVectors(PATHS.vecSmall);
	const large = loadVectors(PATHS.vecLarge);
	if (!small || !large) throw new Error('vectors missing — run `node probe.mjs run --stage=embed` first');
	const limit = Number(args.limit ?? 60);
	const order = seededShuffle(bankAll.map((x) => x.id).sort(), s.seeds.querySelection);
	const byId = new Map(bankAll.map((x) => [x.id, x]));
	const bm25 = buildBm25(bankAll);
	const rows = [];
	const md = [`# Annotation shortlists (screening aid, seeded candidate order ${s.seeds.querySelection})`, ''];
	for (let rank = 0; rank < Math.min(limit, order.length); rank++) {
		const qid = order[rank];
		const others = bankAll.filter((x) => x.id !== qid).map((x) => x.id);
		const rs = rankByCosine(small.map.get(qid), others, small.map);
		const rl = rankByCosine(large.map.get(qid), others, large.map);
		const rb = bm25(byId.get(qid).text).filter((r) => r.id !== qid);
		const rankOf = (list) => new Map(list.map((r, i) => [r.id, { rank: i + 1, score: r.score }]));
		const [ms, ml, mb] = [rankOf(rs), rankOf(rl), rankOf(rb)];
		const pick = new Set([
			...rs.slice(0, s.screening.topSmall).map((r) => r.id),
			...rl.slice(0, s.screening.topLarge).map((r) => r.id),
			...rb.slice(0, s.screening.topBm25).filter((r) => r.score > 0).map((r) => r.id),
		]);
		const shortlist = [...pick]
			.map((id) => ({
				id,
				text: byId.get(id).text,
				cosSmall: Number(ms.get(id).score.toFixed(4)),
				rankSmall: ms.get(id).rank,
				cosLarge: Number(ml.get(id).score.toFixed(4)),
				rankLarge: ml.get(id).rank,
				bm25: Number(mb.get(id).score.toFixed(3)),
				rankBm25: mb.get(id).rank,
			}))
			.sort((a, b) => b.cosLarge - a.cosLarge || (a.id < b.id ? -1 : 1));
		rows.push({ candidateRank: rank + 1, candidateId: qid, text: byId.get(qid).text, shortlist });
		md.push(`## #${rank + 1} ${qid}: ${byId.get(qid).text}`, '');
		for (const x of shortlist) md.push(`- ${x.id} (L${x.rankLarge} S${x.rankSmall} B${x.rankBm25}) ${x.text}`);
		md.push('');
	}
	writeJsonl(PATHS.shortlists, rows);
	writeFileAtomic(PATHS.shortlistsMd, md.join('\n'));
	console.info(`shortlists for ${rows.length} seeded candidates; mean size ${(sum(rows.map((r) => r.shortlist.length)) / rows.length).toFixed(1)}`);
}

function labelsPath(args) {
	return args.labels ? P(args.labels) : PATHS.provisional;
}

function preparePools(args) {
	const s = study();
	const bankAll = loadBankAll();
	const small = loadVectors(PATHS.vecSmall);
	const labels = readJsonl(labelsPath(args));
	const need = s.queries;
	const count = (split, status) => labels.filter((l) => l.split === split && l.status === status).length;
	for (const split of ['test', 'dev'])
		for (const status of ['match', 'none'])
			if (count(split, status) !== need[split][status]) throw new Error(`labels: ${split}/${status} = ${count(split, status)}, need ${need[split][status]}`);
	const { bank, pools } = buildPools({ bankAll, labels, vectors: small.map, study: s });
	const queriesById = new Map(bankAll.filter((x) => labels.some((l) => l.queryId === x.id)).map((x) => [x.id, x]));
	const queries = labels.map((l) => ({ id: l.queryId, split: l.split, text: queriesById.get(l.queryId).text, sourceCommentId: queriesById.get(l.queryId).sourceCommentId }));
	const main = buildManifest({ pools, queriesById, study: s, stage: 'main', sizes: s.sizes, orderIndices: [0, 1], splits: ['test'] });
	const smoke = buildManifest({ pools, queriesById, study: s, stage: 'smoke', sizes: [Math.min(...s.sizes)], orderIndices: [0], splits: ['dev'] });
	const schedule = seededShuffle(main.map((x) => x.callId).sort(), s.seeds.scheduling);
	const pos = new Map(schedule.map((id, i) => [id, i]));
	main.sort((a, b) => pos.get(a.callId) - pos.get(b.callId));
	writeJsonl(join(PATHS.frozen, 'bank.jsonl'), bank);
	writeJsonl(join(PATHS.frozen, 'queries.jsonl'), queries);
	writeJsonl(join(PATHS.frozen, 'labels.jsonl'), labels);
	writeJson(join(PATHS.frozen, 'pools.json'), pools);
	writeJsonl(join(PATHS.frozen, 'manifest.jsonl'), main);
	writeJsonl(join(PATHS.frozen, 'manifest.smoke.jsonl'), smoke);
	writeFileAtomic(join(PATHS.frozen, 'prompts', `${PROMPT_VERSION}.txt`), templateText());
	console.info(`bank ${bank.length}; pools ${pools.length}; main ${main.length} specs; smoke ${smoke.length} specs`);
}

const FROZEN_FILES = ['frozen/bank.jsonl', 'frozen/queries.jsonl', 'frozen/labels.jsonl', 'frozen/pools.json', 'frozen/manifest.jsonl', 'frozen/manifest.smoke.jsonl', `frozen/prompts/${PROMPT_VERSION}.txt`, 'study.json', 'PREREGISTRATION.md', 'lib/prompt.mjs'];

function prepareFreeze() {
	const lines = FROZEN_FILES.map((f) => `${sha256File(P(f))}  ${f}`);
	writeFileAtomic(join(PATHS.frozen, 'HASHES.sha256'), `${lines.join('\n')}\n`);
	console.info(lines.join('\n'));
}

function verifyFrozen() {
	const path = join(PATHS.frozen, 'HASHES.sha256');
	if (!existsSync(path)) throw new Error('frozen/HASHES.sha256 missing — run `prepare --step=freeze` first');
	for (const line of readFileSync(path, 'utf8').trim().split('\n')) {
		const [hash, file] = line.split(/\s+/);
		if (sha256File(P(file)) !== hash) throw new Error(`frozen input changed since freeze: ${file}`);
	}
}

// ---------------------------------------------------------------- dry-run

function loadManifests() {
	return {
		main: readJsonl(join(PATHS.frozen, 'manifest.jsonl')),
		smoke: readJsonl(join(PATHS.frozen, 'manifest.smoke.jsonl')),
	};
}

function textLookup() {
	const byId = new Map(loadBankAll().map((x) => [x.id, x.text]));

	return (id) => {
		const t = byId.get(id);
		if (t == null) throw new Error(`unknown id ${id}`);

		return t;
	};
}

function dryRun() {
	const s = study();
	const price = s.pricing.models[s.judge.model];
	if (!price || !s.pricing.retrievedAt) throw new Error('no verified price schedule — refusing to plan');
	const textOf = textLookup();
	const { main, smoke } = loadManifests();
	const ledger = ledgerFor(s);
	const out = { at: new Date().toISOString(), model: s.judge.model, maxCompletionTokens: s.judge.maxCompletionTokens, prices: s.pricing, stages: {}, cells: {}, violations: [] };
	for (const [stage, specs] of Object.entries({ smoke, main })) {
		let worst = 0;
		for (const spec of specs) {
			const body = buildJudgeBody({ question: s.question, candidates: spec.shownIds.map((id) => ({ id, text: textOf(id) })), query: spec.queryText, judge: s.judge });
			const bound = chatInputBound(body);
			const w = worstCaseChatUsd(bound, s.judge.maxCompletionTokens, price);
			worst += w;
			if (bound > price.contextWindow) out.violations.push({ callId: spec.callId, issue: 'context-window', bound });
			if (bound > price.longContextThreshold) out.violations.push({ callId: spec.callId, issue: 'long-context-tier', bound });
			const key = `${stage}|${spec.method}|${spec.size}`;
			out.cells[key] ??= { stage, method: spec.method, size: spec.size, calls: 0, inputBoundMean: 0, inputBoundMax: 0, shownMean: 0, worstUsd: 0 };
			const c = out.cells[key];
			c.inputBoundMean += bound;
			c.shownMean += spec.shownIds.length;
			c.inputBoundMax = Math.max(c.inputBoundMax, bound);
			c.worstUsd += w;
			c.calls++;
		}
		const maxAttempts = s.judge.maxAttempts;
		out.stages[stage] = {
			logicalCalls: specs.length,
			worstUsdOneAttempt: worst,
			worstUsdAllAttempts: worst * maxAttempts,
			stageCapUsd: s.budget.stageCapsUsd[stage],
			fitsOneAttempt: worst <= s.budget.stageCapsUsd[stage],
		};
	}
	for (const c of Object.values(out.cells)) {
		c.inputBoundMean = Math.round(c.inputBoundMean / c.calls);
		c.shownMean = Number((c.shownMean / c.calls).toFixed(1));
	}
	const smokeAttempts = readJsonl(P('runs', 'smoke', 'attempts.jsonl')).filter((a) => a.usage);
	if (smokeAttempts.length) {
		const bySpec = new Map(smoke.map((x) => [x.callId, x]));
		out.boundCheck = smokeAttempts.map((a) => {
			const spec = bySpec.get(a.callId);
			const body = buildJudgeBody({ question: s.question, candidates: spec.shownIds.map((id) => ({ id, text: textOf(id) })), query: spec.queryText, judge: s.judge });

			return { callId: a.callId, bound: chatInputBound(body), observedPrompt: a.usage.prompt_tokens, observedCompletion: a.usage.completion_tokens, reasoning: a.usage.completion_tokens_details?.reasoning_tokens ?? null, finishReason: a.finishReason };
		});
	}
	const bankSize = readJsonl(join(PATHS.frozen, 'bank.jsonl')).length;
	out.extension1000 = { feasible: bankSize >= 1000, bankSize, reason: bankSize >= 1000 ? null : `bank has ${bankSize} eligible items (< 1,000); no frozen 1,000-item bank exists, so the optional extension is not run` };
	out.ledger = ledger.summary();
	out.remainingUsd = s.budget.capUsd - ledger.committed();
	out.fitsRemaining = out.stages.main.worstUsdOneAttempt + out.stages.smoke.worstUsdOneAttempt <= out.remainingUsd;
	writeJson(P('dry-run.json'), out);
	console.info(JSON.stringify({ stages: out.stages, remainingUsd: out.remainingUsd, violations: out.violations.length, extension1000: out.extension1000.feasible }, null, 2));
	for (const c of Object.values(out.cells)) console.info(`${c.stage} ${c.method} n=${c.size}: shown ${c.shownMean}, bound mean ${c.inputBoundMean} max ${c.inputBoundMax}, worst $${c.worstUsd.toFixed(4)}`);
}

// ---------------------------------------------------------------- paid stages

async function runEmbed() {
	const s = study();
	const bankAll = loadBankAll();
	const release = acquireLock(PATHS.lock);
	try {
		const ledger = ledgerFor(s);
		const t = await transport();
		for (const [spec, base] of [
			[s.embedding, PATHS.vecSmall],
			[s.screeningEmbedding, PATHS.vecLarge],
		]) {
			const items = bankAll.map((x) => ({ id: x.id, text: embedText(s, x.text) }));
			const existing = loadVectors(base);
			if (existing && existing.meta.model === spec.model && items.every((x, i) => existing.meta.rows[i]?.textSha256 === sha256(x.text))) {
				console.info(`${spec.model}: vectors already present and matching — skipped`);
				continue;
			}
			const res = await executeEmbeddings({ items, model: spec.model, dimensions: spec.dimensions, stage: 'prep', study: s, ledger, transport: t, outDir: P('runs', 'prep') });
			saveVectors(base, {
				model: spec.model,
				dimensions: spec.dimensions,
				contract: s.embedding.contract,
				entries: items.map((x) => ({ id: x.id, vector: res.get(x.id).vector, textSha256: sha256(x.text), tokens: Number(res.get(x.id).tokensEstimate.toFixed(2)) })),
			});
			console.info(`${spec.model}: ${items.length} vectors saved`);
		}
		console.info(JSON.stringify(ledger.summary(), null, 2));
	} finally {
		release();
	}
}

function labelStatusOf(labels) {
	return labels.every((l) => String(l.labelSource ?? '').startsWith('human')) ? 'human-adjudicated' : 'provisional';
}

async function runJudge({ stage, args }) {
	const s = study();
	const { main, smoke } = loadManifests();
	const specs = stage === 'smoke' ? smoke : main;
	const labels = readJsonl(join(PATHS.frozen, 'labels.jsonl'));
	const labelStatus = labelStatusOf(labels);
	if (stage === 'main') {
		verifyFrozen();
		if (labelStatus !== 'human-adjudicated' && !args['allow-provisional'])
			throw new Error('labels are provisional; the protocol gates the main run on human labels. Pass --allow-provisional to run anyway (outputs are stamped PROVISIONAL).');
	}
	const outDir = P('runs', stage);
	const release = acquireLock(PATHS.lock);
	try {
		const ledger = ledgerFor(s);
		const t = await transport();
		const started = Date.now();
		const statusPath = join(outDir, 'status.json');
		const res = await executeJudgeCalls({
			specs,
			stage,
			study: s,
			ledger,
			transport: t,
			outDir,
			textOf: textLookup(),
			labelStatus,
			onProgress: (st, spec) => {
				writeJson(statusPath, { stage, done: st.done, skipped: st.skipped, of: specs.length, last: spec.callId, spentUsd: ledger.spent(), at: new Date().toISOString() });
				if (st.done % 10 === 0) console.info(`${stage}: ${st.done + st.skipped}/${specs.length}, spent $${ledger.spent().toFixed(4)}`);
			},
		});
		const summary = { ...res, labelStatus, elapsedSeconds: (Date.now() - started) / 1000, ledger: ledger.summary(), finishedAt: new Date().toISOString() };
		writeJson(join(outDir, 'run-summary.json'), summary);
		console.info(JSON.stringify({ ...summary, missing: summary.missing.length }, null, 2));
	} finally {
		release();
	}
}

function status() {
	const s = study();
	console.info(JSON.stringify(ledgerFor(s).summary(), null, 2));
}

// ---------------------------------------------------------------- main

const args = parseArgs(process.argv.slice(2));
const [cmd] = args._;
try {
	if (!cmd || args.help || cmd === 'help') console.info(HELP);
	else if (cmd === 'prepare') {
		const step = args.step;
		if (step === 'bank') prepareBank();
		else if (step === 'screen') prepareScreen(args);
		else if (step === 'pools') preparePools(args);
		else if (step === 'freeze') prepareFreeze();
		else throw new Error(`unknown --step=${step}`);
	} else if (cmd === 'dry-run') dryRun();
	else if (cmd === 'smoke') await runJudge({ stage: 'smoke', args });
	else if (cmd === 'run' && args.stage === 'embed') await runEmbed();
	else if (cmd === 'run') await runJudge({ stage: 'main', args });
	else if (cmd === 'status') status();
	else throw new Error(`unknown command ${cmd}\n${HELP}`);
} catch (e) {
	console.error(`probe: ${e.message}`);
	if (e.detail) console.error(JSON.stringify(e.detail).slice(0, 500));
	process.exitCode = 1;
}

