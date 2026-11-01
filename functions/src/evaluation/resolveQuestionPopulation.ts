import type { Firestore } from 'firebase-admin/firestore';
import { Collections, resolveStakeholderCount } from '@freedi/shared-types';
import type { StakeholderScope } from '@freedi/shared-types';

/**
 * The explicit N of a question: the same walk the live trigger and
 * fn_recalculateIndices do (the question, then its top group), declared values
 * only. Undefined means open population — no inference from voter counts.
 *
 * Recalculation tools call this ONCE per question and use the answer for every
 * option and synthesis beneath it, so all of them are scored with one N.
 */
export async function resolveQuestionPopulation(
	firestore: Firestore,
	questionId: string,
): Promise<number | undefined> {
	const questionDoc = await firestore.collection(Collections.statements).doc(questionId).get();
	const question = questionDoc.data() as (StakeholderScope & { topParentId?: string }) | undefined;
	const topId = question?.topParentId;
	const top =
		topId && topId !== questionId
			? ((await firestore.collection(Collections.statements).doc(topId).get()).data() as
					| StakeholderScope
					| undefined)
			: question;

	return resolveStakeholderCount(undefined, question, top).count;
}
