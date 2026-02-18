import React, { FC, ReactNode, useState } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, LucideIcon } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './SettingsSection.module.scss';

interface SettingsSectionProps {
	title: string;
	description?: string;
	icon?: LucideIcon;
	tooltip?: string;
	defaultExpanded?: boolean;
	collapsible?: boolean;
	priority?: 'high' | 'medium' | 'low';
	children: ReactNode;
	className?: string;
}

const SettingsSection: FC<SettingsSectionProps> = ({
	title,
	description,
	icon: Icon,
	tooltip,
	defaultExpanded = true,
	collapsible = true,
	priority = 'medium',
	children,
	className = '',
}) => {
	const { dir } = useTranslation();
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);
	const [showTooltip, setShowTooltip] = useState(false);

	const handleToggle = () => {
		if (collapsible) {
			setIsExpanded(!isExpanded);
		}
	};

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleToggle();
		}
	};

	return (
		<section
			className={`${styles.settingsSection} ${styles[`priority--${priority}`]} ${className}`}
			data-expanded={isExpanded}
		>
			<div
				className={`${styles.settingsSection__header} ${styles[dir]} ${collapsible ? styles['settingsSection__header--clickable'] : ''}`}
				onClick={handleToggle}
				onKeyDown={handleKeyDown}
				role={collapsible ? 'button' : undefined}
				tabIndex={collapsible ? 0 : undefined}
				aria-expanded={collapsible ? isExpanded : undefined}
			>
				<div className={styles.settingsSection__titleRow}>
					{Icon && (
						<div className={styles.settingsSection__icon}>
							<Icon size={24} />
						</div>
					)}
					<h2 className={styles.settingsSection__title}>{title}</h2>
					{tooltip && (
						<div
							className={styles.settingsSection__tooltipWrapper}
							onMouseEnter={() => setShowTooltip(true)}
							onMouseLeave={() => setShowTooltip(false)}
							onClick={(e) => e.stopPropagation()}
						>
							<HelpCircle size={18} className={styles.settingsSection__helpIcon} />
							{showTooltip && <div className={styles.settingsSection__tooltip}>{tooltip}</div>}
						</div>
					)}
					{collapsible && (
						<div className={styles.settingsSection__chevron}>
							{isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
						</div>
					)}
				</div>
				{description && <p className={styles.settingsSection__description}>{description}</p>}
			</div>
			{isExpanded && <div className={styles.settingsSection__content}>{children}</div>}
		</section>
	);
};

export default SettingsSection;
