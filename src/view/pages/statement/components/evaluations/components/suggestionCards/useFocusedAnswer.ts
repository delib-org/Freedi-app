import { RefObject, useEffect, useMemo, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useSearchParams } from 'react-router';
import { StatementType } from '@freedi/shared-types';
import type { Dispatch } from '@reduxjs/toolkit';

import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import { usePrefersReducedMotion } from '@/controllers/hooks/usePrefersReducedMotion';
import { setStatement, statementSelectorById } from '@/redux/statements/statementsSlice';
import { UI } from '@/constants/common';
import { logError } from '@/utils/errorHandling';
import { safeSessionStorage } from '@/utils/safeStorage';

/** Set after adding an answer, and carried by notification links. */
export const FOCUS_ANSWER_PARAM = 'focusId';

export interface FocusedAnswer {
	/** The card to show first for the rest of this browser session. */
	pinnedId: string | undefined;
	/** The card wearing the highlight ring right now. */
	ringId: string | undefined;
	ringRef: RefObject<HTMLDivElement | null>;
}

const pinKey = (questionId: string): string => `focusedAnswer:${questionId}`;

/** An older answer sits outside the loaded window. A deleted one simply stays absent. */
async function loadFocusedAnswer(
	answerId: string,
	questionId: string,
	dispatch: Dispatch,
): Promise<void> {
	try {
		const answer = await getStatementFromDB(answerId);
		if (answer?.parentId !== questionId || answer.statementType !== StatementType.option) return;

		dispatch(setStatement(answer));
	} catch (error) {
		logError(error, {
			operation: 'useFocusedAnswer.loadFocusedAnswer',
			statementId: answerId,
			metadata: { questionId },
		});
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
): FocusedAnswer {
	const dispatch = useDispatch();
	const [searchParams, setSearchParams] = useSearchParams();
	const focusId = searchParams.get(FOCUS_ANSWER_PARAM) ?? undefined;
	const isLoaded = useSelector(statementSelectorById(focusId)) !== undefined;
	const isShown = focusId !== undefined && shownIds.has(focusId);
	const prefersReducedMotion = usePrefersReducedMotion();
	const [ringId, setRingId] = useState<string | undefined>(undefined);
	const ringRef = useRef<HTMLDivElement>(null);
	const requestedRef = useRef<string | undefined>(undefined);

	const pinnedId = useMemo(() => {
		if (focusId) return focusId;
		if (!questionId) return undefined;

		return safeSessionStorage.getItem(pinKey(questionId)) ?? undefined;
	}, [focusId, questionId]);

	useEffect(() => {
		if (!focusId || !questionId || isLoaded || requestedRef.current === focusId) return;
		requestedRef.current = focusId;
		void loadFocusedAnswer(focusId, questionId, dispatch);
	}, [focusId, questionId, isLoaded, dispatch]);

	useEffect(() => {
		if (!focusId || !questionId || !isShown) return;
		safeSessionStorage.setItem(pinKey(questionId), focusId);
		setRingId(focusId);
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				next.delete(FOCUS_ANSWER_PARAM);

				return next;
			},
			{ replace: true },
		);
	}, [focusId, questionId, isShown, setSearchParams]);

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

	return { pinnedId, ringId, ringRef };
}
