// Budgeted execution of judge and embedding calls. Policy:
// - reserve worst case before every attempt (ledger), ≤ maxAttempts per logical
//   call across resumes, every attempt charged;
// - persist the raw attempt (usage, content) BEFORE settling or deciding, so a
//   crash never causes a duplicate successful request on resume;
// - retry only transport failures (429/5xx/timeout/network); an invalid model
//   output is a failed decision, not a reason to ask again (keeps A and B equal);
// - a returned model id that differs from the requested one, or any other HTTP
//   error, is a technical fault that stops the whole run (no silent fallback).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { BudgetExceeded } from './ledger.mjs';
import { actualChatUsd, actualEmbeddingUsd, chatInputBound, embeddingInputBound, worstCaseChatUsd, worstCaseEmbeddingUsd } from './pricing.mjs';
import { buildJudgeBody } from './prompt.mjs';
import { validateDecision } from './validate.mjs';
import { appendJsonl, readJson, readJsonl, sleep, writeJson } from './util.mjs';

const isRetryable = (r) => r.kind !== 'response' || r.status === 429 || (r.status >= 500 && r.status < 600);

export class TechnicalFault extends Error {
	constructor(reason, detail) {
		super(`technical fault: ${reason}`);
		this.reason = reason;
		this.detail = detail;
	}
}

/** Settle orphan reservations from persisted attempt rows where possible. */
export function reconcileOrphans(ledger, attemptRows, priceFor) {
	const byRes = new Map(attemptRows.map((a) => [a.resId, a]));

	return ledger.resolveOrphans((res) => {
		const a = byRes.get(res.resId);
		if (!a?.usage) return null;

		return a.endpoint === 'embeddings' ? actualEmbeddingUsd(a.usage, priceFor(a.requestedModel)) : actualChatUsd(a.usage, priceFor(a.requestedModel));
	});
}

// ---------------------------------------------------------------- judge

/**
 * specs: [{callId, queryText, shownIds, ...cell metadata}]
 * textOf: id → original text. Writes <outDir>/attempts.jsonl and
 * <outDir>/decisions/<callId>.json. Returns a summary; never throws for a
 * budget stop (the remaining cells are reported missing).
 */
