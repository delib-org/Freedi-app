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

/**
 * The same four states, in a Sign document's words: a hidden document is
 * being reviewed by its admins; an open one takes public comment.
 */
export const DOCUMENT_STATUS_LABELS: Record<ActivityRunState, string> = {
	queued: 'In review',
	open: 'Open for comment',
	frozen: 'Frozen',
	closed: 'Closed',
};

export interface StatusPillProps {
	status: ActivityRunState;
	/** Use the document vocabulary (In review / Open for comment). */
	document?: boolean;
	size?: TagSize;
	className?: string;
}

const StatusPill: React.FC<StatusPillProps> = ({ status, document = false, size, className }) => {
	const { t } = useTranslation();
	const labels = document ? DOCUMENT_STATUS_LABELS : STATUS_LABELS;

	return (
		<Tag status={status} size={size} glyph={STATUS_GLYPHS[status]} className={className}>
			{t(labels[status])}
		</Tag>
	);
};

export default StatusPill;
