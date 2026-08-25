import { logger } from 'firebase-functions/v1';
import { db } from '.';
import { Collections, Statement, StatementType, StatementView } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';
import { recordParticipation } from './progress/questionProgressWriter';

//@ts-ignore
export async function updateStatementWithViews(ev) {
	try {
		const view = ev.data.data() as StatementView;
		const statementId = view.statementId;
		if (!statementId) throw new Error('StatementId not found');
		const statementRef = db.collection(Collections.statements).doc(statementId);
		let viewedStatement: Statement | undefined;

		//increment the view count
		await db.runTransaction(async (t) => {
			try {
				const statementDB = await t.get(statementRef);
				if (!statementDB.exists) throw new Error('Statement not found');
				const statement = statementDB.data() as Statement;
				if (!statement) throw new Error('Statement not found');
				viewedStatement = statement;

				if (!statement.viewed) statement.viewed = { individualViews: 0 };

				const views = statement.viewed.individualViews || 0;
				t.update(statementRef, { 'viewed.individualViews': views + 1 });
			} catch (error) {
				logError(error, {
					operation: 'views.updateStatementWithViews.transaction',
					statementId: view.statementId,
				});
			}
		});

		// Question progress funnel: "entered" = first view doc for (question, user).
		// Only questions are tracked — options/paragraphs would just burn writes.
		const userId = view.userId ?? (ev.params?.viewId as string | undefined)?.split('--')[0];
		if (viewedStatement?.statementType === StatementType.question && userId) {
			await recordParticipation({
				statementId,
				topParentId: viewedStatement.topParentId,
				organizationId: viewedStatement.organizationId,
				userId,
				kind: 'entered',
			});
		}
	} catch (error) {
		logger.error(error);
	}
}
