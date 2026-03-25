import { getDoc, updateDoc, runTransaction } from 'firebase/firestore';
import { FireStore } from '../config';
import { store } from '@/redux/store';
import { Statement } from '@freedi/shared-types';

import { parse, string } from 'valibot';
import { logger } from '@/services/logger';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { FOLLOW_ME } from '@/constants/common';

// Debounce timers for follow-me writes keyed by "statementId-field"
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debouncedUpdateDoc(statementId: string, field: string, value: string): void {
	const key = `${statementId}-${field}`;

	const existing = debounceTimers.get(key);
	if (existing) clearTimeout(existing);

	// Clearing (empty string) should be immediate
	if (!value) {
		debounceTimers.delete(key);
		const ref = createStatementRef(statementId);
		updateDoc(ref, { [field]: value });

		return;
	}

	const timer = setTimeout(() => {
		debounceTimers.delete(key);
		const ref = createStatementRef(statementId);
		updateDoc(ref, { [field]: value });
	}, FOLLOW_ME.WRITE_DEBOUNCE_MS);

	debounceTimers.set(key, timer);
}

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

export function setFollowMeDB(topParentStatement: Statement, path: string | undefined): void {
	try {
		parse(string(), path);

		const value = path || '';
		debouncedUpdateDoc(topParentStatement.statementId, 'followMe', value);
	} catch (error) {
		logError(error, { operation: 'statements.statementVisibility.setFollowMeDB' });
	}
}

export function setPowerFollowMeDB(topParentStatement: Statement, path: string | undefined): void {
	try {
		parse(string(), path);

		const value = path || '';
		debouncedUpdateDoc(topParentStatement.statementId, 'powerFollowMe', value);
	} catch (error) {
		logError(error, { operation: 'statements.statementVisibility.setPowerFollowMeDB' });
	}
}
