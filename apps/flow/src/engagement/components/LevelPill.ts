/**
 * LevelPill — A small 20px colored pill showing the user's engagement level.
 *
 * Reads module-level state from the engagement adapter; no props needed.
 * Renders inline so it can sit next to text in headers or profiles.
 */

import m from 'mithril';
import { EngagementLevel } from '@freedi/shared-types';
import {
	getUserLevel,
	getUserLevelName,
	isEngagementLoading,
} from '../../lib/engagement';

/** Candy-palette colors for each engagement level. */
const LEVEL_COLORS: Record<EngagementLevel, { bg: string; text: string }> = {
	[EngagementLevel.OBSERVER]: {
		bg: 'var(--color-neutral)',
		text: 'var(--text-primary)',
	},
	[EngagementLevel.PARTICIPANT]: {
		bg: 'var(--color-accent-sky)',
		text: 'var(--text-primary)',
	},
	[EngagementLevel.CONTRIBUTOR]: {
		bg: 'var(--color-accent-mint)',
		text: 'var(--text-primary)',
	},
	[EngagementLevel.ADVOCATE]: {
		bg: 'var(--color-accent-lavender)',
		text: 'var(--text-primary)',
	},
	[EngagementLevel.LEADER]: {
		bg: 'var(--color-primary)',
		text: 'var(--text-inverse)',
	},
};

/** Small level icons per tier. */
const LEVEL_ICONS: Record<EngagementLevel, string> = {
	[EngagementLevel.OBSERVER]: '',
	[EngagementLevel.PARTICIPANT]: '',
	[EngagementLevel.CONTRIBUTOR]: '',
	[EngagementLevel.ADVOCATE]: '',
	[EngagementLevel.LEADER]: '',
};

export const LevelPill: m.Component = {
	view() {
		if (isEngagementLoading()) {
			return null;
		}

		const level = getUserLevel();
		const name = getUserLevelName();
		const colors = LEVEL_COLORS[level];
		const icon = LEVEL_ICONS[level];

		return m(
			'span',
			{
				style: {
					display: 'inline-flex',
					alignItems: 'center',
					gap: '4px',
					height: '20px',
					padding: '0 8px',
					fontSize: '11px',
					fontWeight: 'var(--font-weight-medium)',
					lineHeight: '20px',
					borderRadius: 'var(--radius-full)',
					backgroundColor: colors.bg,
					color: colors.text,
					whiteSpace: 'nowrap',
					letterSpacing: '0.02em',
				},
				'aria-label': `Level: ${name}`,
			},
			[icon ? `${icon} ${name}` : name],
		);
	},
};
