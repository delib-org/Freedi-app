import { FC, useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import Checkbox from '@/view/components/atomic/atoms/Checkbox/Checkbox';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { statementSelector } from '@/redux/statements/statementsSlice';
import {
	AnswerNotifyKey,
	readAnswerNotifyState,
	setAnswerNotifyChoice,
} from '@/controllers/db/subscriptions/answerNotifyChoices';
import { logError } from '@/utils/errorHandling';
import styles from './AnswerNotifyPrompt.module.scss';

interface AnswerNotifyChoicesProps {
	/** The question whose subscription holds the choices. */
	questionId: string;
}

/**
 * "What to notify me about": the same two choices as the prompt, kept in
 * notification settings. Saved at once; a failed save reverts the box.
 * Absent choices show ticked: that is what the person gets today.
 */
const AnswerNotifyChoices: FC<AnswerNotifyChoicesProps> = ({ questionId }) => {
	const { t } = useTranslation();
	const creator = useSelector(creatorSelector);
	const question = useSelector(statementSelector(questionId));
	const [choices, setChoices] = useState<Record<AnswerNotifyKey, boolean>>({
		notifyOnReplies: true,
		notifyOnNewAnswers: true,
	});
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!creator?.uid) return;
		let cancelled = false;
		readAnswerNotifyState(questionId, creator.uid)
			.then((state) => {
				if (cancelled) return;
				setChoices({
					notifyOnReplies: state.replies ?? true,
					notifyOnNewAnswers: state.newAnswers ?? true,
				});
			})
			.catch((error: unknown) => {
				const code = (error as { code?: string })?.code;
				if (code === 'permission-denied') return;
				logError(error, {
					operation: 'notifications.AnswerNotifyChoices.load',
					userId: creator.uid,
					statementId: questionId,
				});
			});

		return () => {
			cancelled = true;
		};
	}, [questionId, creator?.uid]);

	if (!creator || !question) return null;

	const toggle = async (key: AnswerNotifyKey, value: boolean): Promise<void> => {
		const before = choices;
		setChoices({ ...choices, [key]: value });
		setBusy(true);
		try {
			await setAnswerNotifyChoice(question, creator, key, value);
		} catch {
			// Logged by the controller. Put the box back.
			setChoices(before);
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className={styles.prompt} data-testid="answer-notify-choices">
			<h4>{t('What to notify me about')}</h4>
			<Checkbox
				label={t('Replies to my answers')}
				checked={choices.notifyOnReplies}
				onChange={(checked) => void toggle('notifyOnReplies', checked)}
				disabled={busy}
				name="settings-notify-replies"
			/>
			<Checkbox
				label={t('New answers to this question')}
				checked={choices.notifyOnNewAnswers}
				onChange={(checked) => void toggle('notifyOnNewAnswers', checked)}
				disabled={busy}
				name="settings-notify-new-answers"
			/>
		</section>
	);
};

export default AnswerNotifyChoices;
