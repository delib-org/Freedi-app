/**
 * Controller functions for updating individual root-level statement properties.
 *
 * These functions are used by settings UI components to update properties
 * like hide, isDocument, defaultLanguage, forceLanguage, and powerFollowMe.
 * They replace raw Firebase calls that were previously in view components.
 */

import { setDoc, updateDoc } from 'firebase/firestore';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';

/**
 * Set the hide property on a statement (merge).
 */
export async function setStatementHideDB(statementId: string, hide: boolean): Promise<void> {
	try {
		const statementRef = createStatementRef(statementId);
		await setDoc(statementRef, { hide, lastUpdate: Date.now() }, { merge: true });
	} catch (error) {
		logError(error, {
			operation: 'statements.updateStatementProperties.setStatementHideDB',
			statementId,
			metadata: { hide },
		});
	}
}

/**
 * Set the isDocument property on a statement (merge).
 */
export async function setStatementIsDocumentDB(
	statementId: string,
	isDocument: boolean,
): Promise<void> {
	try {
		const statementRef = createStatementRef(statementId);
		await setDoc(statementRef, { isDocument, lastUpdate: Date.now() }, { merge: true });
	} catch (error) {
		logError(error, {
			operation: 'statements.updateStatementProperties.setStatementIsDocumentDB',
			statementId,
			metadata: { isDocument },
		});
	}
}

/**
 * Set the defaultLanguage property on a statement (merge).
 */
export async function setStatementDefaultLanguageDB(
	statementId: string,
	language: string,
): Promise<void> {
	try {
		const statementRef = createStatementRef(statementId);
		await setDoc(
			statementRef,
			{ defaultLanguage: language, lastUpdate: Date.now() },
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'statements.updateStatementProperties.setStatementDefaultLanguageDB',
			statementId,
			metadata: { language },
		});
	}
}

/**
 * Set the forceLanguage property on a statement (merge).
 */
export async function setStatementForceLanguageDB(
	statementId: string,
	forceLanguage: boolean,
): Promise<void> {
	try {
		const statementRef = createStatementRef(statementId);
		await setDoc(statementRef, { forceLanguage, lastUpdate: Date.now() }, { merge: true });
	} catch (error) {
		logError(error, {
			operation: 'statements.updateStatementProperties.setStatementForceLanguageDB',
			statementId,
			metadata: { forceLanguage },
		});
	}
}

/**
 * Set the powerFollowMe property on a statement.
 * When enabled, sets the path to the statement's chat; when disabled, clears it.
 */
export async function setStatementPowerFollowMeDB(
	statementId: string,
	enabled: boolean,
): Promise<void> {
	try {
		const statementRef = createStatementRef(statementId);
		const powerFollowMe = enabled ? `/statement/${statementId}/chat` : '';
		await updateDoc(statementRef, { powerFollowMe, lastUpdate: Date.now() });
	} catch (error) {
		logError(error, {
			operation: 'statements.updateStatementProperties.setStatementPowerFollowMeDB',
			statementId,
			metadata: { enabled },
		});
	}
}
