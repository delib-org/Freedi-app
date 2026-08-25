import { useEffect, useRef, useState } from 'react';
import {
	onSnapshot,
	type DocumentData,
	type DocumentReference,
	type FirestoreError,
	type Query,
} from 'firebase/firestore';
import { logError } from '@/utils/logError';

/**
 * Generic `onSnapshot` hooks.
 *
 * Firestore refs/queries are rebuilt on every render, so the subscription is
 * keyed by the caller-supplied `key` string (e.g. `statement:${id}`) instead of
 * by object identity. The latest ref is read from a mutable ref inside the
 * effect, so callers never need to memoize the query themselves.
 */
export interface SnapshotState<T> {
	data: T;
	loading: boolean;
	error: FirestoreError | null;
}

export function useDoc<T>(
	ref: DocumentReference<DocumentData> | null,
	key: string,
): SnapshotState<T | null> {
	const latestRef = useRef(ref);
	latestRef.current = ref;
	const isNull = ref === null;

	const [state, setState] = useState<SnapshotState<T | null>>({
		data: null,
		loading: !isNull,
		error: null,
	});

	useEffect(() => {
		const current = latestRef.current;
		if (!current) {
			setState({ data: null, loading: false, error: null });

			return;
		}

		setState((prev) => ({ ...prev, loading: true, error: null }));
		const unsubscribe = onSnapshot(
			current,
			(snap) => {
				setState({ data: snap.exists() ? (snap.data() as T) : null, loading: false, error: null });
			},
			(error) => {
				logError(error, { operation: 'db.useDoc', metadata: { key } });
				setState({ data: null, loading: false, error });
			},
		);

		return () => unsubscribe();
	}, [key, isNull]);

	return state;
}

export function useCollection<T>(
	query: Query<DocumentData> | null,
	key: string,
): SnapshotState<T[]> {
	const latestQuery = useRef(query);
	latestQuery.current = query;
	const isNull = query === null;

	const [state, setState] = useState<SnapshotState<T[]>>({
		data: [],
		loading: !isNull,
		error: null,
	});

	useEffect(() => {
		const current = latestQuery.current;
		if (!current) {
			setState({ data: [], loading: false, error: null });

			return;
		}

		setState((prev) => ({ ...prev, loading: true, error: null }));
		const unsubscribe = onSnapshot(
			current,
			(snap) => {
				setState({ data: snap.docs.map((d) => d.data() as T), loading: false, error: null });
			},
			(error) => {
				logError(error, { operation: 'db.useCollection', metadata: { key } });
				setState({ data: [], loading: false, error });
			},
		);

		return () => unsubscribe();
	}, [key, isNull]);

	return state;
}
