import React, { FC, useState, useEffect } from 'react';
import { Statement, User } from 'delib-npm';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import SectionTitle from '../sectionTitle/SectionTitle';
import SettingsModal from '../settingsModal/SettingsModal';
import MemberReviewList from './memberReviewList/MemberReviewList';
import styles from './MemberValidation.module.scss';
import { getUserDemographicResponses } from '@/controllers/db/userDemographic/getUserDemographic';
import { saveMemberValidationStatus } from '@/controllers/db/memberValidation/memberValidationStatus';
import { store } from '@/redux/store';

interface Props {
	statement: Statement;
}

export interface MemberReviewData {
	userId: string;
	user: User;
	responses: {
		questionId: string;
		question: string;
		answer: string | string[];
		answeredAt?: number;
	}[];
	joinedAt?: number;
	flags: string[];
	status: 'pending' | 'approved' | 'flagged' | 'banned';
}

const MemberValidation: FC<Props> = ({ statement }) => {
	const { t } = useUserConfig();
	const [showModal, setShowModal] = useState(false);
	const [members, setMembers] = useState<MemberReviewData[]>([]);
	const [loading, setLoading] = useState(false);
	const [filter, setFilter] = useState<'all' | 'pending' | 'flagged' | 'approved' | 'banned'>('all');

	useEffect(() => {
		// Load member responses on mount and when modal opens
		loadMemberResponses();
	}, [statement.statementId]);

	const loadMemberResponses = async () => {
		setLoading(true);
		try {
			const responses = await getUserDemographicResponses(statement.statementId);
			// Transform responses into MemberReviewData format
			// This will be implemented with actual data fetching
			setMembers(responses as MemberReviewData[]);
		} catch (error) {
			console.error('Error loading member responses:', error);
		} finally {
			setLoading(false);
		}
	};

	const closeModal = () => {
		setShowModal(false);
	};

	const handleMemberAction = async (userId: string, action: 'approve' | 'flag' | 'ban', reason?: string) => {
		try {
			// Get current user as reviewer
			const currentUser = store.getState().creator.creator;
			const reviewedBy = currentUser?.uid;

			// Save the validation status to Firestore
			await saveMemberValidationStatus(
				statement.statementId,
				userId,
				action === 'approve' ? 'approved' : action === 'flag' ? 'flagged' : 'banned',
				reason,
				reviewedBy
			);

			// Update local state
			setMembers(prev => prev.map(member =>
				member.userId === userId
					? { ...member, status: action === 'approve' ? 'approved' : action === 'flag' ? 'flagged' : 'banned' }
					: member
			));

			console.info(`Action ${action} for user ${userId} saved successfully`);
		} catch (error) {
			console.error(`Error performing action ${action} for user ${userId}:`, error);
		}
	};

	const filteredMembers = members.filter(member => {
		if (filter === 'all') return true;
		
return member.status === filter;
	});

	const getStatusCounts = () => {
		const counts = {
			all: members.length,
			pending: 0,
			flagged: 0,
			approved: 0,
			banned: 0
		};

		members.forEach(member => {
			counts[member.status]++;
		});

		return counts;
	};

	const counts = getStatusCounts();

	return (
		<div>
			<SectionTitle title={t('Member Validation')} />
			<div className='btns'>
				<button
					className='btn btn--secondary'
					onClick={() => setShowModal(true)}
				>
					{t('Review Members')} ({counts.pending} pending)
				</button>
			</div>

			{showModal && (
				<SettingsModal
					closeModal={closeModal}
					isFullScreen={true}
					customCloseWord={t('Close')}
				>
					<div className={styles.memberValidation}>
						<h2>{t('Member Validation & Review')}</h2>

						<div className={styles.filterTabs}>
							<button
								className={filter === 'all' ? styles.active : ''}
								onClick={() => setFilter('all')}
							>
								{t('All')} ({counts.all})
							</button>
							<button
								className={filter === 'pending' ? styles.active : ''}
								onClick={() => setFilter('pending')}
							>
								{t('Pending')} ({counts.pending})
							</button>
							<button
								className={filter === 'flagged' ? styles.active : ''}
								onClick={() => setFilter('flagged')}
							>
								{t('Flagged')} ({counts.flagged})
							</button>
							<button
								className={filter === 'approved' ? styles.active : ''}
								onClick={() => setFilter('approved')}
							>
								{t('Approved')} ({counts.approved})
							</button>
							<button
								className={filter === 'banned' ? styles.active : ''}
								onClick={() => setFilter('banned')}
							>
								{t('Banned')} ({counts.banned})
							</button>
						</div>

						{loading ? (
							<div className={styles.loading}>{t('Loading member data...')}</div>
						) : (
							<MemberReviewList
								members={filteredMembers}
								onMemberAction={handleMemberAction}
								statementId={statement.statementId}
								onRefresh={loadMemberResponses}
							/>
						)}
					</div>
				</SettingsModal>
			)}
		</div>
	);
};

export default MemberValidation;