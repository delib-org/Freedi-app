import { useCallback, useMemo, useRef, useState } from 'react';

export interface PeopleToast {
	/** New for every toast, so a replacing toast restarts its countdown. */
	id: number;
	message: string;
	actionLabel?: string;
	onAction?: () => void;
	durationMs: number;
}

export type PeopleToastInput = Omit<PeopleToast, 'id'>;

export interface PeopleToaster {
	toast: PeopleToast | null;
	/** Replaces the current toast (one at a time, UX 4.8); returns its id. */
	show: (next: PeopleToastInput | null) => number;
	/** Removes the toast only if it is still the one with this id. */
	clear: (id: number) => void;
	dismiss: () => void;
}

/** The one toast People shows at a time, shared by Waiting and Members. */
export function usePeopleToast(): PeopleToaster {
	const [toast, setToast] = useState<PeopleToast | null>(null);
	const count = useRef(0);

	const show = useCallback((next: PeopleToastInput | null): number => {
		count.current += 1;
		setToast(next && { ...next, id: count.current });

		return count.current;
	}, []);

	const clear = useCallback((id: number) => {
		setToast((current) => (current?.id === id ? null : current));
	}, []);

	const dismiss = useCallback(() => setToast(null), []);

	return useMemo(() => ({ toast, show, clear, dismiss }), [toast, show, clear, dismiss]);
}
