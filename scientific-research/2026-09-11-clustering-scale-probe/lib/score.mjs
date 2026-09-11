// Per-decision scoring against labels applied at SCORE time (so labels can be
// replaced by adjudicated human labels and re-scored without re-running).

export const OUTCOMES = ['correct', 'false-join', 'miss-abstain', 'miss-no-retrieval', 'invalid-output', 'truncated', 'technical'];

/**
 * d: decision record; label: {matches:[ids]} for d.queryId; cell: pools.json
 * sizes[n] entry (ids + cosine ranking). Returns one flat scored row.
 */
export function scoreDecision(d, label, cell) {
	const poolIds = new Set(cell.ids);
	const approvedAll = new Set(label.matches);
	const approved = new Set([...approvedAll].filter((id) => poolIds.has(id)));
	const shown = d.shownIds;
	const shownSet = new Set(shown);
	const approvedShown = [...approved].filter((id) => shownSet.has(id));
	const positive = approved.size > 0;
	let outcome;
	if (d.final !== 'completed') outcome = 'technical';
	else if (!d.valid) outcome = d.failure === 'truncated' ? 'truncated' : 'invalid-output';
	else if (positive) {
		if (d.decision === 'same') outcome = approved.has(d.targetId) ? 'correct' : 'false-join';
		else outcome = approvedShown.length ? 'miss-abstain' : 'miss-no-retrieval';
	} else outcome = d.decision === 'same' ? 'false-join' : 'correct';

	const rankIndex = new Map(cell.ranking.map(([id, score], i) => [id, { rank: i + 1, score }]));
	const best = [...approved].map((id) => ({ id, ...rankIndex.get(id) })).sort((a, b) => a.rank - b.rank)[0] ?? null;

	return {
		callId: d.callId,
		queryId: d.queryId,
		size: d.size,
		orderIndex: d.orderIndex,
		method: d.method,
		positive,
		approvedInPool: approved.size,
		approvedMissingFromPool: approvedAll.size - approved.size,
		approvedShown: approvedShown.length,
		candidateRecall: positive ? approvedShown.length > 0 : null,
		approvedPositions: approvedShown.map((id) => shown.indexOf(id)).sort((a, b) => a - b),
		bestTargetRank: best?.rank ?? null,
		bestTargetCosine: best?.score ?? null,
		outcome,
		correct: outcome === 'correct',
		falseJoin: outcome === 'false-join',
		predictedJoin: d.final === 'completed' && d.valid && d.decision === 'same',
		decision: d.decision,
		targetId: d.targetId,
		targetIsAnchor: d.targetId != null && d.targetId === d.anchorId,
		failure: d.failure,
		shownCount: shown.length,
		attempts: d.attempts,
		retries: d.retries,
		promptTokens: d.usage?.prompt_tokens ?? null,
		cachedTokens: d.usage?.prompt_tokens_details?.cached_tokens ?? null,
		cacheWriteTokens: d.usage?.prompt_tokens_details?.cache_write_tokens ?? null,
		completionTokens: d.usage?.completion_tokens ?? null,
		reasoningTokens: d.usage?.completion_tokens_details?.reasoning_tokens ?? null,
		billedUsd: d.billedUsd,
		undiscountedUsd: d.undiscountedUsd,
		apiElapsedMs: d.apiElapsedMs,
		retrievalMs: d.retrievalMs,
		labelStatus: d.labelStatus,
	};
}