export async function executeJudgeCalls({ specs, stage, study, ledger, transport, outDir, textOf, labelStatus, onProgress }) {
	const judge = study.judge;
	const price = study.pricing.models[judge.model];
	if (!price) throw new Error(`no verified price for ${judge.model}`);
	const attemptsPath = join(outDir, 'attempts.jsonl');
	const decisionPath = (id) => join(outDir, 'decisions', `${id}.json`);
	const priorAttempts = readJsonl(attemptsPath);
	reconcileOrphans(ledger, priorAttempts, (m) => study.pricing.models[m]);

	const state = { stop: null, done: 0, skipped: 0, budgetMissing: [] };
	const queue = [];
	for (const spec of specs) {
		if (existsSync(decisionPath(spec.callId))) {
			state.skipped++;
			continue;
		}
		// Crash after a successful response but before the decision was written:
		// rebuild from the persisted attempt instead of asking again.
		const ok = priorAttempts.filter((a) => a.callId === spec.callId && a.kind === 'response' && a.status === 200 && a.usage).at(-1);
		if (ok) {
			writeDecision(spec, [ok], ok, true);
			state.skipped++;
			continue;
		}
		queue.push(spec);
	}

	function writeDecision(spec, attempts, finalAttempt, recovered = false) {
		const supplied = new Set(spec.shownIds);
		const usage = finalAttempt?.usage ?? null;
		const cost = usage ? actualChatUsd(usage, price) : null;
		let validation;
		let final;
		if (finalAttempt?.kind === 'response' && finalAttempt.status === 200 && usage) {
			final = 'completed';
			validation = finalAttempt.modelMismatch
				? { valid: false, failure: 'model-mismatch' }
				: validateDecision({ content: finalAttempt.content, finishReason: finalAttempt.finishReason, refusal: finalAttempt.refusal }, supplied);
		} else {
			final = 'technical-failure';
			validation = { valid: false, failure: finalAttempt ? finalAttempt.kind === 'response' ? `http-${finalAttempt.status}` : finalAttempt.kind : 'attempts-exhausted' };
		}
		const { queryText, ...cell } = spec;
		writeJson(decisionPath(spec.callId), {
			...cell,
			stage,
			labelStatus,
			shownCount: spec.shownIds.length,
			final,
			recoveredFromAttemptLog: recovered,
			valid: validation.valid,
			failure: validation.failure,
			failureDetail: validation.detail ?? null,
			decision: validation.decision ?? null,
			targetId: validation.targetId ?? null,
			rawTarget: validation.rawTarget ?? null,
			reason: validation.reason ?? null,
			attempts: attempts.length,
			retries: Math.max(0, attempts.length - 1),
			apiElapsedMs: attempts.reduce((a, x) => a + (x.elapsedMs ?? 0), 0),
			model: finalAttempt?.model ?? null,
			finishReason: finalAttempt?.finishReason ?? null,
			usage,
			billedUsd: cost?.billedUsd ?? null,
			undiscountedUsd: cost?.undiscountedUsd ?? null,
			inputBound: spec.inputBound ?? null,
		});
		state.done++;
		onProgress?.(state, spec);
	}

	async function runOne(spec) {
		const candidates = spec.shownIds.map((id) => ({ id, text: textOf(id) }));
		const body = buildJudgeBody({ question: study.question, candidates, query: spec.queryText, judge });
		const inputBound = chatInputBound(body);
		spec.inputBound = inputBound;
		const amountUsd = worstCaseChatUsd(inputBound, judge.maxCompletionTokens, price);
		const attempts = [];
		let last = null;
		while (ledger.attemptsFor(spec.callId) < judge.maxAttempts) {
			if (state.stop) return;
			const attempt = ledger.attemptsFor(spec.callId) + 1;
			let resId;
			try {
				resId = ledger.reserve({ callId: spec.callId, attempt, stage, amountUsd, detail: { inputBound, maxOut: judge.maxCompletionTokens } });
			} catch (e) {
				if (e instanceof BudgetExceeded) {
					state.stop ??= { reason: 'budget', detail: e.detail };
					state.budgetMissing.push(spec.callId);

					return;
				}
				throw e;
			}
			const r = await transport.chat(body, { timeoutMs: judge.timeoutMs });
			const choice = r.json?.choices?.[0];
			const row = {
				at: new Date().toISOString(),
				stage,
				callId: spec.callId,
				attempt,
				resId,
				endpoint: 'chat/completions',
				requestedModel: judge.model,
				kind: r.kind,
				status: r.status ?? null,
				requestId: r.requestId ?? null,
				elapsedMs: r.elapsedMs,
				model: r.json?.model ?? null,
				modelMismatch: r.json?.model != null && r.json.model !== judge.model,
				finishReason: choice?.finish_reason ?? null,
				refusal: choice?.message?.refusal ?? null,
				content: choice?.message?.content ?? null,
				usage: r.json?.usage ?? null,
				error: r.error ?? r.json?.error ?? r.bodyText ?? null,
			};
			appendJsonl(attemptsPath, row);
			attempts.push(row);
			last = row;
			const cost = row.usage ? actualChatUsd(row.usage, price) : null;
			if (cost) ledger.settle(resId, cost);
			else ledger.retain(resId, `no resolvable usage (${row.kind} ${row.status ?? ''})`.trim());

			if (row.kind === 'response' && row.status === 200 && row.usage) {
				writeDecision(spec, attempts, row);
				if (row.modelMismatch) state.stop ??= { reason: 'model-mismatch', detail: { requested: judge.model, returned: row.model } };

				return;
			}
			if (!isRetryable(r)) {
				writeDecision(spec, attempts, row);
				state.stop ??= { reason: `http-${r.status}`, detail: row.error };

				return;
			}
			if (ledger.attemptsFor(spec.callId) < judge.maxAttempts) await sleep(Math.min(r.retryAfterMs ?? 2000 * attempt, 30_000));
		}
		writeDecision(spec, attempts, last);
	}

	const workers = Array.from({ length: Math.max(1, judge.concurrency) }, async () => {
		while (queue.length && !state.stop) await runOne(queue.shift());
	});
	await Promise.all(workers);
	const missing = specs.filter((s) => !existsSync(decisionPath(s.callId))).map((s) => s.callId);

	return { stage, total: specs.length, completedNow: state.done, skippedExisting: state.skipped, stop: state.stop, missing };
}

