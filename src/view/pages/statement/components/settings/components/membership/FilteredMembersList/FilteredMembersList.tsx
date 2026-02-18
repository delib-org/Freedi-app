import { FC, useState, useEffect, useCallback, useMemo } from 'react';
import styles from './FilteredMembersList.module.scss';
import { StatementSubscription, Role } from '@freedi/shared-types';
import MemberCard from '../EnhancedMemberCard/EnhancedMemberCard';
import { useTranslation } from '@/controllers/hooks/useTranslation';

interface FilteredMembersListProps {
	members: StatementSubscription[];
	searchTerm: string;
	roleFilter: Role | 'all';
	initialLoadCount?: number;
	loadMoreCount?: number;
}

const FilteredMembersList: FC<FilteredMembersListProps> = ({
	members,
	searchTerm,
	roleFilter,
	initialLoadCount = 10,
	loadMoreCount = 20,
}) => {
	const { t } = useTranslation();
	const [displayCount, setDisplayCount] = useState(initialLoadCount);
	const [isLoading, setIsLoading] = useState(false);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	// Filter members based on search and role
	const filteredMembers = useMemo(() => {
		let filtered = [...members];

		// Apply role filter
		if (roleFilter !== 'all') {
			filtered = filtered.filter((member) => member.role === roleFilter);
		}

		// Apply search filter
		if (searchTerm) {
			const searchLower = searchTerm.toLowerCase();
			filtered = filtered.filter((member) =>
				member.user.displayName.toLowerCase().includes(searchLower),
			);
		}

		// Sort by role (admins first) then by name
		filtered.sort((a, b) => {
			// Admins first
			if (a.role === Role.admin && b.role !== Role.admin) return -1;
			if (a.role !== Role.admin && b.role === Role.admin) return 1;

			// Then banned users last
			if (a.role === Role.banned && b.role !== Role.banned) return 1;
			if (a.role !== Role.banned && b.role === Role.banned) return -1;

			// Finally sort by name
			return a.user.displayName.localeCompare(b.user.displayName);
		});

		return filtered;
	}, [members, searchTerm, roleFilter]);

	// Members to display
	const displayedMembers = useMemo(() => {
		return filteredMembers.slice(0, displayCount);
	}, [filteredMembers, displayCount]);

	const hasMore = displayCount < filteredMembers.length;
	const remainingCount = filteredMembers.length - displayCount;

	// Reset display count when filters change
	useEffect(() => {
		setDisplayCount(initialLoadCount);
	}, [searchTerm, roleFilter, initialLoadCount]);

	// Simulate initial load
	useEffect(() => {
		const timer = setTimeout(() => {
			setIsInitialLoad(false);
		}, 500);

		return () => clearTimeout(timer);
	}, []);

	const handleLoadMore = useCallback(async () => {
		setIsLoading(true);

		// Simulate API delay
		await new Promise((resolve) => setTimeout(resolve, 500));

		setDisplayCount((prev) => prev + loadMoreCount);
		setIsLoading(false);
	}, [loadMoreCount]);

	// Empty state
	if (!isInitialLoad && filteredMembers.length === 0) {
		return (
			<div className={styles.emptyState}>
				<div className={styles.emptyIcon}>
					<svg width="40" height="40" viewBox="0 0 40 40" fill="currentColor">
						<path d="M20 4C11.16 4 4 11.16 4 20s7.16 16 16 16 16-7.16 16-16S28.84 4 20 4zm0 30c-7.73 0-14-6.27-14-14S12.27 6 20 6s14 6.27 14 14-6.27 14-14 14z" />
						<path d="M15 17.5c0 .83-.67 1.5-1.5 1.5S12 18.33 12 17.5 12.67 16 13.5 16s1.5.67 1.5 1.5zm11 0c0 .83-.67 1.5-1.5 1.5S23 18.33 23 17.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5zM20 26c-2.33 0-4.32-1.45-5.12-3.5h10.24c-.8 2.05-2.79 3.5-5.12 3.5z" />
					</svg>
				</div>
				<h3 className={styles.emptyTitle}>
					{searchTerm
						? t('No members found')
						: roleFilter === Role.banned
							? t('No banned users')
							: roleFilter === Role.admin
								? t('No admins')
								: t('No members yet')}
				</h3>
				<p className={styles.emptyDescription}>
					{searchTerm
						? t('Try adjusting your search terms')
						: roleFilter === Role.banned
							? t('All users are in good standing')
							: t('Members will appear here once they join')}
				</p>
			</div>
		);
	}

	// Loading skeleton
	if (isInitialLoad) {
		return (
			<div className={styles.skeleton}>
				{[...Array(5)].map((_, index) => (
					<div key={index} className={styles.skeletonCard}>
						<div className={styles.skeletonAvatar} />
						<div className={styles.skeletonContent}>
							<div className={styles.skeletonName} />
							<div className={styles.skeletonMeta} />
						</div>
						<div className={styles.skeletonActions}>
							<div className={styles.skeletonButton} />
							<div className={styles.skeletonButton} />
						</div>
					</div>
				))}
			</div>
		);
	}

	return (
		<div className={styles.membersListContainer}>
			<div className={styles.membersList}>
				{displayedMembers.map((member) => (
					<MemberCard key={member.user.uid} member={member} searchTerm={searchTerm} />
				))}
			</div>

			{hasMore && (
				<div className={styles.loadMoreContainer}>
					<button
						className={styles.loadMoreButton}
						onClick={handleLoadMore}
						disabled={isLoading}
						aria-label={t('Load more members')}
					>
						{isLoading && <span className={styles.spinner} />}
						<span>
							{isLoading
								? t('Loading...')
								: `${t('Load More')} (${remainingCount} ${t('remaining')})`}
						</span>
					</button>
					{isLoading && <p className={styles.loadingText}>{t('Loading more members...')}</p>}
				</div>
			)}
		</div>
	);
};

export default FilteredMembersList;
