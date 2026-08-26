import React from 'react';
import type { ActivityRunState } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import Tag, { type TagSize } from './Tag';

/**
 * StatusPill — run-state as glyph + word (never colour-only).
 * Labels are English-string i18n keys translated at render time.
 */

export const STATUS_GLYPHS: Record<ActivityRunState, string> = {
	queued: '○',
	open: '●',
	frozen: '❄',
	closed: '■',
};

export const STATUS_LABELS: Record<ActivityRunState, string> = {
	queued: 'Not yet open',
	open: 'Open',
	frozen: 'Frozen',
	closed: 'Closed',
};

export interface StatusPillProps {
	status: ActivityRunState;
	size?: TagSize;
	className?: string;
}

const StatusPill: React.FC<StatusPillProps> = ({ status, size, className }) => {
	const { t } = useTranslation();

	return (
		<Tag status={status} size={size} glyph={STATUS_GLYPHS[status]} className={className}>
			{t(STATUS_LABELS[status])}
		</Tag>
	);
};

export default StatusPill;
