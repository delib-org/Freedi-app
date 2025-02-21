import { Change, logger } from 'firebase-functions/v1';
import { db } from '.';
import {
	Agree,
	AgreeDisagree,
	AgreeSchema,
} from '../../src/types/agreement/Agreement';
import { Collections } from '../../src/types/TypeEnums';
import { DocumentSnapshot } from 'firebase-admin/firestore';
import { FirestoreEvent } from 'firebase-functions/firestore';
import { parse } from 'valibot';

export async function updateAgrees(
	event: FirestoreEvent<
		Change<DocumentSnapshot> | undefined,
		{
			agreeId: string;
		}
	>
) {
	if (!event.data) return;

	try {
		const agreeAfterData = parse(AgreeSchema, event.data.after.data());
		const agreeBeforeData = parse(AgreeSchema, event.data.before.data());

		const agreeAfter: number = agreeAfterData?.agree ?? 0;
		const agreeBefore: number = agreeBeforeData?.agree ?? 0;

		const { diffInAgree, diffInDisagree } = agreeDisagreeDifferences(
			agreeBefore,
			agreeAfter
		);

		const combinedAgreement = {
			...agreeAfterData,
			...agreeBeforeData,
		} as AgreeDisagree;

		const statementRef = db
			.collection(Collections.statements)
			.doc(combinedAgreement.statementId);
		await db.runTransaction(async (t) => {
			const statement = await t.get(statementRef);
			if (!statement.exists) throw new Error('Statement not found');

			const agree = statement.data()?.documentAgree?.agree || 0;
			const disagree = statement.data()?.documentAgree?.disagree || 0;

			const newAgree = agree + diffInAgree;
			const newDisagree = disagree + diffInDisagree;
			const totalAgree = newAgree + newDisagree;

			const updateAgrees: Agree = {
				agree: newAgree,
				disagree: newDisagree,
				avgAgree:
					totalAgree !== 0
						? (newAgree - newDisagree) / totalAgree
						: 0,
			};

			t.update(statementRef, { documentAgree: updateAgrees });
		});
	} catch (error) {
		logger.error(error);
	}
}

export function agreeDisagreeDifferences(
	agreeBefore: number,
	agreeAfter: number
): { diffInAgree: number; diffInDisagree: number } {
	try {
		const diffDisagree = Math.min(agreeBefore, 0) - Math.min(agreeAfter, 0);
		const diffAgree = Math.max(agreeAfter, 0) - Math.max(agreeBefore, 0);

		return {
			diffInAgree: diffAgree,
			diffInDisagree: diffDisagree,
		};
	} catch (error) {
		console.error(error);

		return {
			diffInAgree: 0,
			diffInDisagree: 0,
		};
	}
}
