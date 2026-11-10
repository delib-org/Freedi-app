/**
 * Social Proof Trigger - Phase 2
 *
 * Detects evaluation milestones on user's options and triggers
 * SOCIAL_PROOF notifications.
 *
 * Milestones: 5, 25 and 100 people have rated a user's answer.
 * Also tells the author when an answer's agreement score has moved (see
 * checkConsensusShift for the conditions).
 */

import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions';
import { parse } from 'valibot';
import {
	AnswerNoticeStateSchema,
	Collections,
	NotificationChannel,
	NotificationFrequency,
	NotificationQueueStatus,
	NotificationTriggerType,
	SourceApp,
	StatementType,
} from '@freedi/shared-types';
import type { AnswerNoticeState, NotificationQueueItem, Statement } from '@freedi/shared-types';
import { logError } from '../../utils/errorHandling';
import { readNoticeAudiences } from './noticeAudience';
import {
	ANSWER_NOTICE_LIFETIME_LIMIT,
	ANSWER_NOTICE_WINDOW_MS,
	capBucket,
	claimAnswerNotice,
} from './noticeCaps';
import { answerPreview, answerUpdateCopy, milestoneCopy, pickNoticeLanguage } from './noticeText';
import type { NoticeCopy } from './noticeText';

const getDb = () => getFirestore();

/** "Update on your answer" sends only when all of these hold since the last one. */
export const MIN_RATERS = 15;
export const MIN_NEW_RATERS = 5;
export const MIN_SCORE_CHANGE_POINTS = 20;

/** `consensus` runs −1..+1; participants see −100..+100. */
const SCORE_POINTS = 100;
const ROUNDING = 10;

/** After a check that could not send, wait this long before spending reads on another. */
const RECHECK_AFTER_REFUSAL_MS = 60 * 60 * 1000;

/** Rater counts that earn a "People are reading your answer" notice. */
export const MILESTONES = [5, 25, 100];

/**
 * Ratings landing together can both read a count past the milestone, so the
 * next few counts still qualify. The deterministic id keeps it to one notice.
 */
const MILESTONE_CATCH_UP = 3;

function reachedMilestone(raters: number): number | undefined {
	return MILESTONES.find((m) => raters >= m && raters < m + MILESTONE_CATCH_UP);
}

/**
 * Tells the author when a milestone number of people have rated their answer.
 * In-app only, so the answer's text stays off the lock screen, and subject to
 * the same caps as the "Update on your answer" notice. Never throws.
 */
export async function checkSocialProofMilestone(statement: Statement): Promise<void> {
	try {
		const milestone = reachedMilestone(countRaters(statement));
		if (milestone === undefined) return;

		const authorId = answerAuthor(statement);
		if (!authorId) return;

		const db = getDb();
		const { statementId, parentId } = statement;
		const audience = (await readNoticeAudiences(db, [authorId])).get(authorId);
		if (!audience?.inAppOn || !audience.answerUpdatesOn) return;

		const now = Date.now();
		const language = pickNoticeLanguage(audience.storedLanguage, statement.statement);
		const notice = buildAnswerNotice({
			queueItemId: `social_${statementId}_${milestone}`,
			userId: authorId,
			copy: milestoneCopy(language, milestone, answerPreview(statement.statement)),
			targetPath: `/statement/${parentId}?focusId=${statementId}`,
			triggerType: NotificationTriggerType.SOCIAL_PROOF,
			statement,
			now,
		});

		const result = await claimAnswerNotice({
			db,
			notice,
			now,
			answerId: statementId,
			questionId: parentId,
			userId: authorId,
		});

		if (result === 'queued') logger.info('Milestone notice queued', { statementId, milestone });
	} catch (error) {
		logError(error, {
			operation: 'engagement.checkSocialProofMilestone',
			statementId: statement.statementId,
			metadata: { parentId: statement.parentId },
		});
	}
}

/**
 * Who a notice about this answer goes to. AI-written combined answers have no
 * author to tell, and a hidden answer is not being read.
 */
export function answerAuthor(statement: Statement): string | undefined {
	if (statement.statementType !== StatementType.option) return undefined;
	if (statement.isCluster || statement.hide) return undefined;

	return statement.creator?.uid;
}

/** Raters other than the author's own automatic +1, which classroom answers start with. */
export function countRaters(statement: Statement): number {
	const raters = statement.evaluation?.numberOfEvaluators ?? 0;

	return statement.classTable ? Math.max(0, raters - 1) : raters;
}

/** Score change on the participants' −100..+100 scale, free of floating-point noise. */
function scoreChangePoints(current: number, baseline: number): number {
	return Math.round(Math.abs(current - baseline) * SCORE_POINTS * ROUNDING) / ROUNDING;
}

