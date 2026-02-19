import { FC } from 'react';
import React from 'react';
import styles from './EnhancedAdvancedSettings.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';

export interface ToggleSwitchProps {
	isChecked: boolean;
	onChange: (checked: boolean) => void;
	label: string;
	description?: string;
	icon?: React.ElementType;
	badge?: 'recommended' | 'premium' | 'new';
}

const ToggleSwitch: FC<ToggleSwitchProps> = ({
	isChecked,
	onChange,
	label,
	description,
	icon: Icon,
	badge,
}) => {
	const { t } = useTranslation();

	return (
		<div className={`${styles.toggleItem} ${isChecked ? styles['toggleItem--active'] : ''}`}>
			<div className={styles.toggleContent}>
				{Icon && (
					<div className={`${styles.toggleIcon} ${isChecked ? styles['toggleIcon--active'] : ''}`}>
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
				<span
					className={`${styles.toggleStatus} ${isChecked ? styles['toggleStatus--on'] : styles['toggleStatus--off']}`}
				>
					{isChecked ? t('On') : t('Off')}
				</span>
				<label className={styles.toggleSwitch}>
					<input type="checkbox" checked={isChecked} onChange={(e) => onChange(e.target.checked)} />
					<span className={styles.toggleSlider}></span>
				</label>
			</div>
		</div>
	);
};

export default ToggleSwitch;
