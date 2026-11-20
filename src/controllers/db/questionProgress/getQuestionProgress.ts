import { getDoc } from 'firebase/firestore';
import { safeParse } from 'valibot';
import { Collections, QuestionProgress, QuestionProgressSchema } from '@freedi/shared-types';
import { createDocRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

const COUNTER_FIELDS = ['entered', 'suggested', 'evaluated', 'options', 'evaluations'] as const;

/**
 * Older server writers could create a progress doc holding only a few fields
 * (a nudge stamp, a members count). Such a doc is recoverable: a counter that
 * is absent is a counter nobody has moved, so it reads as 0. A field that is
 * present with the wrong type is NOT filled; it stays corrupt and fails parsing.
 * Returns the filled copy and whether anything was filled.
 */
function fillMissingFields(
	statementId: string,
	data: Record<string, unknown>,
): { filled: Record<string, unknown>; changed: boolean } {
	const filled: Record<string, unknown> = { ...data };
	let changed = false;
	const fillIfMissing = (key: string, value: unknown): void => {
		if (filled[key] === undefined) {
			filled[key] = value;
			changed = true;
		}
	};

	fillIfMissing('statementId', statementId);
	fillIfMissing('topParentId', statementId);
	COUNTER_FIELDS.forEach((field) => fillIfMissing(field, 0));
	fillIfMissing('lastUpdate', 0);
	fillIfMissing('lastActivity', filled.lastUpdate);

	return { filled, changed };
}

/**
 * One read of a question's progress counters. Always a single `getDoc`, never
 * a listener: the document is written on every arrival and rating of a live
 * question. Failures resolve to null, because these counts are decoration.
 */
export async function getQuestionProgress(statementId: string): Promise<QuestionProgress | null> {
	try {
		const snapshot = await getDoc(createDocRef(Collections.questionProgress, statementId));
		if (!snapshot.exists()) return null;

		const { filled, changed } = fillMissingFields(statementId, snapshot.data() ?? {});
		if (changed) {
			console.info(
				'questionProgress.getQuestionProgress: partial document, missing counters read as 0',
				{
					statementId,
				},
			);
		}

		const parsed = safeParse(QuestionProgressSchema, filled);
		if (!parsed.success) {
			logError(new Error('Invalid question progress document'), {
				operation: 'questionProgress.getQuestionProgress.parse',
				statementId,
			});

			return null;
		}

		return parsed.output;
	} catch (error) {
		logError(error, { operation: 'questionProgress.getQuestionProgress', statementId });

		return null;
	}
}
