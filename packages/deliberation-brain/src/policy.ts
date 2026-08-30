import type { DiagnosisField } from '@freedi/shared-types';
import { missingCriticalFields } from './diagnosis';
import type { BrainContext, NextMove } from './types';

export const MAX_QUESTIONS_PER_TURN = 2;
/** From this user turn on, every reply must carry a full plan. */
export const PROPOSE_BY_TURN = 1;
/** With a stable plan and this many turns, ask "Shall I build this?". */
export const CONFIRM_FROM_TURN = 3;

/**
 * Dialogue policy: what the consultant should do this turn.
 * `ctx.userTurns` counts user turns BEFORE the current one.
 */
/** "Build it" / "propose a plan" in the admin's own words (en/he/ar), loosely matched. */
const BUILD_INTENT = /\b(build|propose|go ahead|let'?s do it|make the plan|create it)\b|לבנות|תבנה|בנה|תציע|הצע|תוכנית מלאה|קדימה|ابن|اقترح|هيا/i;

export function wantsPlanNow(message: string | undefined): boolean {
	return !!message && BUILD_INTENT.test(message);
}

export function nextMove(ctx: BrainContext): NextMove {
	const missing: DiagnosisField[] = missingCriticalFields(ctx.diagnosis);
	const askFields = missing.slice(0, MAX_QUESTIONS_PER_TURN);
	const problems = ctx.problems ?? [];
	const askedToBuild = wantsPlanNow(ctx.latestUserMessage);

	if (ctx.currentPlan) {
		if (problems.length > 0) {
			return {
				move: 'revise',
				askFields: [],
				reason: `The current plan has ${problems.length} problem(s) to repair.`,
			};
		}
		if (askedToBuild) {
			return {
				move: 'confirm',
				askFields: [],
				reason:
					'The admin asked to build: return the complete plan with readyToBuild true unless something is genuinely blocking, and say it is ready.',
			};
		}
		if (ctx.userTurns >= CONFIRM_FROM_TURN) {
			return {
				move: 'confirm',
				askFields: [],
				reason: 'A plan exists with no open problems after several turns; ask for approval to build.',
			};
		}

		return {
			move: 'revise',
			askFields: askFields.slice(0, 1),
			reason: 'A plan exists and the admin is still shaping it; apply their latest message.',
		};
	}

	if (askedToBuild) {
		return {
			move: 'propose',
			askFields: askFields.slice(0, 1),
			reason:
				'The admin asked for a plan / to build: propose a COMPLETE plan now with sensible assumptions stated in the reply; at most one question may ride along.',
		};
	}

	if (ctx.userTurns < PROPOSE_BY_TURN && missing.length > 0) {
		return {
			move: 'askClarifying',
			askFields,
			reason: `Early in the conversation and ${missing.length} critical field(s) unknown: ${missing.join(', ')}.`,
		};
	}

	return {
		move: 'propose',
		askFields,
		reason:
			ctx.userTurns >= PROPOSE_BY_TURN
				? 'Second user turn or later: always propose a full plan (clarifications may ride along).'
				: 'Enough is known to propose a full plan.',
	};
}
