import { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router';
import { Statement, StatementType } from '@freedi/shared-types';

import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { usePrefersReducedMotion } from '@/controllers/hooks/usePrefersReducedMotion';
import { statementSelectorById } from '@/redux/statements/statementsSlice';
import { UI } from '@/constants/common';
import { logError } from '@/utils/errorHandling';
import { safeSessionStorage } from '@/utils/safeStorage';

/** Set after adding an answer, and carried by notification links. */
export const FOCUS_ANSWER_PARAM = 'focusId';

export interface FocusedAnswer {
	/** The card to show first for this browser session, unless the reader chose a sort. */
	pinnedId: string | undefined;
	/** The pinned answer when it is older than the loaded window. */
	focusedAnswer: Statement | undefined;
	/** The card wearing the highlight ring right now. */
	ringId: string | undefined;
	ringRef: RefObject<HTMLDivElement | null>;
}

const pinKey = (questionId: string): string => `focusedAnswer:${questionId}`;

/**
 * An older answer sits outside the loaded window. It stays out of the store on
 * purpose: paging takes its cursor from the oldest stored answer, so storing it
 * would skip every answer between the window and this one.
 */
async function loadFocusedAnswer(
	answerId: string,
	questionId: string,
): Promise<Statement | undefined> {
	try {
		const answer = await getStatementFromDB(answerId);
		const isAnswerHere =
			answer?.parentId === questionId && answer.statementType === StatementType.option;

		return isAnswerHere && !answer.hide ? answer : undefined;
	} catch (error) {
		logError(error, {
			operation: 'useFocusedAnswer.loadFocusedAnswer',
			statementId: answerId,
			metadata: { questionId },
		});

		return undefined;
	}
}

/**
 * Honours `?focusId=<answer>`. Once the card is on screen the parameter is used
 * up: it is removed from the URL, so returning to the tab does not scroll or
 * ring again, and the pin stays through session storage.
 */
export function useFocusedAnswer(
	questionId: string | undefined,
	shownIds: ReadonlySet<string>,
	isSortChosen: boolean,
): FocusedAnswer {
	const [searchParams, setSearchParams] = useSearchParams();
	const focusId = searchParams.get(FOCUS_ANSWER_PARAM) ?? undefined;
	const isLoaded = useSelector(statementSelectorById(focusId)) !== undefined;
	const prefersReducedMotion = usePrefersReducedMotion();
	const [ringId, setRingId] = useState<string | undefined>(undefined);
	const ringRef = useRef<HTMLDivElement>(null);
	const requestedRef = useRef<string | undefined>(undefined);
	const [fetchedAnswer, setFetchedAnswer] = useState<Statement | undefined>(undefined);
	const isShown =
		focusId !== undefined && (shownIds.has(focusId) || fetchedAnswer?.statementId === focusId);

	const pinnedId = useMemo(() => {
		if (isSortChosen) return undefined;
		if (focusId) return focusId;
		if (!questionId) return undefined;

		return safeSessionStorage.getItem(pinKey(questionId)) ?? undefined;
	}, [focusId, questionId, isSortChosen]);

	// Picking a sort ends the pin, so going back to the default view does not revive it.
	useEffect(() => {
		if (isSortChosen && questionId) safeSessionStorage.removeItem(pinKey(questionId));
	}, [isSortChosen, questionId]);

	useEffect(() => {
		if (!focusId || !questionId || isSortChosen || isLoaded) return;
		if (requestedRef.current === focusId) return;
		requestedRef.current = focusId;
		void loadFocusedAnswer(focusId, questionId).then(setFetchedAnswer);
	}, [focusId, questionId, isSortChosen, isLoaded]);

	useEffect(() => {
		if (!focusId || !questionId || !isShown) return;
		if (!isSortChosen) safeSessionStorage.setItem(pinKey(questionId), focusId);
		setRingId(focusId);
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				next.delete(FOCUS_ANSWER_PARAM);

				return next;
			},
			{ replace: true },
		);
	}, [focusId, questionId, isShown, isSortChosen, setSearchParams]);

	useEffect(() => {
		if (!ringId) return;
		const frame = requestAnimationFrame(() => {
			ringRef.current?.scrollIntoView({
				block: 'center',
				behavior: prefersReducedMotion ? 'auto' : 'smooth',
			});
		});
		const timer = window.setTimeout(() => setRingId(undefined), UI.FOCUSED_ANSWER_RING_DURATION);

		return () => {
			cancelAnimationFrame(frame);
			window.clearTimeout(timer);
		};
	}, [ringId, prefersReducedMotion]);

	const focusedAnswer = fetchedAnswer?.statementId === pinnedId ? fetchedAnswer : undefined;

	return { pinnedId, focusedAnswer, ringId, ringRef };
}
