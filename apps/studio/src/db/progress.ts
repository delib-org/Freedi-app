import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { Collections, type QuestionProgress } from '@freedi/shared-types';
import { db } from '@/firebase';
import { useCollection, type SnapshotState } from './hooks';

/** `questionProgress` docs keyed by statementId. */
export type ProgressMap = Record<string, QuestionProgress>;

function toMap(records: QuestionProgress[]): ProgressMap {
	return records.reduce<ProgressMap>((acc, record) => {
		acc[record.statementId] = record;

		return acc;
	}, {});
}

function useProgressMap(
	field: 'topParentId' | 'organizationId',
	value: string | null | undefined,
): SnapshotState<ProgressMap> {
	const q = value
		? query(collection(db, Collections.questionProgress), where(field, '==', value))
		: null;
	const { data, loading, error } = useCollection<QuestionProgress>(
		q,
		`progress:${field}:${value ?? 'none'}`,
	);
	const map = useMemo(() => toMap(data), [data]);

	return { data: map, loading, error };
}

/** Progress of a top question and all its sub-questions. */
export function useQuestionProgressByTop(
	topParentId: string | null | undefined,
): SnapshotState<ProgressMap> {
	return useProgressMap('topParentId', topParentId);
}

/** Progress of every question owned by an organization. */
export function useQuestionProgressByOrg(
	organizationId: string | null | undefined,
): SnapshotState<ProgressMap> {
	return useProgressMap('organizationId', organizationId);
}

export interface ProgressCounts {
	entered: number;
	suggested: number;
	evaluated: number;
	options: number;
	evaluations: number;
	/** Most recent `lastActivity` across the records, 0 when none. */
	lastActivity: number;
}

export const EMPTY_PROGRESS: ProgressCounts = {
	entered: 0,
	suggested: 0,
	evaluated: 0,
	options: 0,
	evaluations: 0,
	lastActivity: 0,
};

/** Sum the funnel counters of several questions (e.g. a whole top question). */
export function sumProgress(records: ProgressMap | QuestionProgress[]): ProgressCounts {
	const list = Array.isArray(records) ? records : Object.values(records);

	return list.reduce<ProgressCounts>(
		(acc, record) => ({
			entered: acc.entered + record.entered,
			suggested: acc.suggested + record.suggested,
			evaluated: acc.evaluated + record.evaluated,
			options: acc.options + record.options,
			evaluations: acc.evaluations + record.evaluations,
			lastActivity: Math.max(acc.lastActivity, record.lastActivity),
		}),
		{ ...EMPTY_PROGRESS },
	);
}
