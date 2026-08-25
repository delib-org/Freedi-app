import { useCallback, useMemo } from 'react';
import { showUndo, dismiss, type ShowUndoOptions } from './toastUndoStore';

export interface UseToastUndoResult {
	/** Show an undo toast; returns its id. A new toast commits the previous one. */
	showUndo: (options: ShowUndoOptions) => number;
	/** Commit + hide the current toast (or the given id). */
	dismiss: (id?: number) => void;
}

/** Imperative API for the single undo toast rendered by `<ToastUndoHost/>`. */
export function useToastUndo(): UseToastUndoResult {
	const show = useCallback((options: ShowUndoOptions) => showUndo(options), []);
	const hide = useCallback((id?: number) => dismiss(id), []);

	return useMemo(() => ({ showUndo: show, dismiss: hide }), [show, hide]);
}
