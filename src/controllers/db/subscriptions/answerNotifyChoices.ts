import { getDoc, updateDoc } from 'firebase/firestore';
import { Creator, Role, Statement, StatementSubscription } from '@freedi/shared-types';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import { createSubscriptionRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { notificationService } from '@/services/notificationService';
import { setStatementSubscriptionToDB, updateNotificationPreferences } from './setSubscriptions';

/**
 * The two things a person can hear about on a question they answered
 * (Trello 6sHeWQgD). They live on the person's QUESTION subscription, apart
 * from the three channel booleans (how to hear it). `false` vetoes the event on
 * every channel on the server; true or absent means no veto.
 */

/** What the prompt starts with: replies are one's own words, new answers can be dozens. */
export const ANSWER_NOTIFY_DEFAULTS = { replies: true, newAnswers: false } as const;

export type AnswerNotifyKey = 'notifyOnReplies' | 'notifyOnNewAnswers';

export interface AnswerNotifyState {
	/** The prompt was answered or closed on this question (the marker exists). */
	asked: boolean;
	/** Absent until the person answers the prompt or changes it in settings. */
	replies?: boolean;
	newAnswers?: boolean;
}

export interface SaveAnswerNotifyChoicesInput {
	question: Statement;
	/** The answer just published; its subscription carries the replies channel. */
	answer: Statement;
	creator: Creator;
	replies: boolean;
	newAnswers: boolean;
	/** True on a device where the browser dialog cannot appear (iOS, not installed). */
	skipPermission?: boolean;
}

export interface SaveAnswerNotifyChoicesResult {
	/** The person ticked something, the browser asked, and the answer was no. */
	permissionRefused: boolean;
}

/** Read the person's choices and marker; a missing subscription means "not asked". */
export async function readAnswerNotifyState(
	questionId: string,
	userId: string,
): Promise<AnswerNotifyState> {
	const subId = getStatementSubscriptionId(questionId, userId);
	if (!subId) return { asked: false };

	const snap = await getDoc(createSubscriptionRef(subId));
	if (!snap.exists()) return { asked: false };

	const data = snap.data() as StatementSubscription;

	return {
		asked: typeof data.notifyPromptClosedAt === 'number',
		replies: data.notifyOnReplies,
		newAnswers: data.notifyOnNewAnswers,
	};
}

/**
 * setStatementSubscriptionToDB returns early when the document exists, so it
 * only creates here; the choices themselves are always written with updateDoc.
 */
async function ensureQuestionSubscription(question: Statement, creator: Creator): Promise<string> {
	await setStatementSubscriptionToDB({ statement: question, creator, role: Role.member });
	const subId = getStatementSubscriptionId(question.statementId, creator.uid);
	if (!subId) throw new Error('Could not build the question subscription id');

	return subId;
}

async function writeToQuestionSubscription(
	question: Statement,
	creator: Creator,
	fields: Partial<Pick<StatementSubscription, AnswerNotifyKey | 'notifyPromptClosedAt'>>,
): Promise<void> {
	const subId = await ensureQuestionSubscription(question, creator);
	await updateDoc(createSubscriptionRef(subId), {
		...fields,
		statementId: question.statementId, // satisfies the subscription rules
		lastUpdate: getCurrentTimestamp(),
	});
}

/**
 * A yes switches in-app on for the matching subscription if it was off and,
 * once permission is granted, registers push and this device's token. It never
 * switches a channel off.
 */
async function enableChannelsFor(statement: Statement, creator: Creator): Promise<void> {
	const { statementId } = statement;
	const subId = getStatementSubscriptionId(statementId, creator.uid);
	if (!subId) return;

	let snap = await getDoc(createSubscriptionRef(subId));
	if (!snap.exists()) {
		// The answer's own subscription is written in the background after publish;
		// if it has not landed yet, write it here instead of losing the choice.
		await setStatementSubscriptionToDB({
			statement,
			creator,
			role: Role.member,
			getInAppNotification: true,
			...notificationService.getPushSubscriptionFields(),
		});
		snap = await getDoc(createSubscriptionRef(subId));
		if (!snap.exists()) return;
	}

	const data = snap.data() as StatementSubscription;
	const granted = notificationService.safeGetPermission() === 'granted';
	const patch: { getInAppNotification?: boolean; getPushNotification?: boolean } = {};
	if (data.getInAppNotification === false) patch.getInAppNotification = true;
	if (granted && data.getPushNotification !== true) patch.getPushNotification = true;
	if (Object.keys(patch).length > 0) {
		await updateNotificationPreferences(statementId, creator.uid, patch);
	}
	if (granted) {
		await notificationService.registerForStatementNotifications(creator.uid, null, statementId);
	}
}

/** "Not now", close, Esc, backdrop: the marker only. Choices stay absent. */
export async function markAnswerPromptClosed(question: Statement, creator: Creator): Promise<void> {
	await writeToQuestionSubscription(question, creator, {
		notifyPromptClosedAt: getCurrentTimestamp(),
	});
}

/**
 * Save the prompt. When something is ticked and the browser has not been asked
 * yet, the permission dialog is requested FIRST and synchronously, so it fires
 * from the Save click itself (browsers drop it after an awaited write). Nothing
 * is requested on "no ticks".
 */
export async function saveAnswerNotifyChoices({
	question,
	answer,
	creator,
	replies,
	newAnswers,
	skipPermission = false,
}: SaveAnswerNotifyChoicesInput): Promise<SaveAnswerNotifyChoicesResult> {
	const wantsSomething = replies || newAnswers;
	const shouldAskBrowser =
		wantsSomething &&
		!skipPermission &&
		notificationService.isSupported() &&
		notificationService.safeGetPermission() === 'default';
	const permissionAnswer = shouldAskBrowser ? notificationService.requestPermission() : null;

	try {
		await writeToQuestionSubscription(question, creator, {
			notifyOnReplies: replies,
			notifyOnNewAnswers: newAnswers,
			notifyPromptClosedAt: getCurrentTimestamp(),
		});

		const granted = permissionAnswer ? await permissionAnswer : false;
		const permissionRefused = permissionAnswer !== null && !granted;
		if (
			notificationService.safeGetPermission() === 'granted' &&
			!notificationService.isInitialized()
		) {
			await notificationService.initialize(creator.uid);
		}
		if (replies) await enableChannelsFor(answer, creator);
		if (newAnswers) await enableChannelsFor(question, creator);

		return { permissionRefused };
	} catch (error) {
		logError(error, {
			operation: 'subscriptions.answerNotifyChoices.saveAnswerNotifyChoices',
			userId: creator.uid,
			statementId: question.statementId,
			metadata: { answerId: answer.statementId, replies, newAnswers },
		});
		throw error;
	}
}

/** Settings panel: one toggle, saved at once. Also sets the marker. */
export async function setAnswerNotifyChoice(
	question: Statement,
	creator: Creator,
	key: AnswerNotifyKey,
	value: boolean,
): Promise<void> {
	try {
		await writeToQuestionSubscription(question, creator, {
			[key]: value,
			notifyPromptClosedAt: getCurrentTimestamp(),
		});
		if (value && key === 'notifyOnNewAnswers') await enableChannelsFor(question, creator);
	} catch (error) {
		logError(error, {
			operation: 'subscriptions.answerNotifyChoices.setAnswerNotifyChoice',
			userId: creator.uid,
			statementId: question.statementId,
			metadata: { key, value },
		});
		throw error;
	}
}
