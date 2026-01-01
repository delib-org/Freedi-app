import React from 'react';
import clsx from 'clsx';
import { Heart } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';

/**
 * SupportedTopicsSummary Molecule - Atomic Design System
 *
 * Shows user how many topics they support on the main page.
 * Helps users understand their opinion matters and influences
 * which topics appear on the main page.
 *
 * All styling is handled by SCSS in src/view/style/molecules/_supported-topics-summary.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export interface SupportedTopicsSummaryProps {
	/** Number of topics the user supports */
	supportedCount: number;

	/** Total number of topics on the page */
	totalCount: number;

	/** Loading state */
	loading?: boolean;

	/** Compact mode for smaller spaces */
	compact?: boolean;

	/** Additional CSS classes */
	className?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const SupportedTopicsSummary: React.FC<SupportedTopicsSummaryProps> = ({
	supportedCount,
	totalCount,
	loading = false,
	compact = false,
	className,
}) => {
	const { t } = useTranslation();

	// Determine variant based on support ratio
	const supportRatio = totalCount > 0 ? supportedCount / totalCount : 0;
	const isHighlighted = supportRatio >= 0.5;
	const hasNoSupport = supportedCount === 0;

	// Build BEM classes
	const classes = clsx(
		'supported-topics-summary',
		compact && 'supported-topics-summary--compact',
		isHighlighted && 'supported-topics-summary--highlighted',
		hasNoSupport && 'supported-topics-summary--no-support',
		loading && 'supported-topics-summary--loading',
		className
	);

	return (
		<div className={classes}>
			<div className="supported-topics-summary__icon">
				<Heart />
			</div>
			<div className="supported-topics-summary__content">
				<p className="supported-topics-summary__text">
					{loading ? (
						t('Loading...')
					) : (
						<>
							{t('Out of')} <strong>{totalCount}</strong> {t('topics on this page')},{' '}
							<strong>{supportedCount}</strong> {t('are ones you support')}
						</>
					)}
				</p>
				{!compact && (
					<p className="supported-topics-summary__explanation">
						{t('Your opinion matters and influences which topics appear here')}
					</p>
				)}
			</div>
		</div>
	);
};

export default SupportedTopicsSummary;
