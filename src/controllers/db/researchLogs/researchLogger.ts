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
	getDoc,
	doc,
	query,
	where,
	orderBy,
	collection,
	limit,
	startAfter,
	QueryDocumentSnapshot,
} from 'firebase/firestore';
import { DB, auth } from '@/controllers/db/config';
import { createDocRef } from '@/utils/firebaseUtils';
import {
	Collections,
	ResearchAction,
	getResearchLogId,
	RESEARCH_GLOBAL_ACTIONS,
	bucketLoginCount,
	normalizeScreenPath,
} from '@freedi/shared-types';
import type { ResearchLog } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';
import { downloadFile } from '@/utils/exportUtils';
import { getCachedConsent } from './researchConsentService';

const SESSION_ID = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
const LOGIN_COUNT_KEY = 'freedi_research_login_count';

function getUserId(): string | undefined {
	return store.getState().creator.creator?.uid;
}

/**
 * In-memory cache for research-enabled status per topParentId.
 * TTL keeps it fresh so admin changes propagate without a page reload.
 */
const researchEnabledCache = new Map<string, { enabled: boolean; expiresAt: number }>();
const RESEARCH_CACHE_TTL_MS = 60_000; // 1 minute

/**
 * Check if research logging is enabled for a statement (or its top parent).
 * Checks Redux first, then Firestore (with cache) for freshness.
 */
