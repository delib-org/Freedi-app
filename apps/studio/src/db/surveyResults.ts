import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, onSnapshot, query, where, type FirestoreError } from 'firebase/firestore';
import { Collections, type Statement } from '@freedi/shared-types';
import { db } from '@/firebase';
import { logError } from '@/utils/logError';
import type { SnapshotState } from './hooks';

/**
 * Read-only: live children of several parent questions. Only `onSnapshot`
 * reads live here — the survey Results screen must not be able to write.
 */

/** Firestore caps `in` filters at 30 values per query. */
const IN_CHUNK = 30;

export function useChildrenOfParents(parentIds: string[]): SnapshotState<Statement[]> {
	const key = useMemo(() => [...parentIds].sort().join(','), [parentIds]);
	const idsRef = useRef(parentIds);
	idsRef.current = parentIds;

	const [state, setState] = useState<SnapshotState<Statement[]>>({
		data: [],
		loading: parentIds.length > 0,
		error: null,
	});

	useEffect(() => {
		const ids = idsRef.current;
		if (ids.length === 0) {
			setState({ data: [], loading: false, error: null });

			return;
		}

		const groups: string[][] = [];
		for (let i = 0; i < ids.length; i += IN_CHUNK) groups.push(ids.slice(i, i + IN_CHUNK));
		const perGroup: Statement[][] = groups.map(() => []);
		const settled = groups.map(() => false);

		const unsubscribes = groups.map((group, index) =>
			onSnapshot(
				query(collection(db, Collections.statements), where('parentId', 'in', group)),
				(snap) => {
					perGroup[index] = snap.docs.map((d) => d.data() as Statement);
					settled[index] = true;
					setState({
						data: perGroup.flat(),
						loading: settled.some((done) => !done),
						error: null,
					});
				},
				(error: FirestoreError) => {
					logError(error, { operation: 'surveyResults.useChildrenOfParents', metadata: { key } });
					settled[index] = true;
					setState((prev) => ({ ...prev, loading: false, error }));
				},
			),
		);

		return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
	}, [key]);

	return state;
}
