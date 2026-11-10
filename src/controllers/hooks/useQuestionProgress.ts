import { useCallback, useEffect, useState } from 'react';
import { QuestionProgress } from '@freedi/shared-types';
import { PARTICIPATION } from '@/constants/common';
import { getQuestionProgress } from '@/controllers/db/questionProgress/getQuestionProgress';
import { shouldRefreshProgress } from '@/helpers/participationVisibility';

interface ProgressRead {
	startedAt: number;
	result: Promise<QuestionProgress | null>;
}

/** Per question, shared by every surface, so opening several is one read. */
const lastRead = new Map<string, ProgressRead>();

function readProgress(statementId: string, now: number): Promise<QuestionProgress | null> {
	const previous = lastRead.get(statementId);
	if (previous && !shouldRefreshProgress(previous.startedAt, now)) return previous.result;

	const result = getQuestionProgress(statementId);
	lastRead.set(statementId, { startedAt: now, result });

	return result;
}

/** Time until the shared read allows another; also collects any change it skipped. */
function delayUntilNextRead(statementId: string, now: number): number {
	const startedAt = lastRead.get(statementId)?.startedAt ?? now;
	const remaining = PARTICIPATION.PROGRESS_REFRESH_MS - (now - startedAt);

	return Math.max(remaining, PARTICIPATION.PROGRESS_MIN_RETRY_MS);
}

export interface QuestionProgressRead {
	progress: QuestionProgress | null;
	/** False only while a read for this question is still on its way. */
	isLoaded: boolean;
	/** Drops the shared read and fetches again, for after the counters were rebuilt. */
	reload: () => void;
}

export interface QuestionProgressReadOptions {
	/**
	 * Re-reads once a minute while this returns true, through the same shared
	 * read and never a listener. Paused while the tab is hidden. Leave it out
	 * to read only on open and after the viewer's own action.
	 */
	pollWhile?: (progress: QuestionProgress | null) => boolean;
}

/**
 * A question's group progress: read on open and after the viewer's own action
 * (a change of `actionKey`), at most once a minute. Pass no id to skip the read.
 */
export function useQuestionProgressRead(
	statementId: string | undefined,
	actionKey: string,
	{ pollWhile }: QuestionProgressReadOptions = {},
): QuestionProgressRead {
	const [read, setRead] = useState<{
		statementId: string;
		progress: QuestionProgress | null;
	} | null>(null);
	const [tick, setTick] = useState(0);

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
	}, [statementId, actionKey, tick]);

	const reload = useCallback(() => {
		if (!statementId) return;
		lastRead.delete(statementId);
		setRead(null);
		setTick((value) => value + 1);
	}, [statementId]);

	const isLoaded = !statementId || read?.statementId === statementId;
	const progress = statementId && isLoaded && read ? read.progress : null;
	const isPolling = !!statementId && isLoaded && (pollWhile?.(progress) ?? false);

	useEffect(() => {
		if (!statementId || !isPolling) return;
		let timer: ReturnType<typeof setTimeout> | undefined;

		const stop = () => {
			if (timer !== undefined) clearTimeout(timer);
			timer = undefined;
		};
		const scheduleWhileVisible = () => {
			stop();
			if (document.visibilityState === 'hidden') return;
			timer = setTimeout(
				() => setTick((value) => value + 1),
				delayUntilNextRead(statementId, Date.now()),
			);
		};

		scheduleWhileVisible();
		document.addEventListener('visibilitychange', scheduleWhileVisible);

		return () => {
			stop();
			document.removeEventListener('visibilitychange', scheduleWhileVisible);
		};
	}, [statementId, isPolling, tick]);

	return { progress, isLoaded, reload };
}

/** The progress alone, for callers that treat "not loaded" and "none" alike. */
export function useQuestionProgress(
	statementId: string | undefined,
	actionKey: string,
): QuestionProgress | null {
	return useQuestionProgressRead(statementId, actionKey).progress;
}
