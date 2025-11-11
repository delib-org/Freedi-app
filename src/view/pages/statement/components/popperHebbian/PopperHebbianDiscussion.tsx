import { FC, useState, useEffect } from 'react';
import { Statement } from 'delib-npm';
import { PopperHebbianScore } from '@/models/popperHebbian/ScoreModels';
import { listenToEvidencePosts } from '@/controllers/db/popperHebbian/evidenceController';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import IdeaScoreboard from './components/IdeaScoreboard/IdeaScoreboard';
import EvidencePost from './components/EvidencePost/EvidencePost';
import AddEvidenceModal from './components/AddEvidenceModal/AddEvidenceModal';
import EvolutionPrompt from './components/EvolutionPrompt/EvolutionPrompt';
import styles from './PopperHebbianDiscussion.module.scss';

interface PopperHebbianDiscussionProps {
	statement: Statement;
	onCreateImprovedVersion?: () => void;
}

const PopperHebbianDiscussion: FC<PopperHebbianDiscussionProps> = ({
	statement,
	onCreateImprovedVersion
}) => {
	const { t } = useTranslation();
	const [evidencePosts, setEvidencePosts] = useState<Statement[]>([]);
	const [showAddEvidenceModal, setShowAddEvidenceModal] = useState(false);
	const [isLoading, setIsLoading] = useState(true);

	// Get score from statement, or create a default one
	const score: PopperHebbianScore = (statement as Statement & { popperHebbianScore?: PopperHebbianScore }).popperHebbianScore || {
		statementId: statement.statementId,
		totalScore: 0,
		corroborationLevel: 0.5,
		evidenceCount: 0,
		status: 'under-discussion' as const,
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

	const handleCreateImprovedVersion = (): void => {
		if (onCreateImprovedVersion) {
			onCreateImprovedVersion();
		}
	};

	return (
		<div className={styles.discussion}>
			<IdeaScoreboard score={score} />

			{score.status === 'needs-fixing' && (
				<EvolutionPrompt
					score={score}
					onCreateImprovedVersion={handleCreateImprovedVersion}
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
		</div>
	);
};

export default PopperHebbianDiscussion;
