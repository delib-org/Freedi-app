import { HttpsError } from 'firebase-functions/v2/https';
import {
	AgoraStage,
	AgoraStagePlan,
	AgoraStagePlanItem,
	AGORA_STAGE_PLAN,
	AGORA_STATION_LINK,
	validateStagePlan,
} from '@freedi/shared-types';

const clamp = (value: number, min: number, max: number): number =>
	Math.min(max, Math.max(min, value));

/**
 * Trim, clamp and validate an admin-supplied plan. The shape is already
 * schema-checked by the caller; this is the semantic half — titles present,
 * thresholds inside the rating scale, no stage the package cannot run.
 * Throws the callable's own invalid-argument with the error keys joined, so
 * the editor can show WHICH rule was broken.
 */
export function sanitizeStagePlan(
	plan: AgoraStagePlan,
	options: { hasCharacters: boolean },
): AgoraStagePlanItem[] {
	const clean: AgoraStagePlanItem[] = plan.map((item) => {
		const next: AgoraStagePlanItem = { itemId: item.itemId.trim(), stage: item.stage };
		if (item.stage === AgoraStage.question) {
			// The kind decides the scale; the schema already pinned it to the picklist
			if (item.kind) next.kind = item.kind;
			next.title = (item.title ?? '').trim().slice(0, AGORA_STAGE_PLAN.MAX_TITLE_LENGTH);
			const explanation = (item.explanation ?? '')
				.trim()
				.slice(0, AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH);
			if (explanation) next.explanation = explanation;
			if (item.statementId) next.statementId = item.statementId;
			if (item.selection) {
				next.selection = {
					cutoffBy: item.selection.cutoffBy,
					numberOfResults: clamp(Math.round(item.selection.numberOfResults), 1, 10),
					cutoffNumber: clamp(item.selection.cutoffNumber, -1, 1),
				};
			}
		}
		// A linked station: the teacher's label and "what to do there", and the
		// link itself — rebuilt field by field like everything else here, so a
		// stray key never rides along. `verifyPlanLinks` re-checks it after.
		if (item.stage === AgoraStage.linked) {
			const title = (item.title ?? '').trim().slice(0, AGORA_STAGE_PLAN.MAX_TITLE_LENGTH);
			if (title) next.title = title;
			const explanation = (item.explanation ?? '')
				.trim()
				.slice(0, AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH);
			if (explanation) next.explanation = explanation;
			if (item.link) {
				next.link = {
					app: item.link.app,
					statementId: item.link.statementId.trim(),
					title: item.link.title.trim().slice(0, AGORA_STATION_LINK.MAX_TITLE),
					linkedAt: item.link.linkedAt,
				};
			}
		}
		if (item.stage === AgoraStage.deliberation && item.votingTrigger) {
			next.votingTrigger = {
				enabled: item.votingTrigger.enabled,
				singleMin: clamp(item.votingTrigger.singleMin, -1, 1),
				pairMin: clamp(item.votingTrigger.pairMin, -1, 1),
				minRaters: clamp(Math.round(item.votingTrigger.minRaters), 1, 50),
			};
		}

		return next;
	});

	const errors = validateStagePlan(clean, options);
	if (errors.length > 0) {
		throw new HttpsError('invalid-argument', `Invalid stage plan: ${errors.join(', ')}`);
	}

	return clean;
}
