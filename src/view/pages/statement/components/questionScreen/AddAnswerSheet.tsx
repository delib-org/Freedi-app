import { FC, FormEvent, useEffect, useId, useMemo, useState } from 'react';
import clsx from 'clsx';
import { Statement } from '@freedi/shared-types';
import Sheet from '@/view/components/atomic/molecules/Sheet/Sheet';
import { MultiSuggestionPreviewModal, SplitSuggestion } from '@/view/components/multiSuggestion';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { renderInlineMarkdown } from '@/helpers/inlineMarkdownHelpers';
import { VALIDATION } from '@/constants/common';
import { uxAnalytics } from '@/services/analytics';
import IdeaRefineryModal from '../popperHebbian/refinery/IdeaRefineryModal';
import { useCreateStatementFlow } from '../addStatement/useCreateStatementFlow';
import styles from './QuestionScreen.module.scss';

interface AddAnswerSheetProps {
	statement: Statement;
	onClose: () => void;
}

/** First line is the answer, anything after it its description. */
export function draftFromText(text: string): { title: string; description: string } {
	const trimmed = text.trim();
	const lineBreak = trimmed.indexOf('\n');
	if (lineBreak === -1) return { title: trimmed, description: '' };

	return {
		title: trimmed.slice(0, lineBreak).trim(),
		description: trimmed.slice(lineBreak + 1).trim(),
	};
}

/**
 * הוספת תשובה — the design's add-answer sheet over the existing creation flow
 * (useCreateStatementFlow): write → quiet checks the host turned on
 * (structured-debate refinery, split detection, similar answers) → publish.
 * A failed similarity check resolves to "nothing similar", so it never blocks.
 */
const AddAnswerSheet: FC<AddAnswerSheetProps> = ({ statement, onClose }) => {
	const { t } = useTranslation();
	const textId = useId();
	const [text, setText] = useState('');
	const [selected, setSelected] = useState(0);
	const flow = useCreateStatementFlow({
		parentStatement: statement,
		intent: 'answer',
		origin: 'fab',
		commit: 'db',
		onDone: onClose,
	});
	const { state } = flow;

	useEffect(() => {
		uxAnalytics.addAnswerStarted(statement.statementId, 'fab');
	}, [statement.statementId]);

	const tooShort = text.trim().length < VALIDATION.MIN_TITLE_LENGTH;
	const checking = state.pending && (state.step === 'similarity' || state.step === 'multiSplit');
	const creating = state.pending && state.step === 'create';
	const showSimilar = state.step === 'similarity' && !state.pending && state.similar.length > 0;
	const showSplit = state.step === 'multiSplit' && !state.pending && state.splits.length > 1;
	const writing = !checking && !creating && !showSimilar;

	function handleChange(value: string) {
		setText(value);
		flow.setDraft(draftFromText(value));
	}

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		if (!tooShort && state.step === 'draft') flow.submit();
	}

	function handleClose() {
		if (creating) return;
		flow.abandon();
		onClose();
	}

	const splitSuggestions: SplitSuggestion[] = useMemo(
		() =>
			state.splits.map((s, i) => ({
				id: `split-${i}`,
				title: s.title,
				description: s.description,
				originalText: s.title,
				isRemoved: false,
			})),
		[state.splits],
	);

	const similar: Statement | undefined = state.similar[selected] ?? state.similar[0];

	return (
		<>
			<Sheet isOpen onClose={handleClose} title={t('Add an answer')} id="add-answer-sheet">
				<div className={styles.sheet} data-testid="add-answer-sheet">
					{writing && (
						<form className={styles.sheet__form} onSubmit={handleSubmit}>
							<label htmlFor={textId} className={styles.visuallyHidden}>
								{t('Your answer')}
							</label>
							<textarea
								id={textId}
								className={styles.sheet__textarea}
								value={text}
								onChange={(event) => handleChange(event.target.value)}
								placeholder={t('What do you think the solution is?')}
								rows={4}
								maxLength={VALIDATION.MAX_STATEMENT_LENGTH}
								autoFocus
								data-testid="add-answer-text"
							/>
							<p className={styles.sheet__hint}>
								{t(
									'We will quietly check whether a similar answer exists. If we cannot check, your answer is published anyway.',
								)}
							</p>
							{state.step === 'error' && (
								<div className={styles.sheet__error} role="alert">
									<span>{t('Could not complete action.')}</span>
									<button type="button" className={styles.textButton} onClick={flow.retry}>
										{t('question.sheet.retry')}
									</button>
								</div>
							)}
							<button
								type="submit"
								className={styles.primaryButton}
								disabled={tooShort || state.step !== 'draft'}
								data-testid="add-answer-submit"
							>
								{t('question.addAnswerCta')}
							</button>
						</form>
					)}

					{(checking || creating) && (
						<div className={styles.sheet__checking} role="status">
							<span className={styles.spinner} aria-hidden="true" />
							{checking
								? t('Checking whether someone already suggested something similar…')
								: t('Adding your answer…')}
						</div>
					)}

					{showSimilar && similar && (
						<div className={styles.sheet__similar}>
							<p className={styles.sheet__intro}>
								{t('A similar answer was found. Support it, or keep yours?')}
							</p>
							{state.similar.map((item, index) => (
								<button
									key={item.statementId}
									type="button"
									className={clsx(
										styles.sheet__match,
										index === selected && styles['sheet__match--selected'],
									)}
									aria-pressed={index === selected}
									onClick={() => setSelected(index)}
								>
									<span>{renderInlineMarkdown(item.statement)}</span>
									<span className={styles.sheet__matchMeta}>
										{t('{n} rated').replace(
											'{n}',
											String(item.evaluation?.numberOfEvaluators ?? item.totalEvaluators ?? 0),
										)}
									</span>
								</button>
							))}
							<div className={styles.sheet__yours}>
								<span className={styles.sheet__yoursLabel}>{t('Yours')}</span>
								{text.trim()}
							</div>
							<div className={styles.sheet__actions}>
								<button
									type="button"
									className={styles.darkButton}
									onClick={() => void flow.similarity.support(similar)}
									data-testid="add-answer-support"
								>
									{t('Support the existing one')}
								</button>
								<button
									type="button"
									className={styles.outlineButton}
									onClick={flow.similarity.continueOwn}
									data-testid="add-answer-keep"
								>
									{t('Keep mine')}
								</button>
							</div>
							<button type="button" className={styles.textButton} onClick={flow.similarity.back}>
								{t('Back to edit')}
							</button>
						</div>
					)}
				</div>
			</Sheet>

			{state.step === 'structuredDebatePreCheck' && (
				<IdeaRefineryModal
					parentStatementId={statement.statementId}
					originalIdea={
						state.draft.description
							? `${state.draft.title}\n${state.draft.description}`
							: state.draft.title
					}
					onClose={flow.preCheck.close}
					onPublish={(refined) => flow.preCheck.publish(refined)}
				/>
			)}

			{showSplit && (
				<MultiSuggestionPreviewModal
					originalText={
						state.draft.title + (state.draft.description ? `: ${state.draft.description}` : '')
					}
					suggestions={splitSuggestions}
					onConfirm={(items) =>
						flow.multi.confirm(items.map((s) => ({ title: s.title, description: s.description })))
					}
					onDismiss={flow.multi.dismiss}
					onCancel={flow.multi.cancel}
					isSubmitting={false}
				/>
			)}
		</>
	);
};

export default AddAnswerSheet;
