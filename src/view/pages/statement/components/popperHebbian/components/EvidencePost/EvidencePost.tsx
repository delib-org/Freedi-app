import { FC, useState, useEffect } from 'react';
import { Statement } from 'delib-npm';
import { EvidenceType } from 'delib-npm/dist/models/evidence/evidenceModel';
import { getSupportLabel, getSupportColor } from '../../popperHebbianHelpers';
import { submitVote, removeVote, getUserVote } from '@/controllers/db/popperHebbian/evidenceController';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import styles from './EvidencePost.module.scss';

interface EvidencePostProps {
	statement: Statement;
}

const EvidencePost: FC<EvidencePostProps> = ({ statement }) => {
	const { user } = useAuthentication();
	const [userVote, setUserVote] = useState<'helpful' | 'not-helpful' | null>(null);

	const evidence = statement.evidence;

	if (!evidence) {
		return null;
	}

	const { support, evidenceType, helpfulCount = 0, notHelpfulCount = 0 } = evidence;
	const netScore = helpfulCount - notHelpfulCount;
	const supportColor = getSupportColor(support);
	const supportLabel = getSupportLabel(support);

	const getEvidenceTypeLabel = (type: EvidenceType): string => {
		switch (type) {
			case EvidenceType.data:
				return 'Data';
			case EvidenceType.testimony:
				return 'Testimony';
			case EvidenceType.argument:
				return 'Argument';
			case EvidenceType.anecdote:
				return 'Anecdote';
			case EvidenceType.fallacy:
				return 'Fallacy';
			default:
				return 'Evidence';
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

	return (
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
			</div>

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
					<span className={styles.netScoreLabel}>Net Score:</span>
					<span className={`${styles.netScoreValue} ${netScore > 0 ? styles.netScorePositive : netScore < 0 ? styles.netScoreNegative : ''}`}>
						{netScore > 0 ? '+' : ''}{netScore}
					</span>
				</div>
			</div>
		</div>
	);
};

export default EvidencePost;
