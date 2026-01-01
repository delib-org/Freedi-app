import React from 'react';
import clsx from 'clsx';
import { Check, Clock, X } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { FairEvalStatus } from '@freedi/shared-types';

/**
 * StatusIndicator Atom - Atomic Design System
 *
 * Displays 3-state status indicator for fair evaluation.
 * All styling is handled by SCSS in src/view/style/atoms/_status-indicator.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export type StatusIndicatorSize = 'small' | 'medium' | 'large';

export interface StatusIndicatorProps {
	/** Status value: reached, hasSupport, noSupport */
	status: FairEvalStatus;

	/** Size variant */
	size?: StatusIndicatorSize;

	/** Show label or dot only */
	dotOnly?: boolean;

	/** Badge style with background */
	badge?: boolean;

	/** Show icon instead of dot */
	showIcon?: boolean;

	/** Custom label override */
	label?: string;

	/** Additional CSS classes */
	className?: string;
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Get the translation key for a status
 */
function getStatusLabelKey(status: FairEvalStatus): string {
	switch (status) {
		case 'reached':
			return 'goalReached';
		case 'hasSupport':
			return 'hasSupport';
		case 'noSupport':
			return 'noSupport';
		default:
			return 'noSupport';
	}
}

/**
 * Get the icon component for a status
 */
function getStatusIcon(status: FairEvalStatus): React.ReactNode {
	switch (status) {
		case 'reached':
			return <Check />;
		case 'hasSupport':
			return <Clock />;
		case 'noSupport':
			return <X />;
		default:
			return null;
	}
}

// ============================================================================
// COMPONENT
// ============================================================================

const StatusIndicator: React.FC<StatusIndicatorProps> = ({
	status,
	size = 'medium',
	dotOnly = false,
	badge = false,
	showIcon = false,
	label: customLabel,
	className,
}) => {
	const { t } = useTranslation();

	// Get label
	const labelKey = getStatusLabelKey(status);
	const displayLabel = customLabel || t(labelKey);

	// Build BEM classes
	const classes = clsx(
		'status-indicator',
		`status-indicator--${status}`,
		size !== 'medium' && `status-indicator--${size}`,
		dotOnly && 'status-indicator--dot-only',
		badge && 'status-indicator--badge',
		className
	);

	return (
		<span className={classes} role="status" aria-label={displayLabel}>
			{showIcon ? (
				<span className="status-indicator__icon" aria-hidden="true">
					{getStatusIcon(status)}
				</span>
			) : (
				<span className="status-indicator__dot" aria-hidden="true" />
			)}

			<span className="status-indicator__label">{displayLabel}</span>
		</span>
	);
};

export default StatusIndicator;
