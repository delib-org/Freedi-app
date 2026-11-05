import m from 'mithril';
import type { TableAssignmentStatus } from '@freedi/shared-types';
import { t } from '@/lib/i18n';

export interface StatusChipAttrs {
	status: TableAssignmentStatus;
}

/** Status chip: the text is always shown, the colour only reinforces it. */
export const StatusChip: m.Component<StatusChipAttrs> = {
	view({ attrs }) {
		return m(`span.chip.chip--${attrs.status}`, t(`tableAssignment.status.${attrs.status}`));
	},
};
