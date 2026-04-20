import { useEffect, useMemo, useState } from 'react';
import { getDocs, query, where, documentId } from 'firebase/firestore';
import { Statement, StatementSchema } from '@freedi/shared-types';
import { safeParse } from 'valibot';
import { createCollectionRef } from '@/utils/firebaseUtils';
import { Collections } from '@freedi/shared-types';
import { CONDENSATION } from '@/constants/common';
import { logError } from '@/utils/errorHandling';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import type { RootState } from '@/redux/store';

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		out.push(items.slice(i, i + size));
	}

	return out;
}

/**
 * Lazy-fetch the original statements that a cluster's `integratedOptions`
 * references. Uses batched `where(documentId(), 'in', ...)` queries.
 *
 * In "both" mode the originals are already in Redux (they render as peer
 * cards), so this hook first checks the Redux store. Only missing IDs are
 * fetched from Firestore. This keeps drill-down fast for the common case
 * and correct for clusters-only mode where originals aren't pre-fetched.
 */
export function useGroupMembers(clusterId: string | undefined, enabled: boolean) {
	const [fetchedMembers, setFetchedMembers] = useState<Statement[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const cluster = useAppSelector((state: RootState) =>
		state.statements.statements.find((s) => s.statementId === clusterId),
	);
	const integratedOptions = useMemo(() => cluster?.integratedOptions ?? [], [cluster]);

	const storeMembers = useAppSelector((state: RootState) =>
		integratedOptions
			.map((id) => state.statements.statements.find((s) => s.statementId === id))
			.filter((s): s is Statement => Boolean(s)),
	);

	const missingIds = useMemo(() => {
		const inStoreIds = new Set(storeMembers.map((s) => s.statementId));

		return integratedOptions.filter((id) => !inStoreIds.has(id));
	}, [integratedOptions, storeMembers]);

	useEffect(() => {
		if (!enabled || !clusterId || missingIds.length === 0) {
			setFetchedMembers([]);

			return;
		}

		let cancelled = false;
		setIsLoading(true);
		setError(null);

		(async () => {
			try {
				const collectionRef = createCollectionRef(Collections.statements);
				const chunks = chunk(missingIds, CONDENSATION.DRILL_BATCH_SIZE);
				const results: Statement[] = [];
				for (const ids of chunks) {
					const q = query(collectionRef, where(documentId(), 'in', ids));
					const snap = await getDocs(q);
					snap.forEach((d) => {
						const parsed = safeParse(StatementSchema, d.data());
						if (parsed.success) {
							results.push(parsed.output);
						}
					});
				}
				if (!cancelled) {
					setFetchedMembers(results);
					setIsLoading(false);
				}
			} catch (err) {
				logError(err, {
					operation: 'useGroupMembers',
					statementId: clusterId,
					metadata: { missingCount: missingIds.length },
				});
				if (!cancelled) {
					setError(err instanceof Error ? err : new Error(String(err)));
					setIsLoading(false);
				}
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [enabled, clusterId, missingIds]);

	const members = useMemo(
		() => [...storeMembers, ...fetchedMembers],
		[storeMembers, fetchedMembers],
	);

	return { members, isLoading, error };
}
