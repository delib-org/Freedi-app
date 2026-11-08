// Offline re-derivation of the archived full-list cost fit (parameters.json in
// the manuscript's clustering-scale folder) from the 2026-09-04 baseline's raw
// usage, plus the cache-write surcharge the original cost formula omitted.
// No network, no key. Writes analysis/cost-fit-recomputed.json.
//   node analysis/recompute-cost-fit.mjs
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { readJson, STUDY_DIR, writeJson } from '../lib/util.mjs';

const study = readJson(join(STUDY_DIR, 'study.json'));
const price = study.pricing.models['gpt-5.6-luna'];
const runs = [42, 7, 1234].map((s) => join(STUDY_DIR, '..', '2026-09-04-llm-only-baseline', 'runs', `L2-gpt-5.6-luna-seed${s}`, 'raw.json'));

const decisions = [];
const topic = [];
let promptTotal = 0;
let writeTotal = 0;
let cachedTotal = 0;
for (const path of runs) {
	const raw = readJson(path);
	for (const d of raw.decisions) {
		decisions.push({ x: d.arrivalIndex, prompt: d.usage.prompt_tokens, completion: d.usage.completion_tokens });
		promptTotal += d.usage.prompt_tokens;
		writeTotal += d.usage.prompt_tokens_details?.cache_write_tokens ?? 0;
		cachedTotal += d.usage.prompt_tokens_details?.cached_tokens ?? 0;
	}
	const u = raw.topicPass.usage;
	topic.push({ prompt: u.prompt_tokens, completion: u.completion_tokens });
	promptTotal += u.prompt_tokens;
	writeTotal += u.prompt_tokens_details?.cache_write_tokens ?? 0;
	cachedTotal += u.prompt_tokens_details?.cached_tokens ?? 0;
}

// Ordinary least squares, prompt_tokens ~ a + b·arrivalIndex (same as calculate.py's np.polyfit(x, y, 1)).
const n = decisions.length;
const mx = decisions.reduce((s, d) => s + d.x, 0) / n;
const my = decisions.reduce((s, d) => s + d.prompt, 0) / n;
const b = decisions.reduce((s, d) => s + (d.x - mx) * (d.prompt - my), 0) / decisions.reduce((s, d) => s + (d.x - mx) ** 2, 0);
const a = my - b * mx;
const outPerArrival = decisions.reduce((s, d) => s + d.completion, 0) / n;
const topicIn = topic.reduce((s, t) => s + t.prompt, 0) / topic.length / 100;
const topicOut = topic.reduce((s, t) => s + t.completion, 0) / topic.length / 100;

const archivedPath = study.historicalCalibration.parametersJson;
const archived = existsSync(archivedPath) ? readJson(archivedPath) : null;
const check = archived
	? {
			intercept: [archived.full_prompt_intercept, a, Math.abs(archived.full_prompt_intercept - a) < 1e-3],
			slope: [archived.full_prompt_tokens_per_previous_statement, b, Math.abs(archived.full_prompt_tokens_per_previous_statement - b) < 1e-3],
			outputPerArrival: [archived.full_output_tokens_per_arrival, outPerArrival, Math.abs(archived.full_output_tokens_per_arrival - outPerArrival) < 1e-3],
			topicInputPerStatement: [archived.final_topic_input_per_statement, topicIn, Math.abs(archived.final_topic_input_per_statement - topicIn) < 1e-3],
			topicOutputPerStatement: [archived.final_topic_output_per_statement, topicOut, Math.abs(archived.final_topic_output_per_statement - topicOut) < 1e-3],
		}
	: null;

const writeShare = writeTotal / promptTotal;
function fullList(N) {
	const tin = a * N + (b * N * (N - 1)) / 2 + topicIn * N;
	const tout = (outPerArrival + topicOut) * N;
	const archivedFormula = (tin * price.inputPerM + tout * price.outputPerM) / 1e6;
	// Same tokens, billed as the 2026-09-11 schedule says: the observed share of
	// prompt tokens that were cache writes pays 1.25× (none were cache reads).
	const withCacheWrites = (tin * price.inputPerM * (1 - writeShare + writeShare * price.cacheWriteMultiplier) + tout * price.outputPerM) / 1e6;

	return { N, inputTokens: Math.round(tin), outputTokens: Math.round(tout), archivedFormulaUsd: archivedFormula, withCacheWriteSurchargeUsd: withCacheWrites };
}

const out = {
	source: runs.map((p) => p.split('scientific-research/')[1]),
	placements: n,
	fit: { intercept: a, slopePerPreviousStatement: b, outputPerArrival: outPerArrival, topicInputPerStatement: topicIn, topicOutputPerStatement: topicOut },
	archivedParametersCheck: check,
	cacheAccounting: { promptTokens: promptTotal, cacheWriteTokens: writeTotal, cachedReadTokens: cachedTotal, cacheWriteShare: writeShare },
	note: 'The archived cost formula charged all prompt tokens at $0.20/1M. The usage records show ~all prompt tokens were cache WRITES (billed 1.25× per the model page, retrieved 2026-09-11) and none were cache reads, so the archived dollar figures understate full-list cost by ~25% of the input share.',
	projection: [100, 200, 500, 1000, 5000, 10000].map(fullList),
	status: 'Projection from a 100-statement calibration; N > 100 is extrapolation, not measurement.',
};
writeJson(join(STUDY_DIR, 'analysis', 'cost-fit-recomputed.json'), out);
console.info(JSON.stringify({ fit: out.fit, check, cacheWriteShare: writeShare, projection: out.projection }, null, 2));
