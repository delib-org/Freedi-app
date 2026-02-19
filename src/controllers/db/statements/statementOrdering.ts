import { writeBatch, updateDoc } from 'firebase/firestore';
import { FireStore } from '../config';
import { Statement, StatementSchema } from '@freedi/shared-types';

import { number, parse } from 'valibot';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

export async function updateStatementsOrderToDB(statements: Statement[]) {
	try {
		const batch = writeBatch(FireStore);

		for (const statement of statements) {
			parse(StatementSchema, statement);

			const statementRef = createStatementRef(statement.statementId);

			batch.update(statementRef, { order: statement.order });
		}

		await batch.commit();
	} catch (error) {
		logError(error, { operation: 'statements.statementOrdering.updateStatementsOrderToDB' });
	}
}

export function setRoomSizeInStatementDB(statement: Statement, roomSize: number) {
	try {
		parse(number(), roomSize);
		parse(StatementSchema, statement);
		const statementRef = createStatementRef(statement.statementId);
		const newRoomSize = { roomSize };
		updateDoc(statementRef, newRoomSize);
	} catch (error) {
		logError(error, { operation: 'statements.statementOrdering.setRoomSizeInStatementDB' });
	}
}
