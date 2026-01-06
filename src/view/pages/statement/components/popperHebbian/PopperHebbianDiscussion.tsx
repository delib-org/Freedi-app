import { FC, useState, useEffect, useMemo } from 'react';
import { Statement } from '@freedi/shared-types';
import { PopperHebbianScore, StatementVersion, HEBBIAN_CONFIG } from '@/models/popperHebbian';
import { listenToEvidencePosts } from '@/controllers/db/popperHebbian/evidenceController';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import IdeaScoreboard from './components/IdeaScoreboard/IdeaScoreboard';
import EvidencePost from './components/EvidencePost/EvidencePost';
import AddEvidenceModal from './components/AddEvidenceModal/AddEvidenceModal';
import EvolutionPrompt from './components/EvolutionPrompt/EvolutionPrompt';
import ImproveProposalModal from './components/ImproveProposalModal/ImproveProposalModal';
import styles from './PopperHebbianDiscussion.module.scss';

interface ExtendedStatement extends Statement {
	popperHebbianScore?: PopperHebbianScore;
	versions?: StatementVersion[];
	currentVersion?: number;
}

interface PopperHebbianDiscussionProps {
	statement: Statement;
	onCreateImprovedVersion?: () => void;
}

const PopperHebbianDiscussion: FC<PopperHebbianDiscussionProps> = ({
	statement,
	onCreateImprovedVersion
}) => {
	const { t } = useTranslation();
	const { user } = useAuthentication();
	const [evidencePosts, setEvidencePosts] = useState<Statement[]>([]);
	const [showAddEvidenceModal, setShowAddEvidenceModal] = useState(false);
	const [showImproveModal, setShowImproveModal] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	// Get authorization state which includes isAdmin check
	const { isAdmin } = useAuthorization(statement.statementId);

	// Check if user can improve this proposal (creator or admin)
	const canImprove = useMemo(() => {
		if (!user) return false;
		const isCreator = statement.creatorId === user.uid;

		return isCreator || isAdmin;
	}, [statement.creatorId, user, isAdmin]);

	// Cast statement to extended type for version access
	const extendedStatement = statement as ExtendedStatement;

	// Get score from statement, or create a default one with PRIOR (0.6)
	const score: PopperHebbianScore = extendedStatement.popperHebbianScore
		? {
			...extendedStatement.popperHebbianScore,
			// Ensure hebbianScore exists (fallback to corroborationLevel for old data)
			hebbianScore: extendedStatement.popperHebbianScore.hebbianScore
				?? extendedStatement.popperHebbianScore.corroborationLevel
				?? HEBBIAN_CONFIG.PRIOR
		}
		: {
			statementId: statement.statementId,
			hebbianScore: HEBBIAN_CONFIG.PRIOR,  // Start at 0.6
			evidenceCount: 0,
			status: 'looking-good' as const,  // At 0.6, status is looking-good
			lastCalculated: Date.now()
		};

	useEffect(() => {
		if (!statement.statementId) return;

		setIsLoading(true);

		const unsubscribe = listenToEvidencePosts(
			statement.statementId,
			(posts) => {
				// Sort posts by support strength (strongest support/challenge first)
				const sorted = [...posts].sort((a, b) => {
					const aSupport = Math.abs(a.evidence?.support ?? 0);
					const bSupport = Math.abs(b.evidence?.support ?? 0);

					return bSupport - aSupport;
				});

				setEvidencePosts(sorted);
				setIsLoading(false);
			}
		);

		return () => unsubscribe();
	}, [statement.statementId]);

	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	const handleCreateImprovedVersion = (): void => {
		if (onCreateImprovedVersion) {
			onCreateImprovedVersion();
		}
	};

	const handleOpenImproveModal = (): void => {
		setShowImproveModal(true);
	};

	return (
		<div className={styles.discussion}>
			<IdeaScoreboard score={score} />

			{/* Improve with AI button - visible to creator/admins when there are comments */}
			{canImprove && evidencePosts.length > 0 && (
				<div className={styles.improveSection}>
					<button
						className={styles.improveButton}
						onClick={handleOpenImproveModal}
						aria-label={t('Generate AI-improved version based on discussion')}
					>
						<span className={styles.improveIcon}>&#10024;</span>
						{t('Improve with AI')}
					</button>
					<p className={styles.improveHint}>
						{t('Get an AI-suggested improvement based on {{count}} comments').replace('{{count}}', String(evidencePosts.length))}
					</p>
				</div>
			)}

			{score.status === 'needs-fixing' && (
				<EvolutionPrompt
					score={score}
					onCreateImprovedVersion={handleOpenImproveModal}
				/>
			)}

			<div className={styles.evidenceSection}>
				<div className={styles.evidenceHeader}>
					<h3 className={styles.evidenceTitle}>
						{t('Discussion')} ({evidencePosts.length})
					</h3>
					<button
						className={styles.addEvidenceButton}
						onClick={() => setShowAddEvidenceModal(true)}
					>
						<span className={styles.addIcon}>+</span>
						{t('Add Contribution')}
					</button>
				</div>

				{isLoading ? (
					<div className={styles.loadingState}>
						<p>{t('Loading discussion...')}</p>
					</div>
				) : evidencePosts.length === 0 ? (
					<div className={styles.emptyState}>
						<div className={styles.emptyIcon}>📊</div>
						<h4 className={styles.emptyTitle}>
							{t('No contributions yet')}
						</h4>
						<p className={styles.emptyText}>
							{t('Be the first to add a claim, comment, or evidence about this idea.')}
						</p>
						<button
							className={styles.emptyStateButton}
							onClick={() => setShowAddEvidenceModal(true)}
						>
							{t('Add First Contribution')}
						</button>
					</div>
				) : (
					<div className={styles.evidenceList}>
						{evidencePosts.map((post) => (
							<EvidencePost key={post.statementId} statement={post} />
						))}
					</div>
				)}
			</div>

			{showAddEvidenceModal && (
				<AddEvidenceModal
					parentStatementId={statement.statementId}
					onClose={() => setShowAddEvidenceModal(false)}
				/>
			)}

			{showImproveModal && (
				<ImproveProposalModal
					statement={extendedStatement}
					onClose={() => setShowImproveModal(false)}
					onSuccess={() => {
						// Modal will close itself after success
					}}
				/>
			)}
		</div>
	);
};

export default PopperHebbianDiscussion;
