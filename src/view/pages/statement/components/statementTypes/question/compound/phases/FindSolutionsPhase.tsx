import { FC, useContext, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import { useCompoundSolutions } from '@/controllers/hooks/compoundQuestion/useCompoundSolutions';
import { createSolutionQuestion } from '@/controllers/db/compoundQuestion/createSolutionQuestion';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from '../CompoundQuestion.module.scss';

const FindSolutionsPhase: FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { statement } = useContext(StatementContext);
	const { isAdmin } = useCompoundPhase(statement);
	const { hasSolutionQuestion, solutionQuestion, solutions } = useCompoundSolutions(statement);
	const [isCreating, setIsCreating] = useState(false);
	const [copied, setCopied] = useState(false);
	const mainTitle = statement?.statement ?? '';
	const solutionQuestionId = statement?.questionSettings?.compoundSettings?.solutionQuestionId;

	const approvedSolutions = useMemo(() => {
		const resultIds = new Set(
			(solutionQuestion?.results ?? []).map((r) => r.statementId),
		);

		return solutions.filter((s) => resultIds.has(s.statementId));
	}, [solutionQuestion?.results, solutions]);

	const handleCreateSolutionQuestion = useCallback(async () => {
		if (!statement || isCreating) return;
		setIsCreating(true);
		const title = t('Suggest solutions for') + ': ' + mainTitle;
		await createSolutionQuestion({ parentStatement: statement, title });
		setIsCreating(false);
	}, [statement, isCreating, mainTitle, t]);

	const handleGoToSolutions = useCallback(() => {
		if (solutionQuestionId) {
			navigate(`/statement/${solutionQuestionId}`);
		}
	}, [solutionQuestionId, navigate]);

	const handleCopyLink = useCallback(async () => {
		if (!solutionQuestionId) return;
		const link = `${window.location.origin}/statement/${solutionQuestionId}`;
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API not available
		}
	}, [solutionQuestionId]);

	const handleShare = useCallback(async () => {
		if (!solutionQuestionId) return;
		const link = `${window.location.origin}/statement/${solutionQuestionId}`;

		if (navigator.share) {
			try {
				await navigator.share({
					title: t('Suggest solutions'),
					text: solutionQuestion?.statement ?? mainTitle,
					url: link,
				});
			} catch {
				await handleCopyLink();
			}
		} else {
			await handleCopyLink();
		}
	}, [solutionQuestionId, solutionQuestion, mainTitle, t, handleCopyLink]);

	return (
		<div className={styles.phase}>

			{hasSolutionQuestion ? (
				<>
					{approvedSolutions.length > 0 && (
						<div className={styles.solutionsList}>
							{approvedSolutions.map((solution) => (
								<div key={solution.statementId} className={styles.solutionCard}>
									<div className={styles.solutionContent}>
										<h4 className={styles.solutionTitle}>{solution.statement}</h4>
										<span className={styles.solutionConsensus}>
											{Math.round((solution.consensus ?? 0) * 100)}% {t('Consensus')}
										</span>
									</div>
								</div>
							))}
						</div>
					)}
					<div className={styles.discussionActions}>
						<button className={styles.discussionLink} onClick={handleGoToSolutions}>
							{t('Go to solutions discussion')}
						</button>
						<button
							className={styles.copyLinkBtn}
							onClick={handleShare}
							aria-label={t('Copy discussion link to clipboard')}
						>
							{copied ? t('Copied!') : t('Copy link')}
						</button>
					</div>
				</>
			) : isAdmin ? (
				<button
					className={styles.createDiscussionBtn}
					onClick={handleCreateSolutionQuestion}
					disabled={isCreating}
				>
					{isCreating ? t('Creating...') : t('Create solutions discussion')}
				</button>
			) : (
				<p className={styles.emptyMessage}>
					{t(
						'The facilitator will open a solutions discussion soon where you can suggest solutions.',
					)}
				</p>
			)}
		</div>
	);
};

export default FindSolutionsPhase;
