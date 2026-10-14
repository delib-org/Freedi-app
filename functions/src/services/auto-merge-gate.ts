import { logger } from 'firebase-functions';
import { judgeSemanticEquivalenceCached } from './verdict-cache-service';
import type {
	EquivalencePair,
	EquivalenceResult,
	EquivalenceVerdict,
} from './semantic-equivalence-service';
import { logError } from '../utils/errorHandling';

/**
 * Gate for MC's automatic merge (`autoMergeSimilar`).
 *
 * The client proposes a merge target from embedding similarity alone, and in
 * MC that signal is weak: options are embedded as "Question: <q>\nAnswer: <a>",
 * so the shared question prefix lifts unrelated answers to 0.81–0.90 cosine —
 * above the 0.8 "similar" threshold. "Improve dialogue between residents" was
 * folded into "improve public landscaping, paths and shade" that way.
 *
 * So the same rule the synthesis pipeline uses for attaching an option to a
 * synth (`runSinglePipeline` attach step): cosine proposes, the judge
 * disposes. The judge is the verdict-cached four-way semantic-equivalence
 * judge (`judgeSemanticEquivalenceCached`) — same prompt, same cache
 * (`synthesisVerdicts`), so a pair the pipeline already judged is free.
 *
 * Only a 'same' verdict allows the merge. Fail-CLOSED on anything else —
 * 'related' / 'different' / 'opposite', a judge error, or a timeout: an
 * unmerged near-duplicate is a mild nuisance (and the live synth can still
 * gather it later), while a wrong merge rewrites someone else's option and
 * puts a +1 on an idea the participant never proposed.
 */

/** How long the submit may wait on the judge before giving up (fail-closed). */
export const AUTO_MERGE_JUDGE_TIMEOUT_MS = 15_000;

export type AutoMergeJudge = (pairs: EquivalencePair[]) => Promise<EquivalenceResult[]>;

export interface AutoMergeGateInput {
	newText: string;
	targetText: string;
	targetStatementId: string;
	questionId: string;
	userId?: string;
}

export type AutoMergeGateDecision =
	| { allowed: true; verdict: 'same'; reason: string }
	| { allowed: false; verdict: EquivalenceVerdict | 'judge-error'; reason: string };

class JudgeTimeoutError extends Error {
	constructor(ms: number) {
		super(`Same-idea judge timed out after ${ms}ms`);
		this.name = 'JudgeTimeoutError';
	}
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<never>((_, reject) => {
		timer = setTimeout(() => reject(new JudgeTimeoutError(ms)), ms);
	});

	return Promise.race([promise, timeout]).finally(() => {
		if (timer) clearTimeout(timer);
	});
}

/**
 * Ask the same-idea judge whether `newText` may be merged into the target.
 * Never throws: every failure is a refusal.
 */
export async function judgeAutoMerge(
	input: AutoMergeGateInput,
	judge: AutoMergeJudge = judgeSemanticEquivalenceCached,
	timeoutMs: number = AUTO_MERGE_JUDGE_TIMEOUT_MS,
): Promise<AutoMergeGateDecision> {
	const { newText, targetText, targetStatementId, questionId, userId } = input;

	if (!newText.trim() || !targetText.trim()) {
		return { allowed: false, verdict: 'judge-error', reason: 'Missing text to compare' };
	}

	try {
		const results = await withTimeout(
			judge([
				{
					pairId: `automerge|${targetStatementId}`,
					textA: newText,
					textB: targetText,
				},
			]),
			timeoutMs,
		);
		const result = results[0];

		if (!result) {
			return { allowed: false, verdict: 'judge-error', reason: 'No verdict returned' };
		}

		logger.info('autoMergeGate.verdict', {
			questionId,
			targetStatementId,
			verdict: result.verdict,
		});

		if (result.verdict === 'same') {
			return { allowed: true, verdict: 'same', reason: result.reason };
		}

		return { allowed: false, verdict: result.verdict, reason: result.reason };
	} catch (error) {
		logError(error, {
			operation: 'autoMergeGate.judgeAutoMerge',
			userId,
			statementId: targetStatementId,
			metadata: { questionId, timeoutMs },
		});

		return {
			allowed: false,
			verdict: 'judge-error',
			reason: error instanceof Error ? error.message : String(error),
		};
	}
}
