import { FC, useState, useMemo, useCallback } from 'react';
import { createSelector } from '@reduxjs/toolkit';
import { useParams } from 'react-router';
import styles from './MembersManagement.module.scss';
import { StatementSubscription, Role, Statement } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { RootState } from '@/redux/store';
import MemberFilters from '../MemberFilters/MemberFilters';
import FilteredMembersList from '../FilteredMembersList/FilteredMembersList';
import ShareIcon from '@/assets/icons/shareIcon.svg?react';
import { logError } from '@/utils/errorHandling';

interface MembersManagementProps {
	statement: Statement;
}

const MembersManagement: FC<MembersManagementProps> = ({ statement }) => {
	const { statementId } = useParams();
	const { t } = useTranslation();

	// State for filters
	const [searchTerm, setSearchTerm] = useState('');
	const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');

	// Selector for statement memberships
	const statementMembershipSelector = useMemo(
		() =>
			createSelector(
				(state: RootState) => state.statements.statementMembership,
				(memberships) =>
					memberships.filter(
						(membership: StatementSubscription) => membership.statementId === statementId,
					),
			),
		[statementId],
	);

	const members: StatementSubscription[] = useAppSelector(statementMembershipSelector);

	// Calculate member counts by role
	const memberCounts = useMemo(() => {
		const counts = {
			all: members.length,
			admin: 0,
			member: 0,
			banned: 0,
		};

		members.forEach((member) => {
			if (member.role === Role.admin) counts.admin++;
			else if (member.role === Role.banned) counts.banned++;
			else if (member.role === Role.member) counts.member++;
		});

		return counts;
	}, [members]);

	// Handle search change
	const handleSearchChange = useCallback((term: string) => {
		setSearchTerm(term);
	}, []);

	// Handle role filter change
	const handleRoleFilterChange = useCallback((role: Role | 'all') => {
		setRoleFilter(role);
	}, []);

	// Handle share functionality
	const handleShare = useCallback(() => {
		const baseUrl = window.location.origin;
		const shareData = {
			title: t('FreeDi: Empowering Agreements'),
			text: t('Invited:') + ' ' + statement?.statement,
			url: `${baseUrl}/statement-an/true/${statement?.statementId}/options`,
		};

		if (navigator.share) {
			navigator.share(shareData).catch((error) => {
				logError(error, { operation: 'MembersManagement.MembersManagement.handleShare', metadata: { message: 'Error sharing:' } });
			});
		} else {
			// Fallback: Copy to clipboard
			navigator.clipboard.writeText(shareData.url).then(
				() => {
					// You could show a toast notification here
					console.info('Link copied to clipboard');
				},
				(error) => {
					logError(error, { operation: 'MembersManagement.MembersManagement.handleShare', metadata: { message: 'Failed to copy link:' } });
				},
			);
		}
	}, [statement, t]);

	if (!members) return null;

	return (
		<div className={styles.membersManagement}>
			{/* Header Section */}
			<div className={styles.header}>
				<div className={styles.headerInfo}>
					<h2 className={styles.title}>{t('Member Management')}</h2>
					<p className={styles.memberCount}>{`${members.length} ${t('total members')}`}</p>
				</div>

				<button
					className={styles.shareButton}
					onClick={handleShare}
					aria-label={t('Share invitation link')}
				>
					<ShareIcon />
					<span>{t('Invite')}</span>
				</button>
			</div>

			{/* Stats Cards */}
			<div className={styles.statsCards}>
				<div className={styles.statCard}>
					<div className={styles.statNumber}>{memberCounts.admin}</div>
					<div className={styles.statLabel}>{t('Admins')}</div>
				</div>
				<div className={styles.statCard}>
					<div className={styles.statNumber}>{memberCounts.member}</div>
					<div className={styles.statLabel}>{t('Members')}</div>
				</div>
				<div className={styles.statCard}>
					<div className={styles.statNumber}>{memberCounts.banned}</div>
					<div className={styles.statLabel}>{t('Banned')}</div>
				</div>
			</div>

			{/* Filters Section */}
			<MemberFilters
				onSearchChange={handleSearchChange}
				onRoleFilterChange={handleRoleFilterChange}
				memberCounts={memberCounts}
				activeFilter={roleFilter}
			/>

			{/* Members List */}
			<FilteredMembersList
				members={members}
				searchTerm={searchTerm}
				roleFilter={roleFilter}
				initialLoadCount={10}
				loadMoreCount={20}
			/>
		</div>
	);
};

export default MembersManagement;
