import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * One bottom control on phones.
 *
 * The floating nav's "+" is the only add affordance there, so the question
 * screen registers its "add an answer" action here and the nav calls it when a
 * question that accepts answers is open. With nothing registered the "+" falls
 * back to asking a new question.
 */

type ComposeHandler = () => void;

export interface AnswerComposeValue {
	/** Registers the open-the-answer-sheet action; returns its unregister. */
	register: (handler: ComposeHandler) => () => void;
	/** True while a question screen can take a new answer. */
	canCompose: boolean;
	/** Opens the answer sheet. False when nothing is registered. */
	compose: () => boolean;
}

const NOOP: AnswerComposeValue = {
	register: () => () => undefined,
	canCompose: false,
	compose: () => false,
};

export const AnswerComposeContext = createContext<AnswerComposeValue>(NOOP);

/** For the shell that owns the nav: holds the registration. */
export function useAnswerComposeState(): AnswerComposeValue {
	const handler = useRef<ComposeHandler | null>(null);
	const [canCompose, setCanCompose] = useState(false);

	const register = useCallback((next: ComposeHandler) => {
		handler.current = next;
		setCanCompose(true);

		return () => {
			// A later screen may have registered already; only the current owner clears.
			if (handler.current !== next) return;
			handler.current = null;
			setCanCompose(false);
		};
	}, []);

	const compose = useCallback(() => {
		if (!handler.current) return false;
		handler.current();

		return true;
	}, []);

	return useMemo(() => ({ register, canCompose, compose }), [register, canCompose, compose]);
}

/** For the question screen. */
export function useAnswerCompose(): AnswerComposeValue {
	return useContext(AnswerComposeContext);
}
