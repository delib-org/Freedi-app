import { FC } from 'react';
import Modal from '@/view/components/atomic/molecules/Modal/Modal';
import Checkbox from '@/view/components/atomic/atoms/Checkbox/Checkbox';
import { Button } from '@/view/components/atomic/atoms/Button';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './AnswerNotifyPrompt.module.scss';

/** What the device can do about push, decided when the prompt opens. */
export type PushState = 'granted' | 'default' | 'denied' | 'ios-install' | 'unsupported';

export interface AnswerNotifyPromptProps {
	isOpen: boolean;
	replies: boolean;
	newAnswers: boolean;
	pushState: PushState;
	/** The browser was asked on Save and the answer was no: show the blocked line once. */
	refused: boolean;
	saving: boolean;
	onRepliesChange: (checked: boolean) => void;
	onNewAnswersChange: (checked: boolean) => void;
	onSave: () => void;
	onInstall: () => void;
	/** Back, close, backdrop, Esc and Not now are all this one dismiss. */
	onDismiss: () => void;
}

/**
 * Two independent choices after a person's first answer on a question:
 * replies in the chat on their answers, and new answers to the question.
 * Either, both or neither. The text under the boxes says what the browser
 * will do on Save.
 */
const AnswerNotifyPrompt: FC<AnswerNotifyPromptProps> = ({
	isOpen,
	replies,
	newAnswers,
	pushState,
	refused,
	saving,
	onRepliesChange,
	onNewAnswersChange,
	onSave,
	onInstall,
	onDismiss,
}) => {
	const { t } = useTranslation();
	const showBlocked = pushState === 'denied' || refused;
	const ticked = replies || newAnswers;

	return (
		<Modal
			isOpen={isOpen}
			onClose={saving ? () => undefined : onDismiss}
			title={t('Get notified about this question?')}
			titleId="answer-notify-prompt-title"
			size="small"
			layout="centered"
			closeButtonLabel={t('Close')}
			footer={
				refused ? (
					<Button text={t('Close')} variant="primary" onClick={onDismiss} />
				) : (
					<>
						<Button text={t('Not now')} variant="secondary" onClick={onDismiss} disabled={saving} />
						<Button text={t('Save')} variant="primary" onClick={onSave} loading={saving} />
					</>
				)
			}
		>
			<div className={styles.prompt} data-testid="answer-notify-prompt">
				<Checkbox
					label={t('Replies to my answers')}
					checked={replies}
					onChange={onRepliesChange}
					disabled={saving || refused}
					name="notify-replies"
				/>
				<Checkbox
					label={t('New answers to this question')}
					checked={newAnswers}
					onChange={onNewAnswersChange}
					disabled={saving || refused}
					name="notify-new-answers"
				/>

				{pushState === 'default' && ticked && !refused && (
					<p className={styles.prompt__note}>{t('Your browser will ask for permission next.')}</p>
				)}
				{showBlocked && (
					<p className={styles.prompt__note} role="status">
						{t('Push is blocked in your browser settings. You can still see notifications here.')}
					</p>
				)}
				{pushState === 'ios-install' && (
					<div className={styles.prompt__install}>
						<p className={styles.prompt__note}>
							{t('Install the app to your home screen to get push notifications.')}
						</p>
						<Button
							text={t('Install app')}
							variant="secondary"
							onClick={onInstall}
							disabled={saving}
						/>
					</div>
				)}
				{pushState === 'unsupported' && (
					<p className={styles.prompt__note}>
						{t("This device can't show push notifications. You can still see them in the app.")}
					</p>
				)}
			</div>
		</Modal>
	);
};

export default AnswerNotifyPrompt;
