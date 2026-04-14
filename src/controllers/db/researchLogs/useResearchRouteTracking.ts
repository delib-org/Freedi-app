import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { logScreenView, logResearchAction } from './researchLogger';
import { ResearchAction, normalizeScreenPath } from '@freedi/shared-types';
import { store } from '@/redux/store';

/**
 * Hook to log screen views for research purposes.
 * Only logs when research mode is enabled on the relevant statement.
 * Normalizes screen paths to prevent tracking real statement IDs.
 */
export function useResearchRouteTracking(): void {
	const location = useLocation();
	const prevPathRef = useRef<string>('');
	const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		const currentPath = location.pathname;
		if (currentPath === prevPathRef.current) return;

		if (retryRef.current) {
			clearTimeout(retryRef.current);
			retryRef.current = null;
		}

		const doLog = () => {
			const userId = store.getState().creator.creator?.uid;
			if (!userId) {
				retryRef.current = setTimeout(doLog, 2000);

				return;
			}

			const statementId = extractStatementId(currentPath);
			const topParentId = resolveTopParentId(statementId);
			const normalizedPath = normalizeScreenPath(currentPath);

			// Log leaving previous screen
			if (prevPathRef.current) {
				const prevStatementId = extractStatementId(prevPathRef.current);
				const prevTopParentId = resolveTopParentId(prevStatementId);
				const prevNormalized = normalizeScreenPath(prevPathRef.current);
				logResearchAction(ResearchAction.LEAVE_SCREEN, {
					screen: prevNormalized,
					...(prevStatementId && { statementId: prevStatementId }),
					...(prevTopParentId && { topParentId: prevTopParentId }),
				}).catch(() => {
					/* handled inside logResearchAction */
				});
			}

			// Log viewing new screen
			logScreenView(normalizedPath, topParentId).catch(() => {
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

function extractStatementId(path: string): string | undefined {
	const match = path.match(/\/(statement|stage|statement-screen)\/([^/]+)/);

	return match?.[2];
}

function resolveTopParentId(statementId: string | undefined): string | undefined {
	if (!statementId) return undefined;

	const statements = store.getState().statements.statements;
	const statement = statements.find((s) => s.statementId === statementId);

	const topParentId = statement?.topParentId;
	if (topParentId && topParentId !== 'top') return topParentId;

	return statementId;
}