export const loadDecisions = (outDir, specs) =>
	specs.map((s) => {
		const p = join(outDir, 'decisions', `${s.callId}.json`);

		return existsSync(p) ? readJson(p) : null;
	});

// ---------------------------------------------------------------- embeddings

/**
 * Embed [{id, text}] with one model, in batches, through the ledger.
 * Per-item token counts are apportioned from batch usage by UTF-8 byte share
 * (the API reports only a batch total) and flagged as estimates.
 */
export async function executeEmbeddings({ items, model, dimensions, stage, study, ledger, transport, outDir, batchSize = 64 }) {
	const price = study.pricing.models[model];
	if (!price) throw new Error(`no verified price for ${model}`);
	const attemptsPath = join(outDir, 'attempts.jsonl');
	reconcileOrphans(ledger, readJsonl(attemptsPath), (m) => study.pricing.models[m]);
	const results = new Map();
	for (let b = 0; b < items.length; b += batchSize) {
		const batch = items.slice(b, b + batchSize);
		const callId = `embed-${model}-${String(b / batchSize).padStart(3, '0')}`;
		const input = batch.map((x) => x.text);
		const amountUsd = worstCaseEmbeddingUsd(embeddingInputBound(input), price);
		let done = false;
		while (!done && ledger.attemptsFor(callId) < study.judge.maxAttempts) {
			const attempt = ledger.attemptsFor(callId) + 1;
			const resId = ledger.reserve({ callId, attempt, stage, amountUsd, detail: { items: batch.length } });
			const r = await transport.embed({ model, input, dimensions }, { timeoutMs: study.judge.timeoutMs });
			const usage = r.json?.usage ?? null;
			appendJsonl(attemptsPath, {
				at: new Date().toISOString(),
				stage,
				callId,
				attempt,
				resId,
				endpoint: 'embeddings',
				requestedModel: model,
				kind: r.kind,
				status: r.status ?? null,
				requestId: r.requestId ?? null,
				elapsedMs: r.elapsedMs,
				model: r.json?.model ?? null,
				usage,
				error: r.error ?? r.json?.error ?? r.bodyText ?? null,
			});
			const cost = usage ? actualEmbeddingUsd(usage, price) : null;
			if (cost) ledger.settle(resId, cost);
			else ledger.retain(resId, `no resolvable usage (${r.kind} ${r.status ?? ''})`.trim());
			if (r.kind === 'response' && r.status === 200 && r.json?.data?.length === batch.length) {
				if (!String(r.json.model).startsWith(model)) throw new TechnicalFault('embedding-model-mismatch', { requested: model, returned: r.json.model });
				const bytes = input.map((t) => Buffer.byteLength(t, 'utf8'));
				const totalBytes = bytes.reduce((a, x) => a + x, 0);
				for (const d of r.json.data) {
					const item = batch[d.index];
					results.set(item.id, {
						vector: d.embedding,
						tokensEstimate: (usage.prompt_tokens * bytes[d.index]) / totalBytes,
					});
				}
				done = true;
			} else if (!isRetryable(r)) {
				throw new TechnicalFault(`embedding-http-${r.status}`, r.json?.error ?? r.bodyText);
			} else if (ledger.attemptsFor(callId) < study.judge.maxAttempts) {
				await sleep(Math.min(r.retryAfterMs ?? 2000 * attempt, 30_000));
			}
		}
		if (!done) throw new TechnicalFault('embedding-attempts-exhausted', { callId });
	}

	return results;
}