async function isResearchEnabled(topParentId: string): Promise<boolean> {
	// 1. Check Redux (always up-to-date if the statement is being listened to)
	const statements = store.getState().statements.statements;
	const statement = statements.find((s) => s.statementId === topParentId);
	if (statement?.statementSettings?.enableResearchLogging === true) return true;

	// 2. Check the cache (covers cases where the top parent isn't in Redux)
	const cached = researchEnabledCache.get(topParentId);
	if (cached && Date.now() < cached.expiresAt) return cached.enabled;

	// 3. Fetch from Firestore directly
	try {
		const docRef = createDocRef(Collections.statements, topParentId);
		const { getDoc } = await import('firebase/firestore');
		const snap = await getDoc(docRef);
		const enabled = snap.exists()
			? snap.data()?.statementSettings?.enableResearchLogging === true
			: false;
		researchEnabledCache.set(topParentId, {
			enabled,
			expiresAt: Date.now() + RESEARCH_CACHE_TTL_MS,
		});

		return enabled;
	} catch {
		return cached?.enabled ?? false;
	}
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

		// Firestore security rules require an authenticated user.
		// Redux may still hold the old uid after sign-out, so double-check auth.
		if (!auth.currentUser) return;

		// Check if research mode is enabled for this statement
		const isGlobal = RESEARCH_GLOBAL_ACTIONS.includes(action);
		if (!isGlobal) {
			const topParentId = data?.topParentId;
			if (!topParentId) return;
			if (!(await isResearchEnabled(topParentId))) return;

			// Check user consent (skip if opted out)
			const consent = getCachedConsent(userId, topParentId);
			if (consent === false) return;
		}

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

		// Remove undefined values — Firestore rejects them in setDoc()
		const cleanEntry = Object.fromEntries(
			Object.entries(logEntry).filter(([, v]) => v !== undefined),
		);

		const docRef = createDocRef(Collections.researchLogs, logId);
		await setDoc(docRef, cleanEntry);
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
	await logResearchAction(ResearchAction.LOGIN, {
		metadata: { loginBucket: bucketLoginCount(count) },
	});
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
 * Pseudonymize logs: replace userIds with participant_N, sanitize logIds,
 * bucket loginCount, normalize screen paths.
 */
function pseudonymizeLogs(logs: ResearchLog[]): Record<string, unknown>[] {
	const userIdMap = new Map<string, string>();
	let counter = 1;

	return logs.map((log) => {
		if (!userIdMap.has(log.userId)) {
			userIdMap.set(log.userId, `participant_${counter++}`);
		}
		const pseudoId = userIdMap.get(log.userId)!;

		return {
			...log,
			userId: pseudoId,
			logId: `${pseudoId}_${log.timestamp}_${Math.random().toString(36).substring(2, 8)}`,
			screen: log.screen ? normalizeScreenPath(log.screen) : undefined,
			loginCount: log.loginCount ? undefined : undefined,
			metadata: log.metadata?.loginBucket
				? { loginBucket: log.metadata.loginBucket }
				: log.metadata,
		};
	});
}

/**
 * Fetch statement titles/descriptions for all unique statementIds in the logs.
 * Returns a lookup map: statementId → { title, description }
 */
async function fetchStatementContext(
	logs: ResearchLog[],
): Promise<Record<string, { title: string; description?: string }>> {
	const statementIds = new Set<string>();

	for (const log of logs) {
		if (log.statementId) statementIds.add(log.statementId);
		if (log.parentId) statementIds.add(log.parentId);
	}

	const context: Record<string, { title: string; description?: string }> = {};

	// Fetch in batches of 10 (Firestore getDoc is not batched, but we parallelize)
	const ids = Array.from(statementIds);
	const BATCH = 10;

	for (let i = 0; i < ids.length; i += BATCH) {
		const batch = ids.slice(i, i + BATCH);
		const results = await Promise.all(
			batch.map((id) => getDoc(doc(DB, Collections.statements, id))),
		);

		for (const snap of results) {
			if (!snap.exists()) continue;
			const data = snap.data();
			const title = data.statement || '';
			const paragraphs = data.paragraphs;
			const description = Array.isArray(paragraphs)
				? paragraphs.map((p: { content?: string }) => p.content || '').join(' ').substring(0, 300)
				: undefined;

			context[snap.id] = { title, description };
		}
	}

	return context;
}

/**
 * Download research logs as a pseudonymized JSON file.
 * Includes a statements lookup with titles so researchers know what was evaluated.
 */
export async function downloadResearchLogsAsJSON(topParentId: string): Promise<void> {
	const logs = await exportResearchLogs(topParentId);
	const anonymized = pseudonymizeLogs(logs);
	const statements = await fetchStatementContext(logs);
	const exportData = {
		exportedAt: new Date().toISOString(),
		totalLogs: anonymized.length,
		statements,
		logs: anonymized,
	};
	const filename = `research-logs_${new Date().toISOString().slice(0, 10)}.json`;
	downloadFile(JSON.stringify(exportData, null, 2), filename, 'application/json');
}

/**
 * Export research logs for a specific question (by parentId or topParentId).
 * Tries parentId first, falls back to topParentId for broader scope.
 */
export async function exportResearchLogsByQuestion(questionId: string): Promise<ResearchLog[]> {
	try {
		const allLogs: ResearchLog[] = [];
		let lastDoc: QueryDocumentSnapshot | undefined;
		let hasMore = true;

		while (hasMore) {
			const baseConstraints = [
				where('parentId', '==', questionId),
				orderBy('timestamp', 'asc'),
				limit(EXPORT_BATCH_SIZE),
			];

			const constraints = lastDoc ? [...baseConstraints, startAfter(lastDoc)] : baseConstraints;
			const q = query(collection(DB, Collections.researchLogs), ...constraints);
			const snapshot = await getDocs(q);

			snapshot.forEach((doc) => {
				allLogs.push(doc.data() as ResearchLog);
			});

			hasMore = snapshot.size === EXPORT_BATCH_SIZE;
			if (snapshot.size > 0) {
				lastDoc = snapshot.docs[snapshot.docs.length - 1];
			}
		}

		// Also fetch logs where topParentId matches (e.g. consent, page views)
		let topLastDoc: QueryDocumentSnapshot | undefined;
		hasMore = true;

		while (hasMore) {
			const baseConstraints = [
				where('topParentId', '==', questionId),
				orderBy('timestamp', 'asc'),
				limit(EXPORT_BATCH_SIZE),
			];

			const constraints = topLastDoc ? [...baseConstraints, startAfter(topLastDoc)] : baseConstraints;
			const q = query(collection(DB, Collections.researchLogs), ...constraints);
			const snapshot = await getDocs(q);

			snapshot.forEach((doc) => {
				const log = doc.data() as ResearchLog;
				// Avoid duplicates (logs that already matched parentId)
				if (!allLogs.some((existing) => existing.logId === log.logId)) {
					allLogs.push(log);
				}
			});

			hasMore = snapshot.size === EXPORT_BATCH_SIZE;
			if (snapshot.size > 0) {
				topLastDoc = snapshot.docs[snapshot.docs.length - 1];
			}
		}

		allLogs.sort((a, b) => a.timestamp - b.timestamp);

		return allLogs;
	} catch (error) {
		logError(error, {
			operation: 'researchLogger.exportResearchLogsByQuestion',
			metadata: { questionId },
		});

		return [];
	}
}

/**
 * Download research logs for a specific question as a pseudonymized JSON file.
 * Includes a statements lookup with titles so researchers know what was evaluated.
 */
export async function downloadResearchLogsByQuestionAsJSON(questionId: string): Promise<void> {
	const logs = await exportResearchLogsByQuestion(questionId);
	const anonymized = pseudonymizeLogs(logs);
	const statements = await fetchStatementContext(logs);
	const exportData = {
		exportedAt: new Date().toISOString(),
		questionId,
		totalLogs: anonymized.length,
		statements,
		logs: anonymized,
	};
	const filename = `research-logs_question_${new Date().toISOString().slice(0, 10)}.json`;
	downloadFile(JSON.stringify(exportData, null, 2), filename, 'application/json');
}
