import React, { useEffect, useId, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { Sheet } from '@/view/components/atomic/molecules/Sheet';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useCreateStatementFlow } from '@/view/pages/statement/components/addStatement/useCreateStatementFlow';
import { VALIDATION } from '@/constants/common';
import styles from './AskQuestionSheet.module.scss';

export interface AskSpace {
	id: string;
	title: string;
	statement: Statement;
}

interface AskQuestionSheetProps {
	isOpen: boolean;
	onClose: () => void;
	spaces: AskSpace[];
	/** The space the person is in; preselected when it is one of `spaces`. */
	currentSpaceId?: string;
}

const NO_SPACE = 'top';
const MIN_QUESTION_LENGTH = VALIDATION.MIN_TITLE_LENGTH;

/**
 * "לשאול שאלה" — the floating nav's + button. Writes through the one creation
 * flow (useCreateStatementFlow → createStatementWithSubscription), so a
 * question asked here is identical to one asked from the legacy sheet.
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
	const [spaceId, setSpaceId] = useState<string>(
		currentSpaceId && spaces.some((space) => space.id === currentSpaceId)
			? currentSpaceId
			: NO_SPACE,
	);
	const [text, setText] = useState('');
	const parentStatement = useMemo<Statement | 'top'>(
		() => spaces.find((space) => space.id === spaceId)?.statement ?? 'top',
		[spaces, spaceId],
	);
	const flow = useCreateStatementFlow({
		parentStatement,
		intent: 'question',
		origin: 'fab',
		onDone: (ids) => {
			onClose();
			if (ids[0]) navigate(`/statement/${ids[0]}`);
		},
	});
	const busy = flow.state.step === 'create';
	const canSubmit = text.trim().length >= MIN_QUESTION_LENGTH && !busy;

	useEffect(() => {
		const [title, ...rest] = text.trim().split('\n');
		flow.setDraft({ title: title ?? '', description: rest.join('\n').trim() });
		// setDraft is stable per flow; only the text drives the draft.
	}, [text]);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!canSubmit) return;
		if (flow.state.step === 'error') flow.retry();
		else flow.submit();
	}

	const chips = [
		...spaces.map((space) => ({ id: space.id, title: space.title })),
		{ id: NO_SPACE, title: t('No space') },
	];

	return (
		<form className={styles.ask} onSubmit={handleSubmit}>
			{spaces.length > 0 && (
				<div className={styles.ask__spaces} role="radiogroup" aria-label={t('Space')}>
					{chips.map((chip) => (
						<button
							key={chip.id}
							type="button"
							role="radio"
							aria-checked={chip.id === spaceId}
							className={`${styles.ask__chip} ${chip.id === spaceId ? styles['ask__chip--active'] : ''}`}
							onClick={() => setSpaceId(chip.id)}
							data-testid={`ask-space-${chip.id}`}
						>
							{chip.title}
						</button>
					))}
				</div>
			)}
			<label htmlFor={textId} className={styles.ask__label}>
				{t('Your question')}
			</label>
			<textarea
				id={textId}
				className={styles.ask__text}
				value={text}
				onChange={(event) => setText(event.target.value)}
				placeholder={t('What does the group need to decide?')}
				aria-describedby={hintId}
				rows={4}
				data-testid="ask-question-text"
			/>
			<p id={hintId} className={styles.ask__hint}>
				{t('The question opens in the "Collecting" stage. You can change it in the host tools.')}
			</p>
			{flow.state.step === 'error' && (
				<p className={styles.ask__error} role="alert">
					{t('Something went wrong. Please try again.')}
				</p>
			)}
			<button
				type="submit"
				className={styles.ask__submit}
				disabled={!canSubmit}
				aria-busy={busy || undefined}
				data-testid="ask-question-submit"
			>
				{t('Ask')}
			</button>
		</form>
	);
}
