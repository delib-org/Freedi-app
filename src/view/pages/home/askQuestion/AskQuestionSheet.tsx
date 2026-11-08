import React, { useEffect, useId, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Sheet } from '@/view/components/atomic/molecules/Sheet';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { AskSpace, NEW_SPACE, NO_SPACE, useAskInSpace } from './useAskInSpace';
import styles from './AskQuestionSheet.module.scss';

export type { AskSpace };

interface AskQuestionSheetProps {
	isOpen: boolean;
	onClose: () => void;
	spaces: AskSpace[];
	/** The space the person is in; preselected when it is one of `spaces`. */
	currentSpaceId?: string;
}

/**
 * "לשאול שאלה" — the one place a question is asked from Home and the nav's +.
 * The person picks an existing space, no space, or a new space (created first,
 * then the question inside it). See useAskInSpace for the writes.
 */
export default function AskQuestionSheet({
	isOpen,
	onClose,
	spaces,
	currentSpaceId,
}: AskQuestionSheetProps) {
	const { t } = useTranslation();

	return (
		<Sheet isOpen={isOpen} onClose={onClose} title={t('Ask a question')} id="ask-question-sheet">
			<AskQuestionForm spaces={spaces} currentSpaceId={currentSpaceId} onClose={onClose} />
		</Sheet>
	);
}

function AskQuestionForm({
	spaces,
	currentSpaceId,
	onClose,
}: Omit<AskQuestionSheetProps, 'isOpen'>) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const textId = useId();
	const hintId = useId();
	const nameId = useId();
	const nameRef = useRef<HTMLInputElement>(null);
	const ask = useAskInSpace({
		spaces,
		currentSpaceId,
		onCreated: (questionId) => {
			onClose();
			navigate(`/statement/${questionId}`);
		},
	});
	const { choice, isNewSpace, busy, error } = ask;

	useEffect(() => {
		if (isNewSpace) nameRef.current?.focus();
	}, [isNewSpace]);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		void ask.submit();
	}

	function chip(id: string, title: string) {
		return (
			<button
				key={id}
				type="button"
				role="radio"
				aria-checked={id === choice}
				disabled={busy}
				className={`${styles.ask__chip} ${id === choice ? styles['ask__chip--active'] : ''}`}
				onClick={() => ask.setChoice(id)}
				data-testid={`ask-space-${id}`}
			>
				{title}
			</button>
		);
	}

	return (
		<form className={styles.ask} onSubmit={handleSubmit}>
			<div className={styles.ask__spaces} role="radiogroup" aria-label={t('Space')}>
				{ask.options.length > 0 && (
					<div className={styles.ask__list}>
						{ask.options.map((space) => chip(space.id, space.title))}
					</div>
				)}
				<div className={styles.ask__pinned}>
					{chip(NO_SPACE, t('No space'))}
					{chip(NEW_SPACE, `+ ${t('New space')}`)}
				</div>
			</div>
			{isNewSpace && (
				<>
					<label htmlFor={nameId} className={styles.ask__label}>
						{t('Space name')}
					</label>
					<input
						id={nameId}
						ref={nameRef}
						className={styles.ask__name}
						value={ask.spaceName}
						onChange={(event) => ask.setSpaceName(event.target.value)}
						placeholder={t('question.sheet.titlePlaceholderSpace')}
						readOnly={busy}
						required
						data-testid="ask-space-name"
					/>
					<p className={styles.ask__hint}>{t('The question will open inside this new space.')}</p>
				</>
			)}
			<label htmlFor={textId} className={styles.ask__label}>
				{t('Your question')}
			</label>
			<textarea
				id={textId}
				className={styles.ask__text}
				value={ask.text}
				onChange={(event) => ask.setText(event.target.value)}
				placeholder={t('What does the group need to decide?')}
				aria-describedby={hintId}
				readOnly={busy}
				rows={4}
				data-testid="ask-question-text"
			/>
			<p id={hintId} className={styles.ask__hint}>
				{t('The question opens in the "Collecting" stage. You can change it in the host tools.')}
			</p>
			{error && (
				<p className={styles.ask__error} role="alert">
					{error === 'partial'
						? t('The space was created, but the question was not saved. Try again.')
						: t('Something went wrong. Please try again.')}
				</p>
			)}
			<button
				type="submit"
				className={styles.ask__submit}
				disabled={!ask.canSubmit}
				aria-busy={busy || undefined}
				data-testid="ask-question-submit"
			>
				{t('Ask')}
			</button>
		</form>
	);
}
