import { getDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { FireStore } from '../config';
import { store } from '@/redux/store';
import { Statement, StatementSchema } from '@freedi/shared-types';

import { parse, string } from 'valibot';
import { logger } from '@/services/logger';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

export async function toggleStatementHide(statementId: string): Promise<boolean | undefined> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');

		const statementRef = createStatementRef(statementId);

		const hide = await runTransaction(FireStore, async (transaction) => {
			const statementDB = await transaction.get(statementRef);

			if (!statementDB.exists()) throw new Error('Statement not found');
			const statementDBData = statementDB.data() as Statement;

			const newHide = !(statementDBData.hide === true);
			transaction.update(statementRef, { hide: newHide });

			return newHide;
		});

		return hide;
	} catch (error) {
		logError(error, { operation: 'statements.statementVisibility.toggleStatementHide' });

		return undefined;
	}
}

export async function toggleStatementAnchored(
	statementId: string,
	anchored: boolean,
	parentId: string,
): Promise<void> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');
		if (!parentId) throw new Error('Parent ID is undefined');

		// Check if user is admin
		const role = store
			.getState()
			.statements.statementSubscription.find((sub) => sub.statementId === parentId)?.role;

		if (role !== 'admin') {
			throw new Error('Only admins can anchor statements');
		}

		// Get parent statement to check settings
		const parentRef = createStatementRef(parentId);
		const parentDoc = await getDoc(parentRef);

		if (!parentDoc.exists()) {
			throw new Error('Parent statement not found');
		}

		// No limit on how many statements can be anchored
		// The numberOfAnchoredStatements setting only determines how many
		// anchored options are randomly selected for each evaluation

		// Update the statement
		const statementRef = createStatementRef(statementId);
		await updateDoc(statementRef, { anchored });

		// Log analytics event
		logger.info('Statement Anchored', {
			statementId,
			anchored,
			parentId,
		});
	} catch (error) {
		logError(error, {
			operation: 'statements.statementVisibility.toggleStatementAnchored',
			metadata: { message: 'Error toggling anchored status:' },
		});
		throw error;
	}
}

export async function setFollowMeDB(
	topParentStatement: Statement,
	path: string | undefined,
): Promise<void> {
	try {
		parse(string(), path);
		parse(StatementSchema, topParentStatement);

		const topParentStatementRef = createStatementRef(topParentStatement.statementId);

		if (path) {
			await updateDoc(topParentStatementRef, { followMe: path });
		} else {
			await updateDoc(topParentStatementRef, { followMe: '' });
		}
	} catch (error) {
		logError(error, { operation: 'statements.statementVisibility.setFollowMeDB' });
	}
}

export async function setPowerFollowMeDB(
	topParentStatement: Statement,
	path: string | undefined,
): Promise<void> {
	try {
		parse(string(), path);
		parse(StatementSchema, topParentStatement);

		const topParentStatementRef = createStatementRef(topParentStatement.statementId);

		if (path) {
			await updateDoc(topParentStatementRef, { powerFollowMe: path });
		} else {
			await updateDoc(topParentStatementRef, { powerFollowMe: '' });
		}
	} catch (error) {
		logger.error('Failed to set power follow me', error);
	}
}
