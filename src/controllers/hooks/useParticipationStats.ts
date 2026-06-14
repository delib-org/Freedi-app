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
import { FirebaseError } from 'firebase/app';
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
 * Pipeline-derived option detection (cluster/synthesis spawns are stored with
 * statementType: option). Mirrors `isDerivedStatement` in the MC app so all
 * participation surfaces count the same set of genuine submissions.
 */
function isDerivedOption(statement: Statement): boolean {
	return (
		statement.isCluster === true ||
		!!statement.derivedByPipeline ||
		(Array.isArray(statement.integratedOptions) && statement.integratedOptions.length > 0) ||
		!!statement.synthesisRunId ||
		!!statement.synthesisMechanism ||
		statement.statementType === StatementType.synthesis
	);
}

/**
 * A `permission-denied` here means the auth session changed between the
 * read firing and landing (sign-in not yet hydrated, sign-out, account
 * switch). These stats are best-effort and not actionable, so keep the
 * expected session race out of Sentry while still surfacing real errors.
 */
function isAuthRace(error: unknown): boolean {
	if (error instanceof FirebaseError && error.code === 'permission-denied') {
		console.info('[useParticipationStats] Skipped read: auth session not ready');

		return true;
	}

	return false;
}

/**
 * Participation funnel for a question: entered → suggested → evaluated.
 *
 * Definitions are aligned with the MC stats API and survey admin panel:
 * - suggested: distinct creators of genuine option sub-statements (from
 *   Redux, excluding pipeline-derived cluster/synthesis docs).
 * - evaluated: distinct users who ACTIVELY rated a solution (evaluation rows
 *   with an `evaluator` object; rows with only `evaluatorId` are the auto +1
 *   self-vote on submission).
 * - entered: count of statementViews docs (one per user per question), never
 *   below the union of known participants; also records the current user's
 *   own entry, fire-and-forget.
 */
export function useParticipationStats(
	statement: Statement | undefined,
	options: Statement[],
): ParticipationStats {
	const creator = useSelector(creatorSelector);
	const [evaluated, setEvaluated] = useState(0);
	const [allEvaluatorIds, setAllEvaluatorIds] = useState<Set<string>>(new Set());
	const [viewsCount, setViewsCount] = useState(0);

	const statementId = statement?.statementId;
	const isQuestion = statement?.statementType === StatementType.question;

	const suggesterIds = useMemo(() => {
		return new Set(
			options
				.filter((o) => !isDerivedOption(o))
				.map((o) => o.creatorId || o.creator?.uid)
				.filter((id): id is string => !!id),
		);
	}, [options]);
	const suggested = suggesterIds.size;

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

	// Fetch distinct evaluators and unique-entrant count (once per question).
	// These reads require an authenticated session; wait for the auth token to
	// hydrate (creator.uid) before querying so we don't fire during the
	// sign-in race and trip Firestore's permission rules.
	useEffect(() => {
		if (!statementId || !isQuestion || !creator?.uid) return;
		let cancelled = false;

		const evaluationsQuery = query(
			collection(FireStore, Collections.evaluations),
			where('parentId', '==', statementId),
		);
		getDocs(evaluationsQuery)
			.then((snapshot) => {
				if (cancelled) return;
				const explicitEvaluators = new Set<string>();
				const allEvaluators = new Set<string>();
				snapshot.docs.forEach((d) => {
					const evaluation = d.data() as Evaluation;
					if (evaluation.evaluatorId) allEvaluators.add(evaluation.evaluatorId);
					if (evaluation.evaluator?.uid) explicitEvaluators.add(evaluation.evaluator.uid);
				});
				setEvaluated(explicitEvaluators.size);
				setAllEvaluatorIds(allEvaluators);
			})
			.catch((error) => {
				if (isAuthRace(error)) return;
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
				if (isAuthRace(error)) return;
				logError(error, {
					operation: 'useParticipationStats.countViews',
					statementId,
				});
			});

		return () => {
			cancelled = true;
		};
	}, [statementId, isQuestion, creator?.uid]);

	// View tracking started mid-project: never report fewer entrants than
	// the union of people we know participated (any evaluation row, including
	// the auto +1 self-vote, or a genuine submission).
	const participants = useMemo(() => {
		const union = new Set(allEvaluatorIds);
		suggesterIds.forEach((id) => union.add(id));

		return union.size;
	}, [allEvaluatorIds, suggesterIds]);

	const entered = Math.max(viewsCount, participants);

	return { entered: viewsCount > 0 ? entered : 0, suggested, evaluated };
}
