import type { StudioScheduledActionKind } from '@freedi/shared-types';

/**
 * How Studio presents a scheduled facilitator action: a glyph AND a word
 * (never colour-only), matching the status vocabulary of StatusPill
 * (● Open · ❄ Frozen · ■ Closed) plus the reminder bell and the draft pen.
 * Labels are English i18n keys — pass through `t()`.
 */
export const ACTION_GLYPHS: Record<StudioScheduledActionKind, string> = {
	open: '●',
	freeze: '❄',
	close: '■',
	nudge: '🔔',
	draft: '📝',
};

export const ACTION_LABELS: Record<StudioScheduledActionKind, string> = {
	open: 'Opens',
	freeze: 'Freezes',
	close: 'Closes',
	nudge: 'Reminder',
	draft: 'Draft',
};
