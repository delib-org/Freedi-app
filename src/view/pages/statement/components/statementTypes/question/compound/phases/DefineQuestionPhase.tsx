import { FC, useContext, useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useSelector } from 'react-redux';
import { StatementType } from '@freedi/shared-types';
import { statementSubsSelector } from '@/redux/statements/statementsSlice';
import { StatementContext } from '@/view/pages/statement/StatementCont';
import { useCompoundPhase } from '@/controllers/hooks/compoundQuestion/useCompoundPhase';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { saveQuestionScope } from '@/controllers/db/compoundQuestion/saveQuestionScope';
import { createTitleDiscussion } from '@/controllers/db/compoundQuestion/createTitleDiscussion';
import {
	lockCompoundTitle,
	unlockCompoundTitle,
} from '@/controllers/db/compoundQuestion/lockStatement';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { Lock, LockOpen } from 'lucide-react';
import styles from '../CompoundQuestion.module.scss';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DefineQuestionPhase: FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { statement } = useContext(StatementContext);
	const { isAdmin } = useCompoundPhase(statement);
	const creator = useSelector(creatorSelector);

	const compoundSettings = statement?.questionSettings?.compoundSettings;
	const lockedTitle = compoundSettings?.lockedTitle;
	const questionScope = compoundSettings?.questionScope ?? '';
	const titleDiscussionId = compoundSettings?.titleDiscussionId;

	// Get top consensus option from title discussion
	const titleDiscussionOptions = useSelector(statementSubsSelector(titleDiscussionId ?? ''));
	const topTitleOption = useMemo(() => {
		const options = titleDiscussionOptions.filter((s) => s.statementType === StatementType.option);
		if (options.length === 0) return null;

		return options.reduce((best, current) =>
			(current.consensus ?? 0) > (best.consensus ?? 0) ? current : best,
		);
	}, [titleDiscussionOptions]);

	const [scopeText, setScopeText] = useState(questionScope);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
	const [isCreatingDiscussion, setIsCreatingDiscussion] = useState(false);
	const [copied, setCopied] = useState(false);

	const handleSaveScope = useCallback(async () => {
		if (!statement || scopeText === questionScope) return;
		setSaveStatus('saving');
		try {
			await saveQuestionScope({ statement, scope: scopeText });
			setSaveStatus('saved');
			setTimeout(() => setSaveStatus('idle'), 2000);
		} catch {
			setSaveStatus('error');
		}
	}, [statement, scopeText, questionScope]);

	const handleCreateDiscussion = useCallback(async () => {
		if (!statement) return;
		setIsCreatingDiscussion(true);
		await createTitleDiscussion({
			parentStatement: statement,
			title: t('What should be the question title?'),
		});
		setIsCreatingDiscussion(false);
	}, [statement, t]);

	const handleGoToDiscussion = useCallback(() => {
		if (titleDiscussionId) {
			navigate(`/statement/${titleDiscussionId}`);
		}
	}, [titleDiscussionId, navigate]);

	const handleCopyLink = useCallback(async () => {
		if (!titleDiscussionId) return;
		const link = `${window.location.origin}/statement/${titleDiscussionId}`;
		try {
			await navigator.clipboard.writeText(link);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard API not available
		}
	}, [titleDiscussionId]);

	const handleShare = useCallback(async () => {
		if (!titleDiscussionId) return;
		const link = `${window.location.origin}/statement/${titleDiscussionId}`;

		if (navigator.share) {
			try {
				await navigator.share({
					title: t('Join the discussion'),
					text: t('Help define the question for this deliberation'),
					url: link,
				});
			} catch {
				await handleCopyLink();
			}
		} else {
			await handleCopyLink();
		}
	}, [titleDiscussionId, t, handleCopyLink]);

	const handleLockTitle = useCallback(async () => {
		if (!statement || !creator?.uid) return;
		const titleText = topTitleOption?.statement;
		const confirmed = window.confirm(
			titleText
				? `${t('Lock title as')}: "${titleText}"?`
				: t('Are you sure you want to lock the current title?'),
		);
		if (!confirmed) return;
		await lockCompoundTitle({ statement, userId: creator.uid, titleText });
	}, [statement, creator?.uid, topTitleOption, t]);

	const handleUnlockTitle = useCallback(async () => {
		if (!statement) return;
		const confirmed = window.confirm(t('Are you sure you want to unlock the title?'));
		if (!confirmed) return;
		await unlockCompoundTitle(statement);
	}, [statement, t]);

	return (
		<div className={styles.phase}>
			{isAdmin && (
				<button
					className={`${styles.lockButton} ${lockedTitle ? styles.lockButtonLocked : ''}`}
					onClick={lockedTitle ? handleUnlockTitle : handleLockTitle}
				>
					<span className={styles.lockButtonIcon}>
						{lockedTitle ? <Lock size={18} /> : <LockOpen size={18} />}
					</span>
					{lockedTitle ? `${t('Title locked')}: ${lockedTitle.lockedText}` : t('Lock Title')}
				</button>
			)}

			{!lockedTitle && (
				<>
					{/* Admin scope textarea */}
					<div className={styles.scopeSection}>
						<label className={styles.scopeLabel} htmlFor="question-scope">
							{t('Question scope')}
						</label>
						{isAdmin ? (
							<>
								<textarea
									id="question-scope"
									className={styles.scopeTextarea}
									value={scopeText}
									onChange={(e) => setScopeText(e.target.value)}
									onBlur={handleSaveScope}
									placeholder={t('Describe the context and scope of the question...')}
									rows={4}
								/>
								{saveStatus !== 'idle' && (
									<span
										className={`${styles.saveIndicator} ${
											saveStatus === 'saved' ? styles.saveIndicatorSuccess : ''
										} ${saveStatus === 'error' ? styles.saveIndicatorError : ''}`}
										role="status"
										aria-live="polite"
									>
										{saveStatus === 'saving' && t('Saving...')}
										{saveStatus === 'saved' && t('Saved')}
										{saveStatus === 'error' && t('Failed to save. Try again.')}
									</span>
								)}
							</>
						) : questionScope ? (
							<p className={styles.scopeText}>{questionScope}</p>
						) : (
							<p className={styles.emptyMessage}>
								{t('The facilitator has not yet defined the scope for this question.')}
							</p>
						)}
					</div>

					{/* Title discussion link */}
					<div className={styles.discussionSection}>
						<h4 className={styles.discussionTitle}>{t('Title discussion')}</h4>

						{titleDiscussionId ? (
							<>
								{topTitleOption && (
									<div className={styles.topSuggestion}>
										<span className={styles.topSuggestionLabel}>{t('Leading suggestion')}</span>
										<p className={styles.topSuggestionText}>{topTitleOption.statement}</p>
										<span className={styles.topSuggestionConsensus}>
											{t('Consensus')}: {Math.round((topTitleOption.consensus ?? 0) * 100)}%
										</span>
									</div>
								)}
								<div className={styles.discussionActions}>
									<button className={styles.discussionLink} onClick={handleGoToDiscussion}>
										{t('Go to title discussion')}
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
								{isCreatingDiscussion ? t('Creating...') : t('Create title discussion')}
							</button>
						) : (
							<p className={styles.emptyMessage}>
								{t(
									'The facilitator will open a discussion soon where you can suggest question titles.',
								)}
							</p>
						)}
					</div>
				</>
			)}
		</div>
	);
};

export default DefineQuestionPhase;
