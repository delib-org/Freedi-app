import React, { FC, useState, useEffect } from 'react';
import { Statement } from '@freedi/shared-types';
import { EvidenceType } from '@freedi/shared-types';
import { getCorroborationLabel, getCorroborationColor } from '../../popperHebbianHelpers';
import { submitVote, removeVote, getUserVote } from '@/controllers/db/popperHebbian/evidenceController';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import AddEvidenceModal from '../AddEvidenceModal/AddEvidenceModal';
import styles from './EvidencePost.module.scss';

interface LinkMetadata {
	url: string;
	title: string;
	summary: string;
	domain: string;
}

interface EvidenceWithLink extends Statement {
	evidence?: {
		evidenceType?: EvidenceType;
		support?: number;
		corroborationScore?: number;  // NEW: 0-1 scale
		helpfulCount?: number;
		notHelpfulCount?: number;
		netScore?: number;
		evidenceWeight?: number;
		linkMetadata?: LinkMetadata;
	};
}

interface EvidencePostProps {
	statement: Statement;
}

const EvidencePost: FC<EvidencePostProps> = ({ statement }) => {
	const { user } = useAuthentication();
	const { t } = useTranslation();
	const [userVote, setUserVote] = useState<'helpful' | 'not-helpful' | null>(null);
	const [showEditModal, setShowEditModal] = useState(false);
	const [previousEvidenceType, setPreviousEvidenceType] = useState<EvidenceType | undefined>(undefined);

	const evidence = statement.evidence;

	if (!evidence) {
		return null;
	}

	const { evidenceType, helpfulCount = 0, notHelpfulCount = 0 } = evidence;
	// Use corroborationScore (0-1) if available, fallback to migrated support
	const corroborationScore = (evidence as EvidenceWithLink['evidence'])?.corroborationScore
		?? (evidence.support !== undefined ? (evidence.support + 1) / 2 : 0.5);
	const netScore = helpfulCount - notHelpfulCount;
	const corroborationColor = getCorroborationColor(corroborationScore);
	const corroborationLabel = getCorroborationLabel(corroborationScore, t);

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

	// Parse markdown links and render properly
	const renderContent = (text: string): React.ReactElement => {
		// Match markdown links [text](url)
		const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
		const parts: (string | React.ReactElement)[] = [];
		let lastIndex = 0;
		let match;

		while ((match = markdownLinkRegex.exec(text)) !== null) {
			// Add text before the link
			if (match.index > lastIndex) {
				parts.push(text.substring(lastIndex, match.index));
			}

			// Add the link
			const linkText = match[1];
			const linkUrl = match[2];
			parts.push(
				<a
					key={match.index}
					href={linkUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={styles.evidenceLink}
				>
					{linkText}
				</a>
			);

			lastIndex = match.index + match[0].length;
		}

		// Add remaining text
		if (lastIndex < text.length) {
			parts.push(text.substring(lastIndex));
		}

		return <>{parts.length > 0 ? parts : text}</>;
	};

	return (
		<>
			<div className={`${styles.evidencePost} ${styles[`evidencePost--${corroborationColor}`]}`}>
				<div className={styles.evidenceHeader}>
					<div className={styles.badges}>
						<span className={`${styles.typeBadge} ${styles[`typeBadge--${getEvidenceTypeColor(evidenceType)}`]}`}>
							{getEvidenceTypeLabel(evidenceType)}
						</span>
						<span className={`${styles.supportBadge} ${styles[`supportBadge--${corroborationColor}`]}`}>
							{corroborationLabel}
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
				<p>{renderContent(statement.statement)}</p>

				{/* Display link summary if available */}
				{(statement as EvidenceWithLink).evidence?.linkMetadata && (
					<div className={styles.linkSummary}>
						<div className={styles.linkSummaryHeader}>
							<span className={styles.linkIcon}>🔗</span>
							<span className={styles.linkDomain}>{(statement as EvidenceWithLink).evidence!.linkMetadata!.domain}</span>
						</div>
						<p className={styles.linkSummaryText}>{(statement as EvidenceWithLink).evidence!.linkMetadata!.summary}</p>
					</div>
				)}
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
