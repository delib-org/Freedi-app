import React, { FC, useState, useMemo } from 'react';
import { Statement, StatementSubscription, Role } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import styles from './EnhancedMembersManagement.module.scss';
import {
	Users,
	UserPlus,
	UserMinus,
	Shield,
	Search,
	Filter,
	ChevronDown,
	ChevronUp,
	Mail,
	Calendar,
	Activity,
	XCircle,
	MoreVertical,
	Download,
	Ban,
	EyeOff,
	Crown,
} from 'lucide-react';

interface EnhancedMembersManagementProps {
	statement: Statement;
}

interface MemberCardProps {
	member: StatementSubscription;
	onRoleChange: (userId: string, newRole: Role) => void;
	onRemove: (userId: string) => void;
	isExpanded: boolean;
	onToggleExpand: () => void;
}

const roleConfig = {
	[Role.admin]: {
		label: 'Admin',
		icon: Crown,
		color: '#ff9800',
		description: 'Full control over statement and members',
	},
	[Role.member]: {
		label: 'Member',
		icon: Users,
		color: '#4caf50',
		description: 'Can participate and contribute',
	},
	[Role.banned]: {
		label: 'Banned',
		icon: Ban,
		color: '#f44336',
		description: 'Blocked from accessing statement',
	},
};

