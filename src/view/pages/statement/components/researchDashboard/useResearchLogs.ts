import { useEffect, useRef, useState, useCallback } from 'react';
import { onSnapshot, query, where, orderBy, limit, collection } from 'firebase/firestore';
import { DB } from '@/controllers/db/config';
import {
	Collections,
	ResearchAction,
	RESEARCH_GLOBAL_ACTIONS,
	getResearchCategory,
} from '@freedi/shared-types';
import type { ResearchLog, ResearchCategory } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

export interface ResearchStats {
	totalActions: number;
	uniqueUsers: Set<string>;
	logins: number;
	evaluations: number;
	statements: number;
	votes: number;
	screenViews: number;
	proposals: number;
	byApp: Record<string, number>;
	byAction: Record<string, number>;
	actionsPerMinute: number;
	recentLogs: ResearchLog[];
	/** Timestamp of the most recent action */
	lastActivityAt: number;
	/** New logs that just arrived (for animation triggers) */
	newLogIds: Set<string>;
}

const INITIAL_STATS: ResearchStats = {
	totalActions: 0,
	uniqueUsers: new Set(),
	logins: 0,
	evaluations: 0,
	statements: 0,
	votes: 0,
	screenViews: 0,
	proposals: 0,
	byApp: {},
	byAction: {},
	actionsPerMinute: 0,
	recentLogs: [],
	lastActivityAt: 0,
	newLogIds: new Set(),
};

const RECENT_LOGS_LIMIT = 50;
const RATE_WINDOW_MS = 60_000;

function categorizeAction(action: string): ResearchCategory | null {
	return getResearchCategory(action);
}

export type ResearchScope = 'all' | 'parent';

/**
 * Real-time hook that listens to researchLogs.
 * - scope 'all': shows all logs under topParentId (entire discussion tree)
 * - scope 'parent': shows only logs where parentId matches the given parentId
 */
export function useResearchLogs(
	topParentId: string | undefined,
	scope: ResearchScope = 'all',
	parentId?: string,
): {
	stats: ResearchStats;
	loading: boolean;
	error: string | null;
} {
	const [stats, setStats] = useState<ResearchStats>(INITIAL_STATS);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const knownLogIds = useRef(new Set<string>());
	const isFirstSnapshot = useRef(true);

	const computeStats = useCallback(
		(logs: ResearchLog[], prevKnown: Set<string>, isFirst: boolean): ResearchStats => {
			const newStats: ResearchStats = {
				...INITIAL_STATS,
				uniqueUsers: new Set(),
				byApp: {},
				byAction: {},
				recentLogs: [],
				newLogIds: new Set(),
			};

			const now = Date.now();

			let recentActionCount = 0;

			for (const log of logs) {
				newStats.totalActions++;
				newStats.uniqueUsers.add(log.userId);

				// Category counts
				const category = categorizeAction(log.action);
				if (category) {
					newStats[category]++;
				}

				// By app
				const app = log.sourceApp || 'unknown';
				newStats.byApp[app] = (newStats.byApp[app] || 0) + 1;

				// By action
				newStats.byAction[log.action] = (newStats.byAction[log.action] || 0) + 1;

				// Rate calculation
				if (now - log.timestamp < RATE_WINDOW_MS) {
					recentActionCount++;
				}

				// Track last activity
				if (log.timestamp > newStats.lastActivityAt) {
					newStats.lastActivityAt = log.timestamp;
				}

				// Mark new logs for animation (skip on first load)
				if (!isFirst && !prevKnown.has(log.logId)) {
					newStats.newLogIds.add(log.logId);
				}
			}

			newStats.actionsPerMinute = recentActionCount;
			newStats.recentLogs = logs.slice(-RECENT_LOGS_LIMIT).reverse();

			return newStats;
		},
		[],
	);

	// Store logs from both listeners and merge
	const scopedLogsRef = useRef<ResearchLog[]>([]);
	const globalLogsRef = useRef<ResearchLog[]>([]);
	const pendingRef = useRef(2); // wait for both listeners on first load

	const mergeAndCompute = useCallback(() => {
		// Merge scoped + global logs, deduplicate by logId, sort by timestamp
		const merged = new Map<string, ResearchLog>();
		for (const log of scopedLogsRef.current) merged.set(log.logId, log);
		for (const log of globalLogsRef.current) merged.set(log.logId, log);
		const allLogs = Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp);

		const computed = computeStats(allLogs, knownLogIds.current, isFirstSnapshot.current);
		setStats(computed);

		knownLogIds.current = new Set(allLogs.map((l) => l.logId));
		isFirstSnapshot.current = false;

		pendingRef.current = Math.max(pendingRef.current - 1, 0);
		if (pendingRef.current === 0) {
			setLoading(false);
			setError(null);
		}
	}, [computeStats]);

	// Recompute stats every 60s so actionsPerMinute stays accurate
	useEffect(() => {
		const interval = setInterval(() => {
			if (!isFirstSnapshot.current) {
				mergeAndCompute();
			}
		}, RATE_WINDOW_MS);

		return () => clearInterval(interval);
	}, [mergeAndCompute]);

	// Listener 1: scoped logs (by topParentId or parentId)
	useEffect(() => {
		const filterValue = scope === 'parent' ? parentId : topParentId;
		if (!filterValue) {
			scopedLogsRef.current = [];
			setLoading(false);

			return;
		}

		isFirstSnapshot.current = true;
		knownLogIds.current = new Set();
		pendingRef.current = 2;

		const filterField = scope === 'parent' ? 'parentId' : 'topParentId';
		const q = query(
			collection(DB, Collections.researchLogs),
			where(filterField, '==', filterValue),
			orderBy('timestamp', 'asc'),
			limit(5000),
		);

		const unsubscribe = onSnapshot(
			q,
			(snapshot) => {
				const logs: ResearchLog[] = [];
				snapshot.forEach((doc) => {
					logs.push(doc.data() as ResearchLog);
				});
				scopedLogsRef.current = logs;
				mergeAndCompute();
			},
			(err) => {
				logError(err, {
					operation: 'useResearchLogs.onSnapshot.scoped',
					metadata: { topParentId },
				});
				setError('Failed to load research logs');
				setLoading(false);
			},
		);

		return () => unsubscribe();
	}, [topParentId, scope, parentId, mergeAndCompute]);

	// Listener 2: global events (login/logout) — no topParentId filter
	useEffect(() => {
		if (scope === 'parent') {
			// In parent-scoped view, skip global events
			globalLogsRef.current = [];
			pendingRef.current = Math.max(pendingRef.current - 1, 0);

			return;
		}

		const globalActions = RESEARCH_GLOBAL_ACTIONS;

		const q = query(
			collection(DB, Collections.researchLogs),
			where('action', 'in', globalActions),
			orderBy('timestamp', 'asc'),
			limit(2000),
		);

		const unsubscribe = onSnapshot(
			q,
			(snapshot) => {
				const logs: ResearchLog[] = [];
				snapshot.forEach((doc) => {
					logs.push(doc.data() as ResearchLog);
				});
				globalLogsRef.current = logs;
				mergeAndCompute();
			},
			(err) => {
				logError(err, {
					operation: 'useResearchLogs.onSnapshot.global',
				});
				// Non-critical — don't block the dashboard
				pendingRef.current = Math.max(pendingRef.current - 1, 0);
			},
		);

		return () => unsubscribe();
	}, [scope, mergeAndCompute]);

	return { stats, loading, error };
}
