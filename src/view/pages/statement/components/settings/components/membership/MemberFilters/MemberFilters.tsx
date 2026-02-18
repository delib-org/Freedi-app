import { FC, useState, useEffect, useCallback, ChangeEvent } from 'react';
import styles from './MemberFilters.module.scss';
import { Role } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface MemberFiltersProps {
	onSearchChange: (searchTerm: string) => void;
	onRoleFilterChange: (role: Role | 'all') => void;
	memberCounts: {
		all: number;
		admin: number;
		member: number;
		banned: number;
	};
	activeFilter: Role | 'all';
}

const MemberFilters: FC<MemberFiltersProps> = ({
	onSearchChange,
	onRoleFilterChange,
	memberCounts,
	activeFilter,
}) => {
	const { t } = useTranslation();
	const [searchTerm, setSearchTerm] = useState('');
	const [debouncedSearch, setDebouncedSearch] = useState('');

	// Debounce search input
	useEffect(() => {
		const timer = setTimeout(() => {
			setDebouncedSearch(searchTerm);
		}, 300);

		return () => clearTimeout(timer);
	}, [searchTerm]);

	// Notify parent of search changes
	useEffect(() => {
		onSearchChange(debouncedSearch);
	}, [debouncedSearch, onSearchChange]);

	const handleSearchChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
		setSearchTerm(e.target.value);
	}, []);

	const handleClearSearch = useCallback(() => {
		setSearchTerm('');
		setDebouncedSearch('');
	}, []);

	const filterTabs = [
		{ id: 'all', label: t('All'), count: memberCounts.all },
		{ id: Role.admin, label: t('Admin'), count: memberCounts.admin },
		{ id: Role.member, label: t('Member'), count: memberCounts.member },
		{ id: Role.banned, label: t('Banned'), count: memberCounts.banned },
	];

	return (
		<div className={styles.memberFilters}>
			<div className={styles.searchContainer}>
				<svg
					className={styles.searchIcon}
					width="20"
					height="20"
					viewBox="0 0 20 20"
					fill="currentColor"
				>
					<path
						fillRule="evenodd"
						d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
						clipRule="evenodd"
					/>
				</svg>

				<input
					id="memberSearch"
					type="text"
					className={styles.searchInput}
					placeholder={t('Search members by name...')}
					value={searchTerm}
					onChange={handleSearchChange}
					aria-label={t('Search members')}
					aria-describedby="searchHelp"
				/>

				{searchTerm && (
					<button
						className={styles.clearButton}
						onClick={handleClearSearch}
						aria-label={t('Clear search')}
					>
						<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
							<path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
						</svg>
					</button>
				)}

				<span id="searchHelp" className="sr-only">
					{t('Type to filter members by name')}
				</span>
			</div>

			<div className={styles.roleFilters} role="tablist" aria-label={t('Filter members by role')}>
				{filterTabs.map((tab) => (
					<button
						key={tab.id}
						role="tab"
						className={`${styles.filterTab} ${
							activeFilter === tab.id
								? `${styles['filterTab--active']} ${styles[`filterTab--${tab.id}`]}`
								: ''
						}`}
						onClick={() => onRoleFilterChange(tab.id as Role | 'all')}
						aria-selected={activeFilter === tab.id}
						aria-label={`${tab.label} (${tab.count})`}
					>
						<span>{tab.label}</span>
						<span className={styles.count}>({tab.count})</span>
					</button>
				))}
			</div>
		</div>
	);
};

export default MemberFilters;
