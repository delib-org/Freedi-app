import React, { FC, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { MemberReviewData } from '../MemberValidation';
import MemberReviewCard from '../memberReviewCard/MemberReviewCard';
import BanConfirmationModal from '../banConfirmationModal/BanConfirmationModal';
import styles from './MemberReviewList.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { banMember } from '@/controllers/db/membership/banMember';
import { canBanUser } from '@/helpers/roleHelpers';

interface Props {
	members: MemberReviewData[];
	onMemberAction: (userId: string, action: 'approve' | 'flag' | 'ban', reason?: string) => void;
	statementId: string;
	statement: Statement;
	onRefresh?: () => void;
}

const MemberReviewList: FC<Props> = ({
	members,
	onMemberAction,
	statementId,
	statement,
	onRefresh,
}) => {
	const { t } = useTranslation();
	const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
	const [banModalData, setBanModalData] = useState<{ member: MemberReviewData } | null>(null);
	const [selectAll, setSelectAll] = useState(false);

	const handleSelectMember = (userId: string, selected: boolean) => {
		setSelectedMembers((prev) => {
			const newSet = new Set(prev);
			if (selected) {
				newSet.add(userId);
			} else {
				newSet.delete(userId);
			}

			return newSet;
		});
	};

	const handleSelectAll = () => {
		if (selectAll) {
			setSelectedMembers(new Set());
		} else {
			// Only select members that can be banned (filter out admins/creators)
			const bannableMembers = members.filter((m) => canBanUser(m.role, m.userId, statement));
			setSelectedMembers(new Set(bannableMembers.map((m) => m.userId)));
		}
		setSelectAll(!selectAll);
	};

	const handleBulkAction = async (action: 'approve' | 'flag' | 'ban') => {
		// For bulk bans, we should also handle the banMember function
		if (action === 'ban') {
			for (const userId of selectedMembers) {
				// Call the actual ban function for each member
				await banMember(
					statementId,
					userId,
					'Bulk ban action',
					true, // removeVotes
				);
				// Update the UI state
				await onMemberAction(userId, action, 'Bulk ban action');
			}
			// Refresh after all bans are complete
			if (onRefresh) {
				setTimeout(() => {
					onRefresh();
				}, 500);
			}
		} else {
			// For approve and flag actions, just update the status
			for (const userId of selectedMembers) {
				await onMemberAction(userId, action);
			}
		}
		setSelectedMembers(new Set());
		setSelectAll(false);
	};

	const openBanModal = (member: MemberReviewData) => {
		setBanModalData({ member });
	};

	const handleBanConfirm = async (
		banType: 'soft' | 'hard',
		reason: string,
		removeVotes: boolean,
	) => {
		if (banModalData) {
			try {
				// Call the actual ban function
				await banMember(
					statementId,
					banModalData.member.userId,
					reason || 'No reason provided',
					removeVotes,
				);

				// Update the UI state
				await onMemberAction(banModalData.member.userId, 'ban', reason);
				setBanModalData(null);

				// Refresh the members list to ensure UI is up to date
				if (onRefresh) {
					setTimeout(() => {
						onRefresh();
					}, 500); // Small delay to ensure Firestore has updated
				}

				// Show success feedback
				console.info('Member banned successfully');
			} catch (error) {
				console.error('Error banning member:', error);
				// TODO: Show error notification to user
			}
		}
	};

	if (members.length === 0) {
		return (
			<div className={styles.emptyState}>
				<p>{t('No members found with survey responses')}</p>
			</div>
		);
	}

	return (
		<div className={styles.memberReviewList}>
			{selectedMembers.size > 0 && (
				<div className={styles.bulkActions}>
					<div className={styles.selectionInfo}>
						<input type="checkbox" checked={selectAll} onChange={handleSelectAll} />
						<span>
							{selectedMembers.size} {t('selected')}
						</span>
					</div>
					<div className={styles.actions}>
						<button
							className="btn btn--small btn--primary"
							onClick={() => handleBulkAction('approve')}
						>
							{t('Approve Selected')}
						</button>
						<button
							className="btn btn--small btn--secondary"
							onClick={() => handleBulkAction('flag')}
						>
							{t('Flag Selected')}
						</button>
						<button className="btn btn--small btn--error" onClick={() => handleBulkAction('ban')}>
							{t('Ban Selected')}
						</button>
					</div>
				</div>
			)}

			<div className={styles.membersList}>
				{members.map((member) => {
					const isBannable = canBanUser(member.role, member.userId, statement);

					return (
						<MemberReviewCard
							key={member.userId}
							member={member}
							statement={statement}
							isSelected={selectedMembers.has(member.userId)}
							onSelect={handleSelectMember}
							onApprove={() => onMemberAction(member.userId, 'approve')}
							onFlag={() => onMemberAction(member.userId, 'flag')}
							onBan={() => openBanModal(member)}
							canBan={isBannable}
						/>
					);
				})}
			</div>

			{banModalData && (
				<BanConfirmationModal
					member={banModalData.member}
					statementId={statementId}
					statement={statement}
					onConfirm={handleBanConfirm}
					onCancel={() => setBanModalData(null)}
				/>
			)}
		</div>
	);
};

export default MemberReviewList;
