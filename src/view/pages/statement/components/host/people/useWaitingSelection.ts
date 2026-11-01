import { useCallback, useMemo, useState } from 'react';
import { WaitingMember } from '@freedi/shared-types';

export interface WaitingSelection {
	selected: WaitingMember[];
	isSelected: (subscriptionId: string) => boolean;
	toggle: (subscriptionId: string) => void;
	toggleAll: () => void;
	clear: () => void;
}

/** The rows ticked in Waiting to join; rows that leave the list leave the selection. */
export function useWaitingSelection(visible: ReadonlyArray<WaitingMember>): WaitingSelection {
	const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

	const selected = useMemo(
		() => visible.filter((member) => selectedIds.has(member.statementsSubscribeId)),
		[visible, selectedIds],
	);

	const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds]);

	const toggle = useCallback((id: string) => {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);

			return next;
		});
	}, []);

	const toggleAll = useCallback(() => {
		setSelectedIds((prev) =>
			prev.size > 0 ? new Set() : new Set(visible.map((member) => member.statementsSubscribeId)),
		);
	}, [visible]);

	const clear = useCallback(() => setSelectedIds(new Set()), []);

	return { selected, isSelected, toggle, toggleAll, clear };
}
