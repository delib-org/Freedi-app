import { FieldValue } from 'firebase-admin/firestore';
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
		const statementDB = await statementRef.get();
		if (!statementDB.exists) throw new Error('Statement not found');
		const viewedStatement = statementDB.data() as Statement;

		// A question's views are counted on its progress doc: the question document
		// reaches everyone present, so writing it here would cost people x people
		// reads as a room arrives. Other statements still count on themselves.
		if (viewedStatement.statementType !== StatementType.question) {
			await statementRef.update({ 'viewed.individualViews': FieldValue.increment(1) });

			return;
		}

		const userId = view.userId ?? (ev.params?.viewId as string | undefined)?.split('--')[0];
		if (userId) {
			await recordParticipation({
				statementId,
				topParentId: viewedStatement.topParentId,
				organizationId: viewedStatement.organizationId,
				userId,
				kind: 'entered',
			});
		}
	} catch (error) {
		logError(error, {
			operation: 'views.updateStatementWithViews',
			statementId: ev.data?.data()?.statementId,
		});
	}
}
