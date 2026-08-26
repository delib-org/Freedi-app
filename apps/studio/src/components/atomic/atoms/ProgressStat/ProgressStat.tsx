import React from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/react';

/**
 * ProgressStat atom — one big number + caps label (+ optional delta).
 * Styles: styles/atoms/_progress-stat.scss
 */

export type ProgressStatAccent = 'entered' | 'suggested' | 'evaluated';

export interface ProgressStatProps {
	value: number;
	/** Already-translated label text. */
	label: string;
	/** Signed change since a previous period; rendered as "+3" / "−2". */
	delta?: number;
	/** Funnel step accent; `true` is shorthand for `evaluated` (the strongest). */
	accent?: ProgressStatAccent | boolean;
	compact?: boolean;
	muted?: boolean;
	className?: string;
}

function formatNumber(value: number, locale: string): string {
	try {
		return new Intl.NumberFormat(locale).format(value);
	} catch {
		return String(value);
	}
}

const ProgressStat: React.FC<ProgressStatProps> = ({
	value,
	label,
	delta,
	accent,
	compact = false,
	muted = false,
	className,
}) => {
	const { currentLanguage } = useTranslation();
	const accentStep: ProgressStatAccent | undefined =
		accent === true ? 'evaluated' : accent === false ? undefined : accent;

	const classes = clsx(
		'progress-stat',
		accentStep && `progress-stat--accent-${accentStep}`,
		compact && 'progress-stat--compact',
		muted && 'progress-stat--muted',
		className,
	);

	const hasDelta = typeof delta === 'number' && delta !== 0;
	const deltaClasses = clsx(
		'progress-stat__delta',
		hasDelta && delta > 0 && 'progress-stat__delta--up',
		hasDelta && delta < 0 && 'progress-stat__delta--down',
	);

	return (
		<div className={classes}>
			<span className="progress-stat__value">{formatNumber(value, currentLanguage)}</span>
			<span className="progress-stat__label">{label}</span>
			{hasDelta && (
				<span className={deltaClasses}>
					{delta > 0 ? '+' : '−'}
					{formatNumber(Math.abs(delta), currentLanguage)}
				</span>
			)}
		</div>
	);
};

export default ProgressStat;
