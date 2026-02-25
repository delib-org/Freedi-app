import { FC } from 'react';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { Statement, User } from '@freedi/shared-types';
import { setEvaluationToDB } from '@/controllers/db/evaluation/setEvaluation';
import { auth } from '@/controllers/db/config';
import { userVotedStatementsInParentSelector } from '@/redux/evaluations/evaluationsSlice';
import { statementsSelector } from '@/redux/statements/statementsSlice';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './EvaluationManagementModal.module.scss';
import CloseIcon from '@/assets/icons/close.svg?react';
import { logError } from '@/utils/errorHandling';
import { getPseudoName } from '@/utils/temporalNameGenerator';

interface Props {
	parentStatement: Statement;
	maxVotes: number;
	onClose: () => void;
	onVoteRemoved?: () => void;
}

const EvaluationManagementModal: FC<Props> = ({
	parentStatement,
	maxVotes,
	onClose,
	onVoteRemoved,
}) => {
	const { t } = useTranslation();

	const votedStatementIds = useAppSelector(
		userVotedStatementsInParentSelector(parentStatement.statementId),
	);

	const allStatements = useAppSelector(statementsSelector);

	const handleRemoveVote = async (statementId: string) => {
		const user = auth.currentUser;
		if (!user) return;

		const creator: User = {
			displayName: user.displayName || getPseudoName(user.uid),
			email: user.email || '',
			photoURL: user.photoURL || '',
			uid: user.uid,
		};

		const statement = allStatements.find((s) => s.statementId === statementId);
		if (!statement) return;

		try {
			// Set evaluation to 0 to remove the vote
			await setEvaluationToDB(statement, creator, 0);

			// Call callback if provided
			if (onVoteRemoved) {
				onVoteRemoved();
			}

			// Close modal after successful removal
			onClose();
		} catch (error) {
			logError(error, { operation: 'evaluationManagement.EvaluationManagementModal.statement', metadata: { message: 'Error removing vote:' } });
		}
	};

	return (
		<div className={styles.modalOverlay} onClick={onClose}>
			<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
				<div className={styles.header}>
					<h2>{t('Manage Your Votes')}</h2>
					<button className={styles.closeButton} onClick={onClose} aria-label="Close modal">
						<CloseIcon />
					</button>
				</div>

				<div className={styles.content}>
					<p className={styles.message}>
						{t("You've reached the maximum of")} {maxVotes}{' '}
						{maxVotes !== 1 ? t('votes') : t('vote')}.
						{t('Please remove a vote from another option to vote for this one')}.
					</p>

					<div className={styles.votesList}>
						<h3>
							{t('Your Current Votes')} ({votedStatementIds.length}/{maxVotes})
						</h3>
						{votedStatementIds.length === 0 ? (
							<p className={styles.noVotes}>{t('No votes yet')}</p>
						) : (
							<ul>
								{votedStatementIds.map((statementId) => {
									const statement = allStatements.find((s) => s.statementId === statementId);

									return statement ? (
										<li key={statementId} className={styles.voteItem}>
											<span className={styles.statementText}>{statement.statement}</span>
											<button
												className={styles.removeButton}
												onClick={() => handleRemoveVote(statementId)}
												aria-label={`Remove vote from ${statement.statement}`}
											>
												{t('Remove')}
											</button>
										</li>
									) : null;
								})}
							</ul>
						)}
					</div>
				</div>

				<div className={styles.footer}>
					<button className={styles.cancelButton} onClick={onClose}>
						{t('Cancel')}
					</button>
				</div>
			</div>
		</div>
	);
};

export default EvaluationManagementModal;
