import { useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from './reduxHooks';
import { setStatement } from '@/redux/statements/statementsSlice';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { Statement, StatementSubscription } from '@freedi/shared-types';
import { logError } from '@/utils/errorHandling';

/**
 * Non-blocking hook that fetches fresh Statement data for home page subscriptions.
 *
 * The subscription documents contain a "snapshot" of the statement from creation time.
 * This hook overlays fresh data from the statements collection into Redux,
 * so selectors and components can display up-to-date titles and content.
 *
 * The home page renders instantly from subscription snapshots — this hook
 * fills in fresh data in the background without blocking render.
 */
export function useHomeStatementOverlay(subscriptions: StatementSubscription[]): void {
	const dispatch = useAppDispatch();
	const statements = useAppSelector(
		(state) => state.statements.statements,
	);
	const fetchedRef = useRef(new Set<string>());

	useEffect(() => {
		if (subscriptions.length === 0) return;

		const statementsMap = new Map<string, Statement>(
			statements.map((s) => [s.statementId, s]),
		);

		// Find subscription statementIds not yet in Redux and not already being fetched
		const missingIds = subscriptions
			.map((sub) => sub.statementId)
			.filter(
				(id) => !statementsMap.has(id) && !fetchedRef.current.has(id),
			);

		if (missingIds.length === 0) return;

		// Mark as being fetched to avoid duplicate requests
		missingIds.forEach((id) => fetchedRef.current.add(id));

		// Fetch in parallel, non-blocking
		Promise.all(
			missingIds.map(async (statementId) => {
				try {
					const statement = await getStatementFromDB(statementId);
					if (statement) {
						dispatch(setStatement(statement));
					}
				} catch (error) {
					logError(error, {
						operation: 'hooks.useHomeStatementOverlay',
						statementId,
					});
				}
			}),
		).catch((error) => {
			logError(error, {
				operation: 'hooks.useHomeStatementOverlay.batch',
			});
		});
	}, [subscriptions, statements, dispatch]);
}