const MemberCard: FC<MemberCardProps> = ({
	member,
	onRoleChange,
	onRemove,
	isExpanded,
	onToggleExpand,
}) => {
	const { t } = useTranslation();
	const [showActions, setShowActions] = useState(false);
	const RoleIcon = roleConfig[member.role].icon;

	// Calculate member statistics
	const memberSince = new Date(member.createdAt).toLocaleDateString();
	const lastActive = member.lastUpdate ? new Date(member.lastUpdate).toLocaleDateString() : 'Never';
	const isOnline = member.lastUpdate && Date.now() - member.lastUpdate < 5 * 60 * 1000;

	return (
		<div className={`${styles.memberCard} ${isExpanded ? styles['memberCard--expanded'] : ''}`}>
			<div className={styles.memberHeader} onClick={onToggleExpand}>
				<div className={styles.memberInfo}>
					<div className={styles.memberAvatar}>
						{member.user.photoURL ? (
							<img src={member.user.photoURL} alt={member.user.displayName} />
						) : (
							<div className={styles.avatarPlaceholder}>
								{member.user.displayName?.charAt(0).toUpperCase()}
							</div>
						)}
						{isOnline && <div className={styles.onlineIndicator} />}
					</div>
					<div className={styles.memberDetails}>
						<h4 className={styles.memberName}>
							{member.user.displayName}
							{member.user.isAnonymous && (
								<span className={styles.anonymousBadge}>
									<EyeOff size={14} />
									{t('Anonymous')}
								</span>
							)}
						</h4>
						<div className={styles.memberMeta}>
							<span className={`${styles.roleBadge} ${styles[`roleBadge--${member.role}`]}`}>
								<RoleIcon size={14} />
								{t(roleConfig[member.role].label)}
							</span>
							<span className={styles.memberSince}>
								<Calendar size={14} />
								{t('Since')} {memberSince}
							</span>
						</div>
					</div>
				</div>
				<div className={styles.memberActions}>
					<button
						className={styles.actionButton}
						onClick={(e) => {
							e.stopPropagation();
							setShowActions(!showActions);
						}}
					>
						<MoreVertical size={18} />
					</button>
					<div className={styles.expandIcon}>
						{isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
					</div>
				</div>
			</div>

			{showActions && (
				<div className={styles.actionMenu}>
					<button
						className={styles.actionMenuItem}
						onClick={() => onRoleChange(member.user.uid, Role.admin)}
						disabled={member.role === Role.admin}
					>
						<Crown size={16} />
						{t('Make Admin')}
					</button>
					<button
						className={styles.actionMenuItem}
						onClick={() => onRoleChange(member.user.uid, Role.member)}
						disabled={member.role === Role.member}
					>
						<Users size={16} />
						{t('Make Member')}
					</button>
					<button
						className={`${styles.actionMenuItem} ${styles['actionMenuItem--danger']}`}
						onClick={() => onRoleChange(member.user.uid, Role.banned)}
						disabled={member.role === Role.banned}
					>
						<Ban size={16} />
						{t('Ban Member')}
					</button>
					<button
						className={`${styles.actionMenuItem} ${styles['actionMenuItem--danger']}`}
						onClick={() => onRemove(member.user.uid)}
					>
						<UserMinus size={16} />
						{t('Remove Member')}
					</button>
				</div>
			)}

			{isExpanded && (
				<div className={styles.memberExpanded}>
					<div className={styles.memberStats}>
						<div className={styles.statItem}>
							<Activity size={16} />
							<span className={styles.statLabel}>{t('Last Active')}</span>
							<span className={styles.statValue}>{lastActive}</span>
						</div>
						<div className={styles.statItem}>
							<Mail size={16} />
							<span className={styles.statLabel}>{t('In-App')}</span>
							<span className={styles.statValue}>
								{member.getInAppNotification ? t('On') : t('Off')}
							</span>
						</div>
						<div className={styles.statItem}>
							<Mail size={16} />
							<span className={styles.statLabel}>{t('Email')}</span>
							<span className={styles.statValue}>
								{member.getEmailNotification ? t('On') : t('Off')}
							</span>
						</div>
						<div className={styles.statItem}>
							<Mail size={16} />
							<span className={styles.statLabel}>{t('Push')}</span>
							<span className={styles.statValue}>
								{member.getPushNotification ? t('On') : t('Off')}
							</span>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

const EnhancedMembersManagement: FC<EnhancedMembersManagementProps> = ({ statement }) => {
	const { t } = useTranslation();
	const [searchTerm, setSearchTerm] = useState('');
	const [filterRole, setFilterRole] = useState<Role | 'all'>('all');
	const [sortBy, setSortBy] = useState<'name' | 'role' | 'joinDate' | 'activity'>('name');
	const [expandedMembers, setExpandedMembers] = useState<Set<string>>(new Set());
	const [showFilters, setShowFilters] = useState(false);

	// Get members from Redux
	const members = useAppSelector((state) =>
		state.statements.statementMembership.filter(
			(m: StatementSubscription) => m.statementId === statement.statementId,
		),
	);

	// Filter and sort members
	const filteredMembers = useMemo(() => {
		let filtered = [...members];

		// Apply search filter
		if (searchTerm) {
			filtered = filtered.filter((m) =>
				m.user.displayName?.toLowerCase().includes(searchTerm.toLowerCase()),
			);
		}

		// Apply role filter
		if (filterRole !== 'all') {
			filtered = filtered.filter((m) => m.role === filterRole);
		}

		// Apply sorting
		filtered.sort((a, b) => {
			switch (sortBy) {
				case 'name':
					return (a.user.displayName || '').localeCompare(b.user.displayName || '');
				case 'role':
					return a.role.localeCompare(b.role);
				case 'joinDate':
					return a.createdAt - b.createdAt;
				case 'activity':
					return (b.lastUpdate || 0) - (a.lastUpdate || 0);
				default:
					return 0;
			}
		});

		return filtered;
	}, [members, searchTerm, filterRole, sortBy]);

	// Role statistics
	const roleStats = useMemo(() => {
		const stats = {
			[Role.admin]: 0,
			[Role.member]: 0,
			[Role.banned]: 0,
		};
		members.forEach((m) => {
			stats[m.role]++;
		});

		return stats;
	}, [members]);

	const handleRoleChange = (userId: string, newRole: Role) => {
		// Implementation for role change
		console.info('Change role for', userId, 'to', newRole);
	};

	const handleRemoveMember = (userId: string) => {
		// Implementation for removing member
		console.info('Remove member', userId);
	};

	const toggleMemberExpand = (userId: string) => {
		const newExpanded = new Set(expandedMembers);
		if (newExpanded.has(userId)) {
			newExpanded.delete(userId);
		} else {
			newExpanded.add(userId);
		}
		setExpandedMembers(newExpanded);
	};

	const exportMembers = () => {
		// Implementation for exporting members list
		console.info('Export members');
	};

	return (
		<div className={styles.membersManagement}>
			{/* Header with Statistics */}
			<div className={styles.header}>
				<div className={styles.headerTop}>
					<h3 className={styles.title}>
						<Users size={20} />
						{t('Members')} ({members.length})
					</h3>
					<button className={styles.exportButton} onClick={exportMembers}>
						<Download size={16} />
						{t('Export')}
					</button>
				</div>

				<div className={styles.roleStats}>
					{Object.entries(roleStats).map(([role, count]) => {
						const config = roleConfig[role as Role];
						const Icon = config.icon;

						return (
							<div
								key={role}
								className={`${styles.roleStat} ${styles[`roleStat--${role}`]}`}
								style={{ borderColor: config.color }}
							>
								<Icon size={16} style={{ color: config.color }} />
								<span className={styles.roleStatLabel}>{t(config.label)}</span>
								<span className={styles.roleStatCount}>{count}</span>
							</div>
						);
					})}
				</div>
			</div>

			{/* Search and Filters */}
			<div className={styles.controls}>
				<div className={styles.searchBar}>
					<Search size={18} />
					<input
						type="text"
						placeholder={t('Search members by name...')}
						value={searchTerm}
						onChange={(e) => setSearchTerm(e.target.value)}
						className={styles.searchInput}
					/>
					{searchTerm && (
						<button className={styles.clearSearch} onClick={() => setSearchTerm('')}>
							<XCircle size={16} />
						</button>
					)}
				</div>

				<button
					className={`${styles.filterButton} ${showFilters ? styles['filterButton--active'] : ''}`}
					onClick={() => setShowFilters(!showFilters)}
				>
					<Filter size={16} />
					{t('Filters')}
					{filterRole !== 'all' && <span className={styles.filterBadge}>1</span>}
				</button>
			</div>

			{/* Filter Panel */}
			{showFilters && (
				<div className={styles.filterPanel}>
					<div className={styles.filterGroup}>
						<label className={styles.filterLabel}>{t('Role')}</label>
						<select
							value={filterRole}
							onChange={(e) => setFilterRole(e.target.value as Role | 'all')}
							className={styles.filterSelect}
						>
							<option value="all">{t('All Roles')}</option>
							{Object.entries(roleConfig).map(([role, config]) => (
								<option key={role} value={role}>
									{t(config.label)}
								</option>
							))}
						</select>
					</div>

					<div className={styles.filterGroup}>
						<label className={styles.filterLabel}>{t('Sort By')}</label>
						<select
							value={sortBy}
							onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
							className={styles.filterSelect}
						>
							<option value="name">{t('Name')}</option>
							<option value="role">{t('Role')}</option>
							<option value="joinDate">{t('Join Date')}</option>
							<option value="activity">{t('Last Activity')}</option>
						</select>
					</div>

					<button
						className={styles.clearFilters}
						onClick={() => {
							setFilterRole('all');
							setSortBy('name');
							setSearchTerm('');
						}}
					>
						{t('Clear All Filters')}
					</button>
				</div>
			)}

			{/* Members List */}
			<div className={styles.membersList}>
				{filteredMembers.length > 0 ? (
					filteredMembers.map((member) => (
						<MemberCard
							key={member.user.uid}
							member={member}
							onRoleChange={handleRoleChange}
							onRemove={handleRemoveMember}
							isExpanded={expandedMembers.has(member.user.uid)}
							onToggleExpand={() => toggleMemberExpand(member.user.uid)}
						/>
					))
				) : (
					<div className={styles.emptyState}>
						<Users size={48} />
						<h4>{t('No members found')}</h4>
						<p>{t('Try adjusting your search or filters')}</p>
					</div>
				)}
			</div>

			{/* Bulk Actions */}
			{filteredMembers.length > 0 && (
				<div className={styles.bulkActions}>
					<button className={styles.bulkButton}>
						<Mail size={16} />
						{t('Message All')}
					</button>
					<button className={styles.bulkButton}>
						<UserPlus size={16} />
						{t('Invite Members')}
					</button>
					<button className={styles.bulkButton}>
						<Shield size={16} />
						{t('Permissions')}
					</button>
				</div>
			)}
		</div>
	);
};

export default EnhancedMembersManagement;
