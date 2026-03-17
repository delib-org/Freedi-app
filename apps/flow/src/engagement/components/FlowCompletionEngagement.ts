/**
 * FlowCompletionEngagement — Summary shown at the end of a flow.
 *
 * Displays:
 *   - Total credits earned during this flow
 *   - Current level + progress toward next level
 *   - Impact summary (contributions made)
 *
 * Uses the module-level engagement state for level/progress data.
 */

import m from 'mithril';
import { EngagementLevel } from '@freedi/shared-types';
import {
	getUserLevel,
	getUserLevelName,
	getUserLevelProgress,
	getTotalCredits,
	getNextThreshold,
	isEngagementLoading,
} from '../../lib/engagement';

export interface FlowCompletionEngagementAttrs {
	/** Credits earned during this specific flow session. */
	creditsEarned: number;
	/** Number of needs the user wrote in this session. */
	needsWritten: number;
	/** Number of solutions the user wrote in this session. */
	solutionsWritten: number;
	/** Number of evaluations the user completed in this session. */
	evaluationsCompleted: number;
}

/** Candy-palette level colors matching LevelPill. */
const LEVEL_BAR_COLORS: Record<EngagementLevel, string> = {
	[EngagementLevel.OBSERVER]: 'var(--color-neutral)',
	[EngagementLevel.PARTICIPANT]: 'var(--color-accent-sky)',
	[EngagementLevel.CONTRIBUTOR]: 'var(--color-accent-mint)',
	[EngagementLevel.ADVOCATE]: 'var(--color-accent-lavender)',
	[EngagementLevel.LEADER]: 'var(--color-primary)',
};

export const FlowCompletionEngagement: m.Component<FlowCompletionEngagementAttrs> =
	{
		view(vnode) {
			const {
				creditsEarned,
				needsWritten,
				solutionsWritten,
				evaluationsCompleted,
			} = vnode.attrs;

			if (isEngagementLoading()) {
				return null;
			}

			const level = getUserLevel();
			const levelName = getUserLevelName();
			const progress = getUserLevelProgress();
			const totalCredits = getTotalCredits();
			const nextThreshold = getNextThreshold();
			const barColor = LEVEL_BAR_COLORS[level];
			const isMaxLevel = level === EngagementLevel.LEADER;

			return m(
				'div',
				{
					style: {
						display: 'flex',
						flexDirection: 'column',
						gap: 'var(--space-md)',
						padding: 'var(--space-lg)',
						borderRadius: 'var(--radius-lg)',
						backgroundColor: 'var(--bg-card)',
						boxShadow: 'var(--shadow-md)',
					},
					role: 'region',
					'aria-label': 'Engagement summary',
				},
				[
					// Credits earned header
					creditsEarned > 0
						? m(
								'div',
								{
									style: {
										textAlign: 'center',
										padding: 'var(--space-md) 0',
									},
								},
								[
									m(
										'div',
										{
											style: {
												fontSize: 'var(--font-size-2xl)',
												fontWeight:
													'var(--font-weight-bold)',
												color: 'var(--color-agree-strong)',
												lineHeight:
													'var(--line-height-tight)',
											},
										},
										`+${creditsEarned}`,
									),
									m(
										'div',
										{
											style: {
												fontSize: 'var(--font-size-sm)',
												color: 'var(--text-secondary)',
												marginTop: 'var(--space-xs)',
											},
										},
										'credits earned',
									),
								],
							)
						: null,

					// Level progress
					m(
						'div',
						{
							style: {
								display: 'flex',
								flexDirection: 'column',
								gap: 'var(--space-sm)',
							},
						},
						[
							m(
								'div',
								{
									style: {
										display: 'flex',
										justifyContent: 'space-between',
										alignItems: 'center',
									},
								},
								[
									m(
										'span',
										{
											style: {
												fontSize: 'var(--font-size-sm)',
												fontWeight:
													'var(--font-weight-medium)',
												color: 'var(--text-primary)',
											},
										},
										levelName,
									),
									m(
										'span',
										{
											style: {
												fontSize: 'var(--font-size-xs)',
												color: 'var(--text-muted)',
											},
										},
										isMaxLevel
											? `${totalCredits} credits`
											: `${totalCredits} / ${nextThreshold}`,
									),
								],
							),

							// Progress bar
							m(
								'div',
								{
									style: {
										height: '6px',
										borderRadius: 'var(--radius-full)',
										backgroundColor: 'var(--bg-subtle)',
										overflow: 'hidden',
									},
									role: 'progressbar',
									'aria-valuenow': Math.round(
										progress * 100,
									),
									'aria-valuemin': 0,
									'aria-valuemax': 100,
									'aria-label': `Level progress: ${Math.round(progress * 100)}%`,
								},
								[
									m('div', {
										style: {
											height: '100%',
											width: `${Math.round(progress * 100)}%`,
											borderRadius:
												'var(--radius-full)',
											backgroundColor: barColor,
											transition: `width var(--duration-normal) var(--easing-smooth)`,
										},
									}),
								],
							),
						],
					),

					// Impact summary
					needsWritten + solutionsWritten + evaluationsCompleted > 0
						? m(
								'div',
								{
									style: {
										display: 'flex',
										justifyContent: 'space-around',
										padding: 'var(--space-sm) 0',
										borderTop: '1px solid var(--border-light)',
										marginTop: 'var(--space-xs)',
									},
								},
								[
									needsWritten > 0
										? impactItem(
												String(needsWritten),
												'needs',
											)
										: null,
									solutionsWritten > 0
										? impactItem(
												String(solutionsWritten),
												'solutions',
											)
										: null,
									evaluationsCompleted > 0
										? impactItem(
												String(evaluationsCompleted),
												'evaluations',
											)
										: null,
								],
							)
						: null,
				],
			);
		},
	};

function impactItem(value: string, label: string): m.Vnode {
	return m(
		'div',
		{
			style: {
				display: 'flex',
				flexDirection: 'column',
				alignItems: 'center',
				gap: '2px',
			},
		},
		[
			m(
				'span',
				{
					style: {
						fontSize: 'var(--font-size-lg)',
						fontWeight: 'var(--font-weight-bold)',
						color: 'var(--text-primary)',
					},
				},
				value,
			),
			m(
				'span',
				{
					style: {
						fontSize: 'var(--font-size-xs)',
						color: 'var(--text-muted)',
					},
				},
				label,
			),
		],
	);
}
