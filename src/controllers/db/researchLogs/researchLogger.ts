/**
 * Research Logger
 *
 * Logs all user actions to Firestore for research purposes.
 * Every action is timestamped and stored in the researchLogs collection.
 * Only uid is stored — no displayName or other PII.
 * Data can be exported as JSON for offline analysis.
 */

import {
	setDoc,
	getDocs,
	query,
	where,
	orderBy,
	collection,
	limit,
	startAfter,
	QueryDocumentSnapshot,
} from 'firebase/firestore';
import { DB } from '@/controllers/db/config';
import { createDocRef } from '@/utils/firebaseUtils';
import { Collections, ResearchAction, getResearchLogId } from '@freedi/shared-types';
import type { ResearchLog } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';
import { downloadFile } from '@/utils/exportUtils';

const SESSION_ID = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
const LOGIN_COUNT_KEY = 'freedi_research_login_count';

function getUserId(): string | undefined {
	return store.getState().creator.creator?.uid;
}

/**
 * Log a research action to Firestore.
 * Non-blocking: errors are caught and logged, never thrown.
 */
export async function logResearchAction(
	action: ResearchAction,
	data?: Partial<
		Pick<
			ResearchLog,
			| 'topParentId'
			| 'parentId'
			| 'statementId'
			| 'screen'
			| 'previousValue'
			| 'newValue'
			| 'loginCount'
			| 'metadata'
		>
	>,
): Promise<void> {
	try {
		const userId = getUserId();
		if (!userId) return;

		const timestamp = Date.now();
		const logId = getResearchLogId(userId, timestamp);

		const logEntry: ResearchLog = {
			logId,
			userId,
			action,
			timestamp,
			sessionId: SESSION_ID,
			sourceApp: 'main',
			...data,
		};

		const docRef = createDocRef(Collections.researchLogs, logId);
		await setDoc(docRef, logEntry);
	} catch (error) {
		logError(error, {
			operation: 'researchLogger.logResearchAction',
			metadata: { action },
		});
	}
}

/**
 * Track login and increment the login counter.
 */
export async function logLogin(): Promise<void> {
	const count = incrementLoginCount();
	await logResearchAction(ResearchAction.LOGIN, { loginCount: count });
}

/**
 * Track logout.
 */
export async function logLogout(): Promise<void> {
	await logResearchAction(ResearchAction.LOGOUT);
}

/**
 * Track screen navigation.
 */
export async function logScreenView(screen: string, topParentId?: string): Promise<void> {
	await logResearchAction(ResearchAction.VIEW_SCREEN, { screen, topParentId });
}

/**
 * Track evaluation (rating).
 */
export async function logEvaluation(
	statementId: string,
	newValue: string,
	previousValue?: string,
	topParentId?: string,
): Promise<void> {
	const action =
		previousValue !== undefined ? ResearchAction.UPDATE_EVALUATION : ResearchAction.EVALUATE;
	await logResearchAction(action, {
		statementId,
		newValue,
		previousValue,
		topParentId,
	});
}

/**
 * Track statement creation (proposal submission).
 */
export async function logStatementCreation(
	statementId: string,
	parentId?: string,
	topParentId?: string,
): Promise<void> {
	await logResearchAction(ResearchAction.CREATE_STATEMENT, {
		statementId,
		parentId,
		topParentId,
	});
}

/**
 * Track vote.
 */
export async function logVote(
	statementId: string,
	newValue: string,
	topParentId?: string,
): Promise<void> {
	await logResearchAction(ResearchAction.VOTE, {
		statementId,
		newValue,
		topParentId,
	});
}

// --- Login counter (persisted in localStorage) ---

function incrementLoginCount(): number {
	try {
		const current = Number(localStorage.getItem(LOGIN_COUNT_KEY) ?? '0');
		const next = current + 1;
		localStorage.setItem(LOGIN_COUNT_KEY, String(next));

		return next;
	} catch {
		return 1;
	}
}

// --- Export / Query ---

const EXPORT_BATCH_SIZE = 500;

/**
 * Export research logs as a JSON array.
 * Fetches all logs for a given topParentId (event/discussion).
 * Supports pagination for large datasets.
 */
export async function exportResearchLogs(topParentId: string): Promise<ResearchLog[]> {
	try {
		const allLogs: ResearchLog[] = [];
		let lastDoc: QueryDocumentSnapshot | undefined;
		let hasMore = true;

		while (hasMore) {
			const baseConstraints = [
				where('topParentId', '==', topParentId),
				orderBy('timestamp', 'asc'),
				limit(EXPORT_BATCH_SIZE),
			];

			const constraints = lastDoc ? [...baseConstraints, startAfter(lastDoc)] : baseConstraints;

			const q = query(collection(DB, Collections.researchLogs), ...constraints);

			const snapshot = await getDocs(q);

			snapshot.forEach((doc) => {
				allLogs.push(doc.data() as ResearchLog);
			});

			if (snapshot.size < EXPORT_BATCH_SIZE) {
				hasMore = false;
			} else {
				lastDoc = snapshot.docs[snapshot.docs.length - 1];
			}
		}

		return allLogs;
	} catch (error) {
		logError(error, {
			operation: 'researchLogger.exportResearchLogs',
			metadata: { topParentId },
		});

		return [];
	}
}

/**
 * Download research logs as a JSON file.
 * Triggers a browser download.
 */
export async function downloadResearchLogsAsJSON(topParentId: string): Promise<void> {
	const logs = await exportResearchLogs(topParentId);
	const filename = `research-logs_${topParentId}_${new Date().toISOString().slice(0, 10)}.json`;
	downloadFile(JSON.stringify(logs, null, 2), filename, 'application/json');
}
