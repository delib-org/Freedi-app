import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { TreeFilterMode } from '../../TreeFilterMode';
import styles from './TreeFilterChips.module.scss';

interface TreeFilterChipsProps {
	activeFilter: TreeFilterMode;
	onFilterChange: (mode: TreeFilterMode) => void;
	onToggleCollapse: () => void;
	isCollapsed: boolean;
}

const TreeFilterChips: FC<TreeFilterChipsProps> = ({
	activeFilter,
	onFilterChange,
	onToggleCollapse,
	isCollapsed,
}) => {
	const { t } = useTranslation();

	return (
		<div className={styles['tree-filter-chips']}>
			<div className={styles['tree-filter-chips__group']}>
				<button
					className={`${styles['tree-filter-chips__chip']} ${activeFilter === TreeFilterMode.all ? styles['tree-filter-chips__chip--active'] : ''}`}
					onClick={() => onFilterChange(TreeFilterMode.all)}
					aria-pressed={activeFilter === TreeFilterMode.all}
				>
					{t('All')}
				</button>
				<button
					className={`${styles['tree-filter-chips__chip']} ${activeFilter === TreeFilterMode.bookmarked ? styles['tree-filter-chips__chip--active'] : ''}`}
					onClick={() => onFilterChange(TreeFilterMode.bookmarked)}
					aria-pressed={activeFilter === TreeFilterMode.bookmarked}
				>
					<span className="material-symbols-outlined" style={{ fontSize: 16 }}>
						bookmark
					</span>
					{t('Bookmarked')}
				</button>
				<button
					className={`${styles['tree-filter-chips__chip']} ${activeFilter === TreeFilterMode.mine ? styles['tree-filter-chips__chip--active'] : ''}`}
					onClick={() => onFilterChange(TreeFilterMode.mine)}
					aria-pressed={activeFilter === TreeFilterMode.mine}
				>
					<span className="material-symbols-outlined" style={{ fontSize: 16 }}>
						person
					</span>
					{t('My Statements')}
				</button>
			</div>
			<button
				className={styles['tree-filter-chips__collapse-btn']}
				onClick={onToggleCollapse}
				aria-label={isCollapsed ? t('Expand all') : t('Collapse all')}
			>
				<span className="material-symbols-outlined" style={{ fontSize: 18 }}>
					{isCollapsed ? 'unfold_more' : 'unfold_less'}
				</span>
			</button>
		</div>
	);
};

export default TreeFilterChips;
