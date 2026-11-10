import { useEffect, useState } from 'react';
import { QuestionProgress } from '@freedi/shared-types';
import { getQuestionProgress } from '@/controllers/db/questionProgress/getQuestionProgress';
import { shouldRefreshProgress } from '@/helpers/participationVisibility';

interface ProgressRead {
	startedAt: number;
	result: Promise<QuestionProgress | null>;
}

/** Per question, shared by the overview and Results, so opening both is one read. */
const lastRead = new Map<string, ProgressRead>();

function readProgress(statementId: string, now: number): Promise<QuestionProgress | null> {
	const previous = lastRead.get(statementId);
	if (previous && !shouldRefreshProgress(previous.startedAt, now)) return previous.result;

	const result = getQuestionProgress(statementId);
	lastRead.set(statementId, { startedAt: now, result });

	return result;
}

/**
 * A question's group progress: read on open and after the viewer's own action
 * (a change of `actionKey`), at most once a minute. Pass no id to skip the read.
 */
export function useQuestionProgress(
	statementId: string | undefined,
	actionKey: string,
): QuestionProgress | null {
	const [progress, setProgress] = useState<QuestionProgress | null>(null);

	useEffect(() => {
		if (!statementId) {
			setProgress(null);

			return;
		}
		let cancelled = false;
		void readProgress(statementId, Date.now()).then((value) => {
			if (!cancelled) setProgress(value);
		});

		return () => {
			cancelled = true;
		};
	}, [statementId, actionKey]);

	return progress;
}
