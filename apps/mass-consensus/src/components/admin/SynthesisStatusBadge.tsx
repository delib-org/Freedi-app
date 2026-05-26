'use client';

import { useTranslation } from '@freedi/shared-i18n/next';
import styles from './Admin.module.scss';

export type SynthesisBadgeState = 'live' | 'disabled' | 'survey-off';

interface SynthesisStatusBadgeProps {
	/** Resolved state — caller computes from survey + question. */
	state: SynthesisBadgeState;
	/**
	 * Optional count of options that were grouped into clusters under this
	 * question. When > 0, the badge shows "Live · N grouped" to give admins
	 * concrete evidence synthesis is actually doing work.
	 */
	clusteredCount?: number;
	/** Compact rendering for inline placement in dense lists. */
	compact?: boolean;
}

/**
 * Small pill that surfaces whether live synthesis is active for a question.
 *
 * Three states:
 *   - `live`: synthesis runs on threshold-cross (default for MC questions).
 *   - `disabled`: admin explicitly turned it off on this question.
 *   - `survey-off`: the survey-level kill switch is OFF, overriding any
 *     per-question setting.
 *
 * The badge is informational only; toggling happens elsewhere (per-survey
 * in SurveyForm, per-question in UnifiedFlowEditor).
 */
export default function SynthesisStatusBadge({
	state,
	clusteredCount,
	compact = false,
}: SynthesisStatusBadgeProps) {
	const { t } = useTranslation();

	const colorVar =
		state === 'live'
			? 'var(--agree)'
			: state === 'survey-off'
				? 'var(--disagree)'
				: 'var(--bg-muted)';
	const textColor = state === 'disabled' ? 'var(--text-muted)' : 'white';

	const label =
		state === 'live'
			? clusteredCount && clusteredCount > 0
				? `${t('synthesisStateLive') || 'Live'} · ${clusteredCount}`
				: t('synthesisStateLive') || 'Live'
			: state === 'survey-off'
				? t('synthesisStateSurveyOff') || 'Survey off'
				: t('synthesisStateDisabled') || 'Disabled';

	const title =
		state === 'live'
			? clusteredCount && clusteredCount > 0
				? (t('synthesisLiveWithCountTitle') || '{{count}} options grouped into clusters by AI synthesis').replace(
						'{{count}}',
						String(clusteredCount)
					)
				: t('synthesisLiveTitle') ||
					'Live synthesis is on — new options will auto-merge with similar existing ones when they cross the evaluation threshold.'
			: state === 'survey-off'
				? t('synthesisSurveyOffTitle') ||
					'Disabled at the survey level. Turn on the survey-level toggle to re-enable.'
				: t('synthesisDisabledTitle') ||
					'Live synthesis is off for this question. New options stay separate.';

	return (
		<span
			className={styles.synthesisBadge}
			style={{
				display: 'inline-flex',
				alignItems: 'center',
				gap: '0.25rem',
				padding: compact ? '0.125rem 0.5rem' : '0.25rem 0.625rem',
				borderRadius: '999px',
				background: colorVar,
				color: textColor,
				fontSize: compact ? '0.6875rem' : '0.75rem',
				fontWeight: 600,
				whiteSpace: 'nowrap',
			}}
			title={title}
			aria-label={`${t('synthesisStatusLabel') || 'Synthesis status'}: ${label}`}
		>
			<svg
				width={compact ? 10 : 12}
				height={compact ? 10 : 12}
				viewBox="0 0 24 24"
				fill="currentColor"
				aria-hidden="true"
			>
				<path d="M13 2L4.09 12.97 11 13.36l-2 8.66 8.91-10.97L11 10.64z" />
			</svg>
			<span>{label}</span>
		</span>
	);
}

/**
 * Pure helper: resolve the badge state from the survey-level toggle and the
 * question's per-question override. Default is `'live'` because MC questions
 * default-on per the backend featureGate.
 */
export function resolveSynthesisBadgeState(input: {
	surveyLiveSynthEnabled: boolean | undefined;
	questionLiveSynthEnabledOverride: boolean | undefined;
}): SynthesisBadgeState {
	const surveyOn = input.surveyLiveSynthEnabled ?? true;
	if (!surveyOn) return 'survey-off';
	const perQuestion = input.questionLiveSynthEnabledOverride ?? true;
	return perQuestion ? 'live' : 'disabled';
}
