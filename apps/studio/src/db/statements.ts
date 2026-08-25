import { doc, setDoc, writeBatch } from 'firebase/firestore';
import { Collections, type QuestionStatus, type Statement } from '@freedi/shared-types';
import type { ActivityRunState } from '@freedi/event-core';
import { db } from '@/firebase';
import { logError } from '@/utils/logError';

/**
 * Direct Firestore writes a facilitator is allowed to make on statements they
 * administer (status, title/description, sibling order, archive). Everything
 * else — creating questions, membership — goes through `orgFunctions`.
 */

/** Facilitator-facing run state → stored `statementSettings.questionStatus`. */
export function runStateToQuestionStatus(state: ActivityRunState): QuestionStatus {
	switch (state) {
		case 'frozen':
			return 'frozen';
		case 'closed':
			return 'closed';
		case 'open':
		case 'queued':
		default:
			return 'live';
	}
}

/** Stored `questionStatus` → run state (undefined means live, see event-core). */
export function questionStatusToRunState(status: QuestionStatus | undefined): ActivityRunState {
	switch (status) {
		case 'frozen':
			return 'frozen';
		case 'closed':
			return 'closed';
		case 'live':
		default:
			return 'open';
	}
}

export async function setQuestionStatus(
	statementId: string,
	status: QuestionStatus,
): Promise<void> {
	try {
		await setDoc(
			doc(db, Collections.statements, statementId),
			{ statementSettings: { questionStatus: status }, lastUpdate: Date.now() },
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'statements.setQuestionStatus',
			statementId,
			metadata: { status },
		});
		throw error;
	}
}

export type StatementTextPatch = Partial<Pick<Statement, 'statement' | 'description'>>;

export async function updateStatementFields(
	statementId: string,
	patch: StatementTextPatch,
): Promise<void> {
	try {
		await setDoc(
			doc(db, Collections.statements, statementId),
			{ ...patch, lastUpdate: Date.now() },
			{ merge: true },
		);
	} catch (error) {
		logError(error, {
			operation: 'statements.updateStatementFields',
			statementId,
			metadata: { fields: Object.keys(patch) },
		});
		throw error;
	}
}

/** Persist a new sibling order: `order` = index in `orderedIds`. */
export async function reorderChildren(orderedIds: string[]): Promise<void> {
	if (orderedIds.length === 0) return;
	try {
		const batch = writeBatch(db);
		const lastUpdate = Date.now();
		orderedIds.forEach((statementId, index) => {
			batch.set(
				doc(db, Collections.statements, statementId),
				{ order: index, lastUpdate },
				{ merge: true },
			);
		});
		await batch.commit();
	} catch (error) {
		logError(error, {
			operation: 'statements.reorderChildren',
			metadata: { count: orderedIds.length },
		});
		throw error;
	}
}

/** Archive = the platform's `hide` flag (the Statement schema has no separate archive field). */
export async function archiveStatement(statementId: string): Promise<void> {
	try {
		await setDoc(
			doc(db, Collections.statements, statementId),
			{ hide: true, lastUpdate: Date.now() },
			{ merge: true },
		);
	} catch (error) {
		logError(error, { operation: 'statements.archiveStatement', statementId });
		throw error;
	}
}