function isUpdateDue(state: AnswerNoticeState, raters: number, consensus: number): boolean {
	if (state.baselineRaters === undefined || state.baselineConsensus === undefined) return false;
	if (raters - state.baselineRaters < MIN_NEW_RATERS) return false;

	return scoreChangePoints(consensus, state.baselineConsensus) >= MIN_SCORE_CHANGE_POINTS;
}

/** Stops on the per-answer counters so a capped answer costs one read per rating. */
function isResting(state: AnswerNoticeState, now: number): boolean {
	if ((state.quietUntil ?? 0) > now) return true;
	if ((state.noticesSent ?? 0) >= ANSWER_NOTICE_LIFETIME_LIMIT) return true;

	return state.lastNoticeAt !== undefined && now - state.lastNoticeAt < ANSWER_NOTICE_WINDOW_MS;
}

export interface AnswerNoticeInput {
	queueItemId: string;
	userId: string;
	copy: NoticeCopy;
	targetPath: string;
	triggerType: NotificationTriggerType;
	statement: Statement;
	now: number;
}

/** In-app only: answer text never reaches a lock screen. */
export function buildAnswerNotice(input: AnswerNoticeInput): NotificationQueueItem {
	const { queueItemId, userId, copy, targetPath, triggerType, statement, now } = input;

	return {
		queueItemId,
		userId,
		title: copy.title,
		body: copy.body,
		channels: [NotificationChannel.IN_APP],
		sourceApp: SourceApp.MAIN,
		targetPath,
		deliverAt: null,
		frequency: NotificationFrequency.INSTANT,
		triggerType,
		statementId: statement.statementId,
		parentId: statement.parentId,
		topParentId: statement.topParentId,
		status: NotificationQueueStatus.PENDING,
		createdAt: now,
	};
}

/**
 * "Update on your answer": tells the author the score changed, never how.
 *
 * Runs after every rating, so it does no work below the rater minimum and at
 * most one read of the small state doc above it. The later reads happen only
 * when the rater and score conditions already hold.
 */
export async function checkConsensusShift(statement: Statement): Promise<void> {
	try {
		const raters = countRaters(statement);
		if (raters < MIN_RATERS) return;

		const authorId = answerAuthor(statement);
		if (!authorId) return;

		const db = getDb();
		const now = Date.now();
		const consensus = statement.consensus ?? 0;
		const { statementId, parentId } = statement;
		const stateRef = db.collection(Collections.answerNoticeState).doc(statementId);
		const stateSnap = await stateRef.get();
		const state = stateSnap.exists ? parse(AnswerNoticeStateSchema, stateSnap.data()) : undefined;

		if (state?.baselineRaters === undefined || state.baselineConsensus === undefined) {
			// The first time the answer has enough raters only sets the starting point.
			await stateRef.set(
				{ statementId, baselineRaters: raters, baselineConsensus: consensus, lastUpdate: now },
				{ merge: true },
			);

			return;
		}

		if (isResting(state, now) || !isUpdateDue(state, raters, consensus)) return;

		const rest = (): Promise<unknown> =>
			stateRef.set(
				{ statementId, quietUntil: now + RECHECK_AFTER_REFUSAL_MS, lastUpdate: now },
				{ merge: true },
			);

		const parentSnap = await db.collection(Collections.statements).doc(parentId).get();
		const parent = parentSnap.data() as Statement | undefined;
		if (parent?.statementSettings?.showEvaluation !== true) {
			await rest();

			return;
		}

		const audience = (await readNoticeAudiences(db, [authorId])).get(authorId);
		if (!audience?.inAppOn || !audience.answerUpdatesOn) {
			await rest();

			return;
		}

		const language = pickNoticeLanguage(audience.storedLanguage, statement.statement);
		const notice = buildAnswerNotice({
			queueItemId: `consensus_${statementId}_${capBucket(now, ANSWER_NOTICE_WINDOW_MS)}`,
			userId: authorId,
			copy: answerUpdateCopy(language, answerPreview(statement.statement)),
			targetPath: `/statement/${parentId}?focusId=${statementId}`,
			triggerType: NotificationTriggerType.CONSENSUS_SHIFT,
			statement,
			now,
		});

		const result = await claimAnswerNotice({
			db,
			notice,
			now,
			answerId: statementId,
			questionId: parentId,
			userId: authorId,
			decide: (fresh) =>
				fresh && isUpdateDue(fresh, raters, consensus)
					? { baselineRaters: raters, baselineConsensus: consensus }
					: null,
		});

		if (result === 'capped') await rest();
		if (result === 'queued') logger.info('Answer update notice queued', { statementId });
	} catch (error) {
		logError(error, {
			operation: 'engagement.checkConsensusShift',
			statementId: statement.statementId,
			metadata: { parentId: statement.parentId },
		});
	}
}
