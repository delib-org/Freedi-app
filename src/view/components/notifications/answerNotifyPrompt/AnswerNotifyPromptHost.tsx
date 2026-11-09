import { FC, useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector, useStore } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import {
	answerPromptHandled,
	selectPendingAnswerPrompt,
} from '@/redux/answerNotifyPrompt/answerNotifyPromptSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { getStatementFromDB } from '@/controllers/db/statements/getStatement';
import {
	ANSWER_NOTIFY_DEFAULTS,
	markAnswerPromptClosed,
	readAnswerNotifyState,
	saveAnswerNotifyChoices,
} from '@/controllers/db/subscriptions/answerNotifyChoices';
import { notificationService } from '@/services/notificationService';
import { isIOS, isInstalledPWA } from '@/services/platformService';
import { logError } from '@/utils/errorHandling';
import AnswerNotifyPrompt, { PushState } from './AnswerNotifyPrompt';

interface PromptTarget {
	question: Statement;
	answer: Statement;
}

/** What the device can do about push right now (decides the line under the boxes). */
export function detectPushState(): PushState {
	const permission = notificationService.safeGetPermission();
	if (permission === 'granted') return 'granted';
	if (isIOS() && !isInstalledPWA()) return 'ios-install';
	if (permission === 'unsupported' || !notificationService.isSupported()) return 'unsupported';
	if (permission === 'denied') return 'denied';

	return 'default';
}

/**
 * The one place the answer notification prompt lives, mounted once in App
 * beside the add-statement sheet. Add paths only report "answer published"
 * (redux); the prompt therefore survives the sheet closing and navigation, and
 * a person is asked once per question (the marker on their question
 * subscription), on whichever device they answer first.
 */
const AnswerNotifyPromptHost: FC = () => {
	const dispatch = useDispatch();
	const store = useStore();
	const pending = useSelector(selectPendingAnswerPrompt);
	const creator = useSelector(creatorSelector);
	const [target, setTarget] = useState<PromptTarget | null>(null);
	const [replies, setReplies] = useState<boolean>(ANSWER_NOTIFY_DEFAULTS.replies);
	const [newAnswers, setNewAnswers] = useState<boolean>(ANSWER_NOTIFY_DEFAULTS.newAnswers);
	const [pushState, setPushState] = useState<PushState>('default');
	const [refused, setRefused] = useState(false);
	const [saving, setSaving] = useState(false);

	const finish = useCallback(() => {
		setTarget(null);
		setRefused(false);
		setSaving(false);
		dispatch(answerPromptHandled());
	}, [dispatch]);

	// A publish was reported: show the prompt only if this person has not been asked.
	useEffect(() => {
		if (!pending || !creator?.uid) return;
		let cancelled = false;
		const { questionId, answerId } = pending;

		const resolve = async (): Promise<void> => {
			try {
				const read = (id: string): Statement | undefined =>
					statementSelector(id)(
						store.getState() as Parameters<ReturnType<typeof statementSelector>>[0],
					);
				const [question, answer] = await Promise.all([
					read(questionId) ?? getStatementFromDB(questionId),
					read(answerId) ?? getStatementFromDB(answerId),
				]);
				if (cancelled) return;
				if (!question || !answer) return finish();

				const state = await readAnswerNotifyState(questionId, creator.uid);
				if (cancelled) return;
				if (state.asked) return finish();

				setReplies(ANSWER_NOTIFY_DEFAULTS.replies);
				setNewAnswers(ANSWER_NOTIFY_DEFAULTS.newAnswers);
				setPushState(detectPushState());
				setRefused(false);
				setTarget({ question, answer });
			} catch (error) {
				logError(error, {
					operation: 'notifications.AnswerNotifyPromptHost.resolve',
					userId: creator.uid,
					statementId: questionId,
					metadata: { answerId },
				});
				if (!cancelled) finish();
			}
		};
		void resolve();

		return () => {
			cancelled = true;
		};
	}, [pending, creator?.uid, store, finish]);

	/** Back, close, backdrop, Esc, Not now: the marker only; choices stay absent. */
	const handleDismiss = useCallback(() => {
		if (!target || !creator) return finish();
		const { question } = target;
		finish();
		markAnswerPromptClosed(question, creator).catch((error: unknown) =>
			logError(error, {
				operation: 'notifications.AnswerNotifyPromptHost.dismiss',
				userId: creator.uid,
				statementId: question.statementId,
			}),
		);
	}, [target, creator, finish]);

	/**
	 * Save. Called straight from the click: the controller fires the browser
	 * permission dialog before its first await, so it stays a user gesture.
	 */
	const save = useCallback(
		async (skipPermission: boolean): Promise<boolean> => {
			if (!target || !creator) return false;
			setSaving(true);
			try {
				const result = await saveAnswerNotifyChoices({
					question: target.question,
					answer: target.answer,
					creator,
					replies,
					newAnswers,
					skipPermission,
				});
				setSaving(false);
				if (result.permissionRefused) {
					setRefused(true);
					setPushState('denied');
				} else {
					finish();
				}

				return true;
			} catch {
				// Already logged by the controller. No marker was written, so the next answer asks again.
				finish();

				return false;
			}
		},
		[target, creator, replies, newAnswers, finish],
	);

	const handleSave = (): void => {
		void save(false);
	};

	const handleInstall = (): void => {
		void save(true).then((saved) => {
			if (saved) window.dispatchEvent(new Event('freedi:open-install-prompt'));
		});
	};

	return (
		<AnswerNotifyPrompt
			isOpen={target !== null}
			replies={replies}
			newAnswers={newAnswers}
			pushState={pushState}
			refused={refused}
			saving={saving}
			onRepliesChange={setReplies}
			onNewAnswersChange={setNewAnswers}
			onSave={handleSave}
			onInstall={handleInstall}
			onDismiss={handleDismiss}
		/>
	);
};

export default AnswerNotifyPromptHost;
