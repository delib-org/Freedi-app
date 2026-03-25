import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './CollapseToggle.module.scss';

interface CollapseToggleProps {
	childCount: number;
	isExpanded: boolean;
	onToggle: () => void;
}

const CollapseToggle: FC<CollapseToggleProps> = ({ childCount, isExpanded, onToggle }) => {
	const { t } = useTranslation();

	const label = isExpanded
		? t('Collapse thread')
		: `${childCount} ${childCount === 1 ? t('reply') : t('replies')}`;

	return (
		<button
			className={`${styles['collapse-toggle']} ${isExpanded ? styles['collapse-toggle--expanded'] : ''}`}
			onClick={onToggle}
			aria-expanded={isExpanded}
			aria-label={label}
		>
			<span className={styles['collapse-toggle__icon']}>&#9654;</span>
			{!isExpanded && (
				<span className={styles['collapse-toggle__count']}>
					{childCount} {childCount === 1 ? t('reply') : t('replies')}
				</span>
			)}
		</button>
	);
};

export default CollapseToggle;
