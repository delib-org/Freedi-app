/**
 * Tiny external store for the single active undo toast. Module-level so
 * `useToastUndo()` (anywhere) and `<ToastUndoHost/>` (rendered once) share
 * state without a provider. Showing a new toast commits the previous one.
 */

export interface ShowUndoOptions {
	message: string;
	/** Called when the user clicks Undo (or presses the shortcut). */
	onUndo: () => void;
	/** Called when the toast expires or is dismissed without undo. */
	onExpire?: () => void;
	durationMs?: number;
}

export interface UndoToastState extends ShowUndoOptions {
	id: number;
	durationMs: number;
}

export const DEFAULT_UNDO_DURATION_MS = 6000;

type Listener = () => void;

let current: UndoToastState | null = null;
let nextId = 1;
const listeners = new Set<Listener>();

function emit(): void {
	listeners.forEach((listener) => listener());
}

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);

	return () => listeners.delete(listener);
}

export function getSnapshot(): UndoToastState | null {
	return current;
}

/** Remove the toast, running `onExpire` (commit) unless it was undone. */
export function settle(id: number, undone: boolean): void {
	if (!current || current.id !== id) return;
	const toast = current;
	current = null;
	emit();
	if (undone) toast.onUndo();
	else toast.onExpire?.();
}

export function showUndo(options: ShowUndoOptions): number {
	if (current) settle(current.id, false);
	const id = nextId++;
	current = { ...options, id, durationMs: options.durationMs ?? DEFAULT_UNDO_DURATION_MS };
	emit();

	return id;
}

/** Dismiss = commit now (the pending action goes ahead). */
export function dismiss(id?: number): void {
	if (!current) return;
	if (id !== undefined && id !== current.id) return;
	settle(current.id, false);
}
