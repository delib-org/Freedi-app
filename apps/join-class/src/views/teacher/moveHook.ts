/**
 * A one-line seam between the places that move a student (drag, keyboard, the name menu, the
 * table sheet, the "no table" strip) and the console, which wants to know that the teacher has
 * moved someone once (the long drag hint then retires). No imports, so any view can call it.
 */

let hook: (() => void) | null = null;

/** The console registers its listener on mount and clears it on unmount. */
export function setStudentMovedHook(next: (() => void) | null): void {
	hook = next;
}

/** Call right before a move is sent. */
export function noteStudentMoved(): void {
	hook?.();
}
