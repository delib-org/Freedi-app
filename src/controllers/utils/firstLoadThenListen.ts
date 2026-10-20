import { getDocs, limit, query } from 'firebase/firestore';
import type { DocumentData, Query, QueryDocumentSnapshot, QuerySnapshot } from 'firebase/firestore';
import { FIREBASE } from '@/constants/common';
import { logError } from '@/utils/errorHandling';
import { subscribeWhenAuthenticated } from './subscribeWhenAuthenticated';

interface FirstLoadOptions {
	/** Same query the live listener uses (same filters and ordering). */
	queryRef: Query;
	/** Receives the first bounded page as soon as it arrives. Must be an idempotent upsert. */
	onFirstDocs: (docs: QueryDocumentSnapshot<DocumentData>[]) => void;
	/** The live listener's snapshot handler. */
	onSnapshotNext: (snapshot: QuerySnapshot) => void;
	/** Used in error context. */
	operation: string;
	limitCount?: number;
}

interface FirstLoadHandle {
	/** Wrap this around the live listener's handler. */
	onNext: (snapshot: QuerySnapshot) => void;
	/** Cancels a still-pending first page read. */
	cancel: () => void;
}

/**
 * Fires a one-time bounded getDocs (limit 10) for the same query a live
 * onSnapshot listener will use, so the first items reach Redux without waiting
 * for the full listener snapshot. The live listener keeps delivering everything
 * and all later changes.
 *
 * The first page is dropped when the live snapshot has already arrived (it is
 * always at least as fresh), so it can never overwrite newer data.
 */
export function firstLoadThenListen(options: FirstLoadOptions): FirstLoadHandle {
	const { queryRef, onFirstDocs, onSnapshotNext, operation, limitCount } = options;
	let liveArrived = false;
	let cancelled = false;

	const stopAuthWait = subscribeWhenAuthenticated(() => {
		getDocs(query(queryRef, limit(limitCount ?? FIREBASE.FIRST_LOAD_LIMIT)))
			.then((snapshot) => {
				if (liveArrived || cancelled || snapshot.empty) return;
				onFirstDocs(snapshot.docs);
			})
			.catch((error) => {
				// The live listener is still running; a failed head start costs nothing.
				logError(error, { operation: `${operation}.firstLoad` });
			});

		return () => {};
	});

	return {
		onNext: (snapshot) => {
			liveArrived = true;
			onSnapshotNext(snapshot);
		},
		cancel: () => {
			cancelled = true;
			stopAuthWait();
		},
	};
}
