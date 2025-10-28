import { FC, useState, useEffect } from 'react';
import { Statement } from 'delib-npm';
import { EvidenceType } from 'delib-npm/dist/models/evidence/evidenceModel';
import { getSupportLabel, getSupportColor } from '../../popperHebbianHelpers';
import { submitVote, removeVote, getUserVote } from '@/controllers/db/popperHebbian/evidenceController';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import AddEvidenceModal from '../AddEvidenceModal/AddEvidenceModal';
import styles from './EvidencePost.module.scss';

interface EvidencePostProps {
	statement: Statement;
}

const EvidencePost: FC<EvidencePostProps> = ({ statement }) => {
	const { user } = useAuthentication();
	const { t } = useUserConfig();
	const [userVote, setUserVote] = useState<'helpful' | 'not-helpful' | null>(null);
	const [showEditModal, setShowEditModal] = useState(false);
	const [previousEvidenceType, setPreviousEvidenceType] = useState<EvidenceType | undefined>(undefined);

	const evidence = statement.evidence;

	if (!evidence) {
		return null;
	}

	const { support, evidenceType, helpfulCount = 0, notHelpfulCount = 0 } = evidence;
	const netScore = helpfulCount - notHelpfulCount;
	const supportColor = getSupportColor(support);
	const supportLabel = getSupportLabel(support, t);

	const getEvidenceTypeLabel = (type: EvidenceType): string => {
		switch (type) {
			case EvidenceType.data:
				return t('Data');
			case EvidenceType.testimony:
				return t('Testimony');
			case EvidenceType.argument:
				return t('Argument');
			case EvidenceType.anecdote:
				return t('Anecdote');
			case EvidenceType.fallacy:
				return t('Fallacy');
			default:
				return t('Evidence');
		}
	};

	const getEvidenceTypeColor = (type: EvidenceType): string => {
		switch (type) {
			case EvidenceType.data:
				return 'data';
			case EvidenceType.testimony:
				return 'testimony';
			case EvidenceType.argument:
				return 'argument';
			case EvidenceType.anecdote:
				return 'anecdote';
			case EvidenceType.fallacy:
				return 'fallacy';
			default:
				return 'evidence';
		}
	};

	const handleVote = async (voteType: 'helpful' | 'not-helpful'): Promise<void> => {
		if (!user?.uid) return;

		try {
			if (userVote === voteType) {
				// User clicked the same vote - remove it
				await removeVote(statement.statementId, user.uid);
				setUserVote(null);
			} else {
				// User voted or changed vote
				await submitVote(statement.statementId, user.uid, voteType);
				setUserVote(voteType);
			}
		} catch (error) {
			console.error('Error voting on evidence:', error);
		}
	};

	// Load user's existing vote
	useEffect(() => {
		if (user?.uid) {
			getUserVote(statement.statementId, user.uid).then(vote => {
				setUserVote(vote);
			});
		}
	}, [statement.statementId, user?.uid]);

	// Track evidence type changes for notification
	useEffect(() => {
		if (evidence && previousEvidenceType !== undefined && previousEvidenceType !== evidence.evidenceType) {
			// Evidence type changed after re-evaluation
			// Show notification briefly then clear
			const timer = setTimeout(() => {
				setPreviousEvidenceType(undefined);
			}, 5000);

			return () => clearTimeout(timer);
		}

		if (evidence && previousEvidenceType === undefined) {
			setPreviousEvidenceType(evidence.evidenceType);
		}
	}, [evidence, previousEvidenceType]);

	const isUserAuthor = user?.uid === statement.creatorId;
	const showReevaluationNotice = previousEvidenceType !== undefined &&
		previousEvidenceType !== evidence?.evidenceType;

	return (
		<>
			<div className={`${styles.evidencePost} ${styles[`evidencePost--${supportColor}`]}`}>
				<div className={styles.evidenceHeader}>
					<div className={styles.badges}>
						<span className={`${styles.typeBadge} ${styles[`typeBadge--${getEvidenceTypeColor(evidenceType)}`]}`}>
							{getEvidenceTypeLabel(evidenceType)}
						</span>
						<span className={`${styles.supportBadge} ${styles[`supportBadge--${supportColor}`]}`}>
							{supportLabel}
						</span>
					</div>
					{isUserAuthor && (
						<button
							className={styles.editButton}
							onClick={() => setShowEditModal(true)}
							aria-label="Edit evidence"
							title={t('Edit')}
						>
							✏️
						</button>
					)}
				</div>

				{showReevaluationNotice && (
					<div className={styles.reevaluationNotice}>
						<span className={styles.noticeIcon}>🔄</span>
						<span className={styles.noticeText}>
							{t('AI re-evaluated: Changed from')} {getEvidenceTypeLabel(previousEvidenceType)} {t('to')} {getEvidenceTypeLabel(evidenceType)}
						</span>
					</div>
				)}

			<div className={styles.evidenceContent}>
				<p>{statement.statement}</p>
			</div>

			<div className={styles.evidenceFooter}>
				<div className={styles.votingButtons}>
					<button
						className={`${styles.voteButton} ${styles.voteButtonHelpful} ${userVote === 'helpful' ? styles.voteButtonActive : ''}`}
						onClick={() => handleVote('helpful')}
						aria-label="Mark as helpful"
					>
						<span className={styles.voteIcon}>👍</span>
						<span className={styles.voteCount}>{helpfulCount}</span>
					</button>
					<button
						className={`${styles.voteButton} ${styles.voteButtonNotHelpful} ${userVote === 'not-helpful' ? styles.voteButtonActive : ''}`}
						onClick={() => handleVote('not-helpful')}
						aria-label="Mark as not helpful"
					>
						<span className={styles.voteIcon}>👎</span>
						<span className={styles.voteCount}>{notHelpfulCount}</span>
					</button>
				</div>

				<div className={styles.netScore}>
					<span className={styles.netScoreLabel}>{t('Net Score:')}</span>
					<span className={`${styles.netScoreValue} ${netScore > 0 ? styles.netScorePositive : netScore < 0 ? styles.netScoreNegative : ''}`}>
						{netScore > 0 ? '+' : ''}{netScore}
					</span>
				</div>
			</div>
		</div>

		{showEditModal && (
			<AddEvidenceModal
				parentStatementId={statement.parentId || ''}
				onClose={() => setShowEditModal(false)}
				editingStatement={statement}
			/>
		)}
		</>
	);
};

export default EvidencePost;
