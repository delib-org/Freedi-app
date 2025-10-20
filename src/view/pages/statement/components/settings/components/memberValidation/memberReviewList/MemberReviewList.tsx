import React, { FC, useState } from 'react';
import { MemberReviewData } from '../MemberValidation';
import MemberReviewCard from '../memberReviewCard/MemberReviewCard';
import BanConfirmationModal from '../banConfirmationModal/BanConfirmationModal';
import styles from './MemberReviewList.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

interface Props {
	members: MemberReviewData[];
	onMemberAction: (userId: string, action: 'approve' | 'flag' | 'ban', reason?: string) => void;
	statementId: string;
}

const MemberReviewList: FC<Props> = ({ members, onMemberAction, statementId }) => {
	const { t } = useUserConfig();
	const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());
	const [banModalData, setBanModalData] = useState<{ member: MemberReviewData } | null>(null);
	const [selectAll, setSelectAll] = useState(false);

	const handleSelectMember = (userId: string, selected: boolean) => {
		setSelectedMembers(prev => {
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
			setSelectedMembers(new Set(members.map(m => m.userId)));
		}
		setSelectAll(!selectAll);
	};

	const handleBulkAction = (action: 'approve' | 'flag' | 'ban') => {
		selectedMembers.forEach(userId => {
			onMemberAction(userId, action);
		});
		setSelectedMembers(new Set());
		setSelectAll(false);
	};

	const openBanModal = (member: MemberReviewData) => {
		setBanModalData({ member });
	};

	const handleBanConfirm = (banType: 'soft' | 'hard', reason: string) => {
		if (banModalData) {
			onMemberAction(banModalData.member.userId, 'ban', reason);
			setBanModalData(null);
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
						<input
							type="checkbox"
							checked={selectAll}
							onChange={handleSelectAll}
						/>
						<span>{selectedMembers.size} {t('selected')}</span>
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
						<button
							className="btn btn--small btn--error"
							onClick={() => handleBulkAction('ban')}
						>
							{t('Ban Selected')}
						</button>
					</div>
				</div>
			)}

			<div className={styles.membersList}>
				{members.map(member => (
					<MemberReviewCard
						key={member.userId}
						member={member}
						isSelected={selectedMembers.has(member.userId)}
						onSelect={handleSelectMember}
						onApprove={() => onMemberAction(member.userId, 'approve')}
						onFlag={() => onMemberAction(member.userId, 'flag')}
						onBan={() => openBanModal(member)}
					/>
				))}
			</div>

			{banModalData && (
				<BanConfirmationModal
					member={banModalData.member}
					onConfirm={handleBanConfirm}
					onCancel={() => setBanModalData(null)}
				/>
			)}
		</div>
	);
};

export default MemberReviewList;