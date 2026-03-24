import { FC, useContext, useState, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import { useCompoundSubQuestions } from '@/controllers/hooks/compoundQuestion/useCompoundSubQuestions';
import { useSubQuestionDiscussion } from '@/controllers/hooks/compoundQuestion/useSubQuestionDiscussion';
import { lockStatement } from '@/controllers/db/compoundQuestion/lockStatement';
import { createSubQuestionDiscussion } from '@/controllers/db/compoundQuestion/createSubQuestionDiscussion';
import { useSelector } from 'react-redux';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import SubGroupCard from '@/view/components/subGroupCard/SubGroupCard';
import LockedBanner from '../components/LockedBanner';
import styles from '../CompoundQuestion.module.scss';
import { useDispatch } from 'react-redux';
import {
	setParentStatement,
	setNewStatementType,
	setShowNewStatementModal,
} from '@/redux/statements/newStatementSlice';
import { StatementType } from '@freedi/shared-types';

const SubQuestionsPhase: FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { statement } = useContext(StatementContext);
	const { isAdmin } = useCompoundPhase(statement);
	const { subQuestions, lockedSubQuestions, unlockedSubQuestions } =
		useCompoundSubQuestions(statement);
	const { hasDiscussion, discussionId, promotedCount } = useSubQuestionDiscussion(statement);
	const creator = useSelector(creatorSelector);
	const dispatch = useDispatch();

	const [isCreatingDiscussion, setIsCreatingDiscussion] = useState(false);
	const [copied, setCopied] = useState(false);

	const handleLockSubQuestion = async (subQuestion: Statement) => {
		if (!creator?.uid || !statement) return;
		await lockStatement({
			statement: subQuestion,
			userId: creator.uid,
			parentStatementId: statement.statementId,
		});
	};

	const handleAddSubQuestion = () => {
		if (!statement) return;
		dispatch(setParentStatement(statement));
		dispatch(setNewStatementType(StatementType.question));
		dispatch(setShowNewStatementModal(true));
	};

	const handleCreateDiscussion = useCallback(async () => {
		if (!statement) return;
		setIsCreatingDiscussion(true);
		await createSubQuestionDiscussion({
			parentStatement: statement,
			title: t('What topics should we research before making a decision?'),
		});
		setIsCreatingDiscussion(false);
	}, [statement, t]);

	const handleGoToDiscussion = useCallback(() => {
		if (discussionId) {
			navigate(`/statement/${discussionId}`);
		}
	}, [discussionId, navigate]);

	const handleCopyLink = useCallback(async () => {
		if (!discussionId) return;
		const link = `${window.location.origin}/statement/${discussionId}`;
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API not available
		}
	}, [discussionId]);

	const handleShare = useCallback(async () => {
		if (!discussionId) return;
		const link = `${window.location.origin}/statement/${discussionId}`;

		if (navigator.share) {
			try {
				await navigator.share({
					title: t('Join the discussion'),
					text: t('What topics should we research before making a decision?'),
					url: link,
				});
			} catch {
				await handleCopyLink();
			}
		} else {
			await handleCopyLink();
		}
	}, [discussionId, t, handleCopyLink]);

	return (
		<div className={styles.phase}>
			<h3 className={styles.phaseTitle}>{t('Sub-Questions')}</h3>

			{lockedSubQuestions.length > 0 && (
				<div className={styles.subQuestionList}>
					<h4 className={styles.subQuestionListTitle}>{t('Locked sub-questions')}</h4>
					{lockedSubQuestions.map((sq) => (
						<div key={sq.statementId} className={styles.subQuestionItem}>
							<LockedBanner lockedText={sq.statement} />
						</div>
					))}
				</div>
			)}

			{unlockedSubQuestions.length > 0 && (
				<div className={styles.subQuestionList}>
					{unlockedSubQuestions.map((sq) => (
						<div key={sq.statementId} className={styles.subQuestionItem}>
							<SubGroupCard statement={sq} />
							{isAdmin && (
								<button
									className="phase-admin-controls__btn phase-admin-controls__btn--lock"
									onClick={() => handleLockSubQuestion(sq)}
								>
									{t('Lock')}
								</button>
							)}
						</div>
					))}
				</div>
			)}

			{subQuestions.length === 0 && (
				<p className={styles.emptyMessage}>{t('No sub-questions yet')}</p>
			)}

			<button className={styles.addButtonDashed} onClick={handleAddSubQuestion}>
				+ {t('Add Sub-Question')}
			</button>

			{/* Research Discussion */}
			<div className={styles.discussionSection}>
				<h4 className={styles.discussionTitle}>{t('Research Discussion')}</h4>

				{hasDiscussion ? (
					<>
						{promotedCount > 0 && (
							<p className={styles.promotedNote}>
								{promotedCount} {t('topics promoted to sub-questions')}
							</p>
						)}
						<div className={styles.discussionActions}>
							<button className={styles.discussionLink} onClick={handleGoToDiscussion}>
								{t('Go to research discussion')}
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
						onClick={handleCreateDiscussion}
						disabled={isCreatingDiscussion}
					>
						{isCreatingDiscussion ? t('Creating...') : t('Create research discussion')}
					</button>
				) : (
					<p className={styles.emptyMessage}>
						{t(
							'The facilitator will open a research discussion soon where you can suggest topics.',
						)}
					</p>
				)}
			</div>
		</div>
	);
};

export default SubQuestionsPhase;
