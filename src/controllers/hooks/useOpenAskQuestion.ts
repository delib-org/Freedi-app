import { createContext, useContext } from 'react';

/**
 * Opens the "Ask a question" sheet. The shell that mounts the sheet provides
 * it, so every Home entry (empty state, Questions tab, sidebar) asks the same way.
 */
export const OpenAskQuestionContext = createContext<() => void>(() => undefined);

export function useOpenAskQuestion(): () => void {
	return useContext(OpenAskQuestionContext);
}
