import React from 'react';
import clsx from 'clsx';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { formatCompactCount } from '@/helpers/participationVisibility';

export interface ParticipationFunnelProps {
	/** Unique users who entered the question (hidden when 0/undefined) */
	entered?: number;
	/** Unique users who suggested options (hidden when 0/undefined) */
	suggested?: number;
	/** Unique users who evaluated options (hidden when 0/undefined) */
	evaluated?: number;
	/** Whose wording: hosts read short labels, participants read people. */
	audience?: 'host' | 'participant';
	/** Text before the counts. */
	leadIn?: string;
	className?: string;
}

const SEGMENT_KEYS = {
	host: {
		suggested: '{{count}} added answers',
		evaluated: '{{count}} evaluated',
	},
	participant: {
		suggested: 'progress.peopleAddedAnswers',
		evaluated: 'progress.peopleRated',
	},
} as const;

/**
 * Quiet one-line participation summary:
 * "18 entered · 13 suggested · 9 evaluated".
 * Counts of people only. Renders nothing when all counts are missing/zero.
 * Thresholds live with the caller, because hosts need the raw counts.
 */
const ParticipationFunnel: React.FC<ParticipationFunnelProps> = ({
	entered,
	suggested,
	evaluated,
	audience = 'host',
	leadIn,
	className,
}) => {
	const { t, currentLanguage } = useTranslation();
	const keys = SEGMENT_KEYS[audience];

	const segments: string[] = [];
	const addSegment = (count: number | undefined, key: string) => {
		if (count && count > 0) {
			segments.push(t(key).replace('{{count}}', formatCompactCount(count, currentLanguage)));
		}
	};

	addSegment(entered, '{{count}} entered');
	addSegment(suggested, keys.suggested);
	addSegment(evaluated, keys.evaluated);

	if (segments.length === 0) return null;

	return (
		<p className={clsx('participation-funnel', className)}>
			{leadIn && <span className="participation-funnel__lead">{leadIn}</span>}
			{segments.map((segment) => (
				<span key={segment} className="participation-funnel__segment">
					{segment}
				</span>
			))}
		</p>
	);
};

export default ParticipationFunnel;
