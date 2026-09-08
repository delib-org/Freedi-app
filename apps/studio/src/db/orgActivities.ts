import { useEffect, useMemo, useRef, useState } from 'react';
import {
	collection,
	documentId,
	onSnapshot,
	query,
	where,
	type FirestoreError,
} from 'firebase/firestore';
import {
	Collections,
	Role,
	StatementType,
	type OrganizationActivity,
	type QuestionProgress,
	type Statement,
	type StatementSubscription,
} from '@freedi/shared-types';
import { db } from '@/firebase';
import { logError } from '@/utils/logError';
import { useCollection, type SnapshotState } from './hooks';
import type { ProgressMap } from './progress';

/**
 * Readers for questions LINKED into an organization — questions that live
 * somewhere else and were added to this board by an admin.
 *
 * Owned questions are found with a single `organizationId` equality query
 * (`useOrgTopQuestions`). Linked ones need two hops: the link records, then
 * the statements they point at, fetched by id in `in` chunks.
 */

/** Firestore caps `in` / `documentId() in` filters at 30 values per query. */
const IN_CHUNK = 30;

function chunk<T>(items: T[], size: number): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));

	return out;
}

/** The organization's link records, newest first. */
export function useOrgActivities(
	organizationId: string | null | undefined,
): SnapshotState<OrganizationActivity[]> {
	const q = organizationId
		? query(
				collection(db, Collections.organizationActivities),
				where('organizationId', '==', organizationId),
			)
		: null;
	const { data, loading, error } = useCollection<OrganizationActivity>(
		q,
		`orgActivities:${organizationId ?? 'none'}`,
	);
	const sorted = useMemo(() => [...data].sort((a, b) => b.addedAt - a.addedAt), [data]);

	return { data: sorted, loading, error };
}

/**
 * Live statements by id. Ids are joined into the subscription key so the
 * listeners are rebuilt when the set changes, and each 30-id chunk gets its
 * own `documentId() in` listener.
 */
export function useStatementsByIds(ids: string[]): SnapshotState<Statement[]> {
	const key = useMemo(() => [...ids].sort().join(','), [ids]);
	const idsRef = useRef(ids);
	idsRef.current = ids;

	const [state, setState] = useState<SnapshotState<Statement[]>>({
		data: [],
		loading: ids.length > 0,
		error: null,
	});

	useEffect(() => {
		const current = idsRef.current;
		if (current.length === 0) {
			setState({ data: [], loading: false, error: null });

			return;
		}

		const groups = chunk(current, IN_CHUNK);
		const perGroup: Statement[][] = groups.map(() => []);
		const settled = groups.map(() => false);

		const publish = () => {
			setState({
				data: perGroup.flat(),
				loading: settled.some((done) => !done),
				error: null,
			});
		};

		const unsubscribes = groups.map((group, index) =>
			onSnapshot(
				query(collection(db, Collections.statements), where(documentId(), 'in', group)),
				(snap) => {
					perGroup[index] = snap.docs.map((d) => d.data() as Statement);
					settled[index] = true;
					publish();
				},
				(error: FirestoreError) => {
					logError(error, { operation: 'db.useStatementsByIds', metadata: { key } });
					settled[index] = true;
					setState((prev) => ({ ...prev, loading: false, error }));
				},
			),
		);

		return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
	}, [key]);

	return state;
}

/**
 * Progress records for several top questions at once — the linked-question
 * counterpart of `useQuestionProgressByOrg`, which only finds questions the
 * organization owns. Each chunk listens on `topParentId in [...]`, so a linked
 * question's own record and its activities' records both arrive.
 */
export function useQuestionProgressByTops(topParentIds: string[]): SnapshotState<ProgressMap> {
	const key = useMemo(() => [...topParentIds].sort().join(','), [topParentIds]);
	const idsRef = useRef(topParentIds);
	idsRef.current = topParentIds;

	const [state, setState] = useState<SnapshotState<ProgressMap>>({
		data: {},
		loading: topParentIds.length > 0,
		error: null,
	});

	useEffect(() => {
		const current = idsRef.current;
		if (current.length === 0) {
			setState({ data: {}, loading: false, error: null });

			return;
		}

		const groups = chunk(current, IN_CHUNK);
		const perGroup: QuestionProgress[][] = groups.map(() => []);
		const settled = groups.map(() => false);

		const publish = () => {
			const map: ProgressMap = {};
			perGroup.flat().forEach((record) => {
				map[record.statementId] = record;
			});
			setState({ data: map, loading: settled.some((done) => !done), error: null });
		};

		const unsubscribes = groups.map((group, index) =>
			onSnapshot(
				query(collection(db, Collections.questionProgress), where('topParentId', 'in', group)),
				(snap) => {
					perGroup[index] = snap.docs.map((d) => d.data() as QuestionProgress);
					settled[index] = true;
					publish();
				},
				(error: FirestoreError) => {
					logError(error, { operation: 'db.useQuestionProgressByTops', metadata: { key } });
					settled[index] = true;
					setState((prev) => ({ ...prev, loading: false, error }));
				},
			),
		);

		return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
	}, [key]);

	return state;
}

/**
 * The link record for one question on one board, or `null` when the question
 * is the organization's own rather than linked.
 *
 * Filtered out of the org's link list rather than fetched by id: most questions
 * have no link record, and a `get` on a document that does not exist is a
 * failed read, not an empty one — the rule cannot evaluate `resource.data` on a
 * null resource. The list is one small collection the board already reads.
 */
export function useOrgActivity(
	organizationId: string | null | undefined,
	statementId: string | null | undefined,
): SnapshotState<OrganizationActivity | null> {
	const { data, loading, error } = useOrgActivities(organizationId);
	const activity = useMemo(
		() => data.find((record) => record.statementId === statementId) ?? null,
		[data, statementId],
	);

	return { data: statementId ? activity : null, loading, error };
}

/** A question the signed-in user administers, as offered by the "add existing" picker. */
export interface LinkableQuestion {
	statementId: string;
	title: string;
	/** True when the question is a top-level one (not an activity under another). */
	isTopLevel: boolean;
	createdAt: number;
}

/**
 * Questions the signed-in user may hand to an organization: the ones they hold
 * an admin or creator subscription on.
 *
 * Read from `statementsSubscribe` alone — each subscription carries a
 * denormalized copy of the statement, so the picker needs no statement reads
 * and no server round-trip. The copy can be stale in its title; the link
 * callable re-reads the real statement before writing anything.
 */
export function useLinkableQuestions(
	userId: string | null | undefined,
): SnapshotState<LinkableQuestion[]> {
	const q = userId
		? query(collection(db, Collections.statementsSubscribe), where('userId', '==', userId))
		: null;
	const { data, loading, error } = useCollection<StatementSubscription>(
		q,
		`myAdminSubs:${userId ?? 'none'}`,
	);

	const questions = useMemo(() => {
		const seen = new Set<string>();

		return data
			.filter(
				(sub) =>
					(sub.role === Role.admin || sub.role === Role.creator) &&
					sub.statement?.statementType === StatementType.question,
			)
			.filter((sub) => {
				if (seen.has(sub.statementId)) return false;
				seen.add(sub.statementId);

				return true;
			})
			.map<LinkableQuestion>((sub) => ({
				statementId: sub.statementId,
				title: sub.statement?.statement ?? sub.statementId,
				isTopLevel: (sub.parentId ?? sub.statement?.parentId) === 'top',
				createdAt: sub.statement?.createdAt ?? sub.createdAt ?? 0,
			}))
			.sort((a, b) => b.createdAt - a.createdAt);
	}, [data]);

	return { data: questions, loading, error };
}
