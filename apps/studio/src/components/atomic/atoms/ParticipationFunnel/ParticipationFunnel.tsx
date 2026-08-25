import React from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/react';

/**
 * ParticipationFunnel atom — quiet one-line participation summary:
 * "18 entered · 13 suggested · 9 evaluated". Counts of people only.
 * Styles: @freedi/shared-styles/atoms/_participation-funnel.scss
 */

export interface ParticipationFunnelProps {
	/** Unique users who entered the question (hidden when 0/undefined) */
	entered?: number;
	/** Unique users who suggested options (hidden when 0/undefined) */
	suggested?: number;
	/** Unique users who evaluated options (hidden when 0/undefined) */
	evaluated?: number;
	className?: string;
}

function formatCompact(value: number, locale: string): string {
	try {
		return new Intl.NumberFormat(locale, {
			notation: 'compact',
			maximumFractionDigits: 1,
		}).format(value);
	} catch {
		return String(value);
	}
}

const ParticipationFunnel: React.FC<ParticipationFunnelProps> = ({
	entered,
	suggested,
	evaluated,
	className,
}) => {
	const { t, tWithParams, currentLanguage } = useTranslation();

	const segments: string[] = [];
	const addSegment = (count: number | undefined, key: string) => {
		if (count && count > 0) {
			segments.push(tWithParams(key, { count: formatCompact(count, currentLanguage) }));
		}
	};

	addSegment(entered, '{{count}} entered');
	addSegment(suggested, '{{count}} suggested');
	addSegment(evaluated, '{{count}} evaluated');

	if (segments.length === 0) return null;

	const ariaLabel = `${t('Participation')}: ${segments.join(', ')}`;

	return (
		<p className={clsx('participation-funnel', className)} aria-label={ariaLabel}>
			{segments.map((segment) => (
				<span key={segment} className="participation-funnel__segment" aria-hidden="true">
					{segment}
				</span>
			))}
		</p>
	);
};

export default ParticipationFunnel;
