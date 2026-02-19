import React, { FC, useState } from 'react';
import { Statement, Role } from '@freedi/shared-types';
import type { MemberReviewData } from '@/types/demographics';
import styles from './BanConfirmationModal.module.scss';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { canBanUser, getBanDisabledReason } from '@/helpers/roleHelpers';
import { logError } from '@/utils/errorHandling';

interface Props {
	member: MemberReviewData;
	statementId: string;
	statement: Statement;
	onConfirm: (banType: 'soft' | 'hard', reason: string, removeVotes: boolean) => void;
	onCancel: () => void;
}

const BanConfirmationModal: FC<Props> = ({ member, statement, onConfirm, onCancel }) => {
	const { t } = useTranslation();
	const [banType, setBanType] = useState<'soft' | 'hard'>('soft');
	const [reason, setReason] = useState('');
	const [removeVotes, setRemoveVotes] = useState(true); // Default to removing votes

	// Safety check: verify user can be banned
	const userCanBeBanned = canBanUser(member.role, member.userId, statement);
	const banDisabledReason = getBanDisabledReason(member.role, member.userId, statement);

	const getRoleBadge = () => {
		if (member.role === Role.admin) {
			return <span className={`${styles.roleBadge} ${styles.admin}`}>{t('Admin')}</span>;
		}
		if (member.role === Role.creator || statement.creator?.uid === member.userId) {
			return <span className={`${styles.roleBadge} ${styles.creator}`}>{t('Creator')}</span>;
		}

		return null;
	};

	const handleConfirm = () => {
		// Final safety check before confirming
		if (!userCanBeBanned) {
			logError(banDisabledReason, { operation: 'banConfirmationModal.BanConfirmationModal.handleConfirm', metadata: { message: 'Attempted to ban protected user:' } });

			return;
		}

		// Pass the removeVotes flag to the parent component
		onConfirm(banType, reason, removeVotes);
	};

	return (
		<div className={styles.modalOverlay}>
			<div className={styles.modal}>
				<h2>
					{t('Remove Member')}: {member.user.displayName}
					{getRoleBadge()}
				</h2>

				{!userCanBeBanned ? (
					<div className={styles.errorMessage}>🚫 {banDisabledReason}</div>
				) : (
					<div className={styles.warningMessage}>
						⚠️ {t('This action cannot be undone. Please review carefully before proceeding.')}
					</div>
				)}

				<div className={styles.banOptions}>
					<label className={styles.radioOption}>
						<input
							type="radio"
							name="banType"
							checked={banType === 'soft'}
							onChange={() => setBanType('soft')}
						/>
						<div>
							<strong>{t('Remove from this discussion only')}</strong>
							<p>{t('Member will be removed from this specific statement/discussion')}</p>
						</div>
					</label>

					<label className={styles.radioOption}>
						<input
							type="radio"
							name="banType"
							checked={banType === 'hard'}
							onChange={() => setBanType('hard')}
						/>
						<div>
							<strong>{t('Ban from all community discussions')}</strong>
							<p>{t('Member will be banned from all your community statements')}</p>
						</div>
					</label>
				</div>

				<div className={styles.removeVotesOption}>
					<label>
						<input
							type="checkbox"
							checked={removeVotes}
							onChange={(e) => setRemoveVotes(e.target.checked)}
						/>
						<span>{t('Remove all votes and evaluations from this member')}</span>
					</label>
					<small className={styles.note}>
						{t("This will recalculate all voting results without this member's input")}
					</small>
				</div>

				<div className={styles.reasonSection}>
					<label htmlFor="banReason">
						{t('Reason for removal')} ({t('optional')})
					</label>
					<textarea
						id="banReason"
						placeholder={t('e.g., Spam responses, Bot-like behavior, Duplicate account...')}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
						rows={3}
					/>
				</div>

				{member.responses.length > 0 && (
					<div className={styles.memberInfo}>
						<h4>{t('Member Responses')}:</h4>
						<div className={styles.responsesList}>
							{member.responses.slice(0, 3).map((response, idx) => (
								<div key={idx} className={styles.responsePreview}>
									<strong>{response.question}:</strong>
									<span>
										{Array.isArray(response.answer) ? response.answer.join(', ') : response.answer}
									</span>
								</div>
							))}
							{member.responses.length > 3 && (
								<p className={styles.more}>
									{t('...and')} {member.responses.length - 3} {t('more responses')}
								</p>
							)}
						</div>
					</div>
				)}

				<div className={styles.actions}>
					<button className="btn btn--error" onClick={handleConfirm} disabled={!userCanBeBanned}>
						{banType === 'hard' ? t('Ban Member') : t('Remove Member')}
					</button>
					<button className="btn btn--secondary" onClick={onCancel}>
						{t('Cancel')}
					</button>
				</div>
			</div>
		</div>
	);
};

export default BanConfirmationModal;
