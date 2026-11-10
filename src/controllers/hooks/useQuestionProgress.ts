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

export interface QuestionProgressRead {
	progress: QuestionProgress | null;
	/** False only while a read for this question is still on its way. */
	isLoaded: boolean;
}

/**
 * A question's group progress: read on open and after the viewer's own action
 * (a change of `actionKey`), at most once a minute. Pass no id to skip the read.
 */
export function useQuestionProgressRead(
	statementId: string | undefined,
	actionKey: string,
): QuestionProgressRead {
	const [read, setRead] = useState<{
		statementId: string;
		progress: QuestionProgress | null;
	} | null>(null);

	useEffect(() => {
		if (!statementId) {
			setRead(null);

			return;
		}
		let cancelled = false;
		void readProgress(statementId, Date.now()).then((progress) => {
			if (!cancelled) setRead({ statementId, progress });
		});

		return () => {
			cancelled = true;
		};
	}, [statementId, actionKey]);

	if (!statementId) return { progress: null, isLoaded: true };
	if (read?.statementId !== statementId) return { progress: null, isLoaded: false };

	return { progress: read.progress, isLoaded: true };
}

/** The progress alone, for callers that treat "not loaded" and "none" alike. */
export function useQuestionProgress(
	statementId: string | undefined,
	actionKey: string,
): QuestionProgress | null {
	return useQuestionProgressRead(statementId, actionKey).progress;
}
