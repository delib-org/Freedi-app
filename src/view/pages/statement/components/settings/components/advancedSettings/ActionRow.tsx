import { FC } from 'react';
import React from 'react';
import styles from './EnhancedAdvancedSettings.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';

export interface ActionRowProps {
	label: string;
	description?: string;
	icon?: React.ElementType;
	badge?: 'recommended' | 'premium' | 'new';
	buttonLabel: string;
	loadingLabel?: string;
	onClick: () => void;
	disabled?: boolean;
	loading?: boolean;
	variant?: 'primary' | 'secondary';
}

/**
 * Settings row with the same shell as ToggleSwitch, but the right side hosts
 * an action button instead of a toggle. Used for "run pipeline now" actions
 * inside the AI & Automation block.
 */
const ActionRow: FC<ActionRowProps> = ({
	label,
	description,
	icon: Icon,
	badge,
	buttonLabel,
	loadingLabel,
	onClick,
	disabled = false,
	loading = false,
	variant = 'primary',
}) => {
	const { t } = useTranslation();
	const buttonClass = `btn ${variant === 'primary' ? 'btn--primary' : 'btn--secondary'}`;

	return (
		<div className={styles.toggleItem}>
			<div className={styles.toggleContent}>
				{Icon && (
					<div className={styles.toggleIcon}>
						<Icon size={18} />
					</div>
				)}
				<div className={styles.toggleInfo}>
					<div className={styles.toggleHeader}>
						<span className={styles.toggleLabel}>{label}</span>
						{badge && (
							<span className={`${styles.badge} ${styles[`badge--${badge}`]}`}>{t(badge)}</span>
						)}
					</div>
					{description && <p className={styles.toggleDescription}>{description}</p>}
				</div>
			</div>
			<div className={styles.toggleControl}>
				<button
					type="button"
					className={buttonClass}
					onClick={onClick}
					disabled={disabled || loading}
					aria-busy={loading}
				>
					{loading ? loadingLabel ?? t('Running...') : buttonLabel}
				</button>
			</div>
		</div>
	);
};

export default ActionRow;
