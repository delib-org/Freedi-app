import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { logScreenView, logResearchAction } from './researchLogger';
import { ResearchAction } from '@freedi/shared-types';
import { store } from '@/redux/store';

/**
 * Hook to log screen views for research purposes.
 * Resolves the actual topParentId from Redux state.
 * Retries if the user isn't authenticated yet.
 */
export function useResearchRouteTracking(): void {
	const location = useLocation();
	const prevPathRef = useRef<string>('');
	const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const currentPath = location.pathname;
		if (currentPath === prevPathRef.current) return;

		// Clear any pending retry
		if (retryRef.current) {
			clearTimeout(retryRef.current);
			retryRef.current = null;
		}

		const doLog = () => {
			const userId = store.getState().creator.creator?.uid;
			if (!userId) {
				// User not authenticated yet — retry once after auth likely completes
				retryRef.current = setTimeout(doLog, 2000);

				return;
			}

			const statementId = extractStatementId(currentPath);
			const topParentId = resolveTopParentId(statementId);

			// Log leaving previous screen
			if (prevPathRef.current) {
				const prevStatementId = extractStatementId(prevPathRef.current);
				const prevTopParentId = resolveTopParentId(prevStatementId);
				logResearchAction(ResearchAction.LEAVE_SCREEN, {
					screen: prevPathRef.current,
					statementId: prevStatementId,
					topParentId: prevTopParentId,
				}).catch(() => {
					/* handled inside logResearchAction */
				});
			}

			// Log viewing new screen
			logScreenView(currentPath, topParentId).catch(() => {
				/* handled inside logResearchAction */
			});
		};

		doLog();
		prevPathRef.current = currentPath;

		return () => {
			if (retryRef.current) {
				clearTimeout(retryRef.current);
				retryRef.current = null;
			}
		};
	}, [location.pathname]);
}

/**
 * Extract statementId from URL patterns like /statement/:id, /stage/:id, etc.
 */
function extractStatementId(path: string): string | undefined {
	const match = path.match(/\/(statement|stage|statement-screen)\/([^/]+)/);

	return match?.[2];
}

/**
 * Look up the actual topParentId from Redux state.
 * Falls back to the statementId itself if not found in store.
 */
function resolveTopParentId(statementId: string | undefined): string | undefined {
	if (!statementId) return undefined;

	const statements = store.getState().statements.statements;
	const statement = statements.find((s) => s.statementId === statementId);

	const topParentId = statement?.topParentId;
	if (topParentId && topParentId !== 'top') return topParentId;

	return statementId;
}
