import { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
	collection,
	doc,
	getCountFromServer,
	getDocs,
	increment,
	query,
	setDoc,
	where,
} from 'firebase/firestore';
import { Statement, StatementType, Collections, Evaluation } from '@freedi/shared-types';
import { FireStore } from '@/controllers/db/config';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { logError } from '@/utils/errorHandling';
import { getCurrentTimestamp } from '@/utils/firebaseUtils';

export interface ParticipationStats {
	/** Unique users who entered the question (0 until view tracking has data) */
	entered: number;
	/** Unique users who suggested options */
	suggested: number;
	/** Unique users who evaluated options */
	evaluated: number;
}

/**
 * Participation funnel for a question: entered → suggested → evaluated.
 *
 * - suggested: distinct creators of the option sub-statements (from Redux).
 * - evaluated: distinct evaluatorIds in the evaluations collection (one fetch).
 * - entered: count of statementViews docs (one per user per question); also
 *   records the current user's own entry, fire-and-forget.
 */
export function useParticipationStats(
	statement: Statement | undefined,
	options: Statement[],
): ParticipationStats {
	const creator = useSelector(creatorSelector);
	const [evaluated, setEvaluated] = useState(0);
	const [viewsCount, setViewsCount] = useState(0);

	const statementId = statement?.statementId;
	const isQuestion = statement?.statementType === StatementType.question;

	const suggested = useMemo(() => {
		const suggesters = new Set(
			options.map((o) => o.creatorId || o.creator?.uid).filter((id): id is string => !!id),
		);

		return suggesters.size;
	}, [options]);

	// Record that the current user entered this question (idempotent doc id)
	useEffect(() => {
		if (!statementId || !isQuestion || !creator?.uid) return;

		const viewRef = doc(FireStore, Collections.statementViews, `${creator.uid}--${statementId}`);
		setDoc(
			viewRef,
			{
				statementId,
				userId: creator.uid,
				viewed: increment(1),
				lastViewed: getCurrentTimestamp(),
				parentDocumentId: statement?.topParentId ?? statementId,
			},
			{ merge: true },
		).catch((error) => {
			logError(error, {
				operation: 'useParticipationStats.recordView',
				userId: creator.uid,
				statementId,
			});
		});
	}, [statementId, isQuestion, creator?.uid]);

	// Fetch distinct evaluators and unique-entrant count (once per question)
	useEffect(() => {
		if (!statementId || !isQuestion) return;
		let cancelled = false;

		const evaluationsQuery = query(
			collection(FireStore, Collections.evaluations),
			where('parentId', '==', statementId),
		);
		getDocs(evaluationsQuery)
			.then((snapshot) => {
				if (cancelled) return;
				const evaluators = new Set(
					snapshot.docs.map((d) => (d.data() as Evaluation).evaluatorId).filter(Boolean),
				);
				setEvaluated(evaluators.size);
			})
			.catch((error) => {
				logError(error, {
					operation: 'useParticipationStats.fetchEvaluators',
					statementId,
				});
			});

		const viewsQuery = query(
			collection(FireStore, Collections.statementViews),
			where('statementId', '==', statementId),
		);
		getCountFromServer(viewsQuery)
			.then((snapshot) => {
				if (cancelled) return;
				setViewsCount(snapshot.data().count);
			})
			.catch((error) => {
				logError(error, {
					operation: 'useParticipationStats.countViews',
					statementId,
				});
			});

		return () => {
			cancelled = true;
		};
	}, [statementId, isQuestion]);

	// View tracking started mid-project: never report fewer entrants than
	// the people we know participated.
	const entered = Math.max(viewsCount, suggested > evaluated ? suggested : evaluated);

	return { entered: viewsCount > 0 ? entered : 0, suggested, evaluated };
}
