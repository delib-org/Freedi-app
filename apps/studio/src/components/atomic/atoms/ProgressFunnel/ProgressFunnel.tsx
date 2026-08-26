import React from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/react';

/**
 * ProgressFunnel atom — entered ⊇ suggested ⊇ evaluated as three stacked
 * bars on one track (styles/atoms/_progress-funnel.scss). Bars are scaled
 * with `--fill` (0..1); each fill = count / max(entered, 1).
 */

export interface ProgressCounts {
	entered: number;
	suggested: number;
	evaluated: number;
}

export type ProgressFunnelVariant = 'mini' | 'full';

export interface ProgressFunnelProps {
	counts: ProgressCounts;
	variant?: ProgressFunnelVariant;
	className?: string;
}

type FunnelStep = keyof ProgressCounts;

const STEPS: readonly FunnelStep[] = ['entered', 'suggested', 'evaluated'];

const STEP_KEYS: Record<FunnelStep, string> = {
	entered: '{{count}} entered',
	suggested: '{{count}} suggested',
	evaluated: '{{count}} evaluated',
};

function clamp01(value: number): number {
	if (!Number.isFinite(value)) return 0;

	return Math.min(1, Math.max(0, value));
}

export function computeFills(counts: ProgressCounts): Record<FunnelStep, number> {
	const base = Math.max(counts.entered, 1);

	return {
		entered: clamp01(counts.entered / base),
		suggested: clamp01(counts.suggested / base),
		evaluated: clamp01(counts.evaluated / base),
	};
}

function formatCount(value: number, locale: string): string {
	try {
		return new Intl.NumberFormat(locale).format(value);
	} catch {
		return String(value);
	}
}

const ProgressFunnel: React.FC<ProgressFunnelProps> = ({ counts, variant = 'full', className }) => {
	const { t, tWithParams, currentLanguage } = useTranslation();
	const fills = computeFills(counts);
	const isEmpty = counts.entered <= 0 && counts.suggested <= 0 && counts.evaluated <= 0;

	const sentence = isEmpty
		? t('No participants yet')
		: STEPS.map((step) =>
				tWithParams(STEP_KEYS[step], { count: formatCount(counts[step], currentLanguage) }),
			).join(', ');

	const classes = clsx(
		'progress-funnel',
		`progress-funnel--${variant}`,
		isEmpty && 'progress-funnel--empty',
		className,
	);

	return (
		<div
			className={classes}
			role="img"
			aria-label={sentence}
			title={variant === 'mini' ? sentence : undefined}
		>
			<div className="progress-funnel__track" aria-hidden="true">
				{STEPS.map((step) => (
					<div
						key={step}
						className={clsx('progress-funnel__bar', `progress-funnel__bar--${step}`)}
						style={{ '--fill': fills[step] } as React.CSSProperties}
					/>
				))}
			</div>

			{variant === 'full' && (
				<ul className="progress-funnel__legend" aria-hidden="true">
					{STEPS.map((step) => (
						<li key={step} className="progress-funnel__legend-item">
							<span
								className={clsx('progress-funnel__swatch', `progress-funnel__swatch--${step}`)}
							/>
							<span className="progress-funnel__count">
								{formatCount(counts[step], currentLanguage)}
							</span>
							<span>{t(step)}</span>
						</li>
					))}
				</ul>
			)}

			<span className="progress-funnel__sr">{sentence}</span>
		</div>
	);
};

export default ProgressFunnel;
