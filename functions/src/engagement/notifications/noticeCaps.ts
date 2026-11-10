/**
 * Caps on the notices about a person's own answers, shared by the "Update on
 * your answer" and milestone notices:
 *   - per answer: 1 per 48 hours, 3 over its lifetime
 *   - per person per question: 1 per 24 hours
 *   - per person overall: 2 per 24 hours
 *
 * Each use of a cap is a document with a deterministic id (cap key, time bucket,
 * slot number). One transaction reads the slots and creates them together with
 * the notice, so a cap is never spent without a notice, two senders cannot take
 * one slot, and any failure sends nothing. These are wellbeing limits, so a
 * doubt always ends in silence (unlike `reserveWindowSlot`, which lets the call
 * through when Firestore cannot settle).
 *
 * Fixed buckets alone would allow two notices minutes apart around a bucket
 * edge, so the previous bucket is read too and its slots still count while they
 * are younger than the window.
 */

import { Timestamp } from 'firebase-admin/firestore';
import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { parse } from 'valibot';
import { AnswerNoticeStateSchema, Collections } from '@freedi/shared-types';
import type { AnswerNoticeState, NoticeCapSlot, NotificationQueueItem } from '@freedi/shared-types';
import { logError } from '../../utils/errorHandling';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const ANSWER_NOTICE_WINDOW_MS = 2 * DAY_MS;
export const ANSWER_NOTICE_LIFETIME_LIMIT = 3;
const ANSWER_NOTICE_WINDOW_LIMIT = 1;
export const PERSON_QUESTION_WINDOW_MS = DAY_MS;
const PERSON_QUESTION_LIMIT = 1;
export const PERSON_WINDOW_MS = DAY_MS;
export const PERSON_LIMIT = 2;

/** Window slots are only ever read for two windows; keep a little past that. */
const SLOT_RETENTION_WINDOWS = 3;

interface CapRule {
	key: string;
	limit: number;
	/** Absent for a lifetime cap. */
	windowMs?: number;
}

export interface CapSubject {
	answerId: string;
	questionId: string;
	userId: string;
}

export function capRulesFor({ answerId, questionId, userId }: CapSubject): CapRule[] {
	return [
		{
			key: `answer_${answerId}`,
			limit: ANSWER_NOTICE_WINDOW_LIMIT,
			windowMs: ANSWER_NOTICE_WINDOW_MS,
		},
		{ key: `answer_life_${answerId}`, limit: ANSWER_NOTICE_LIFETIME_LIMIT },
		{
			key: `person_question_${userId}_${questionId}`,
			limit: PERSON_QUESTION_LIMIT,
			windowMs: PERSON_QUESTION_WINDOW_MS,
		},
		{ key: `person_${userId}`, limit: PERSON_LIMIT, windowMs: PERSON_WINDOW_MS },
	];
}

/** The time bucket `now` falls in, for building a deterministic id. */
export function capBucket(now: number, windowMs: number): number {
	return Math.floor(now / windowMs);
}

function slotId(key: string, bucket: number | 'life', slot: number): string {
	return `${key}_${bucket}_${slot}`;
}

function slotNumbers(limit: number): number[] {
	return Array.from({ length: limit }, (_, i) => i + 1);
}

interface PlannedCap {
	rule: CapRule;
	current: DocumentReference[];
	previous: DocumentReference[];
}

function planCap(db: Firestore, rule: CapRule, now: number): PlannedCap {
	const slots = db.collection(Collections.noticeCapSlots);
	const numbers = slotNumbers(rule.limit);

	if (rule.windowMs === undefined) {
		return {
			rule,
			current: numbers.map((n) => slots.doc(slotId(rule.key, 'life', n))),
			previous: [],
		};
	}

	const bucket = capBucket(now, rule.windowMs);

	return {
		rule,
		current: numbers.map((n) => slots.doc(slotId(rule.key, bucket, n))),
		previous: numbers.map((n) => slots.doc(slotId(rule.key, bucket - 1, n))),
	};
}

type SlotReader = (ref: DocumentReference) => Promise<NoticeCapSlot | undefined>;

/** The first free slot of this cap, or undefined when the cap is reached. */
async function findFreeSlot(
	plan: PlannedCap,
	read: SlotReader,
	now: number,
): Promise<DocumentReference | undefined> {
	const { rule, current, previous } = plan;
	const [currentSlots, previousSlots] = await Promise.all([
		Promise.all(current.map(read)),
		Promise.all(previous.map(read)),
	]);

	const usedInCurrent = currentSlots.filter(Boolean).length;
	const usedInPrevious = previousSlots.filter(
		(slot) => slot && now - slot.createdAt < (rule.windowMs ?? 0),
	).length;
	if (usedInCurrent + usedInPrevious >= rule.limit) return undefined;

	return current[currentSlots.findIndex((slot) => !slot)];
}

export type NoticeClaimResult = 'queued' | 'duplicate' | 'capped' | 'refused' | 'failed';

export interface NoticeClaim extends CapSubject {
	db: Firestore;
	notice: NotificationQueueItem;
	now: number;
	/**
	 * Re-checks the notice against the state read inside the transaction.
	 * Returns state fields to save with the notice, or null to send nothing.
	 */
	decide?: (state: AnswerNoticeState | undefined) => Partial<AnswerNoticeState> | null;
}

/**
 * Takes one slot of every cap and queues the notice, all or nothing. Never
 * throws: a failure is logged and reported as 'failed', with nothing sent.
 */
export async function claimAnswerNotice(claim: NoticeClaim): Promise<NoticeClaimResult> {
	const { db, notice, now, answerId, userId, decide } = claim;

	try {
		const queueRef = db.collection(Collections.notificationQueue).doc(notice.queueItemId);
		const stateRef = db.collection(Collections.answerNoticeState).doc(answerId);
		const plans = capRulesFor(claim).map((rule) => planCap(db, rule, now));

		return await db.runTransaction<NoticeClaimResult>(async (tx) => {
			const [queueSnap, stateSnap] = await Promise.all([tx.get(queueRef), tx.get(stateRef)]);
			if (queueSnap.exists) return 'duplicate';

			const state = stateSnap.exists ? parse(AnswerNoticeStateSchema, stateSnap.data()) : undefined;
			const statePatch = decide ? decide(state) : {};
			if (!statePatch) return 'refused';

			const read: SlotReader = async (ref) => {
				const snap = await tx.get(ref);

				return snap.exists ? (snap.data() as NoticeCapSlot) : undefined;
			};
			const freeSlots = await Promise.all(plans.map((plan) => findFreeSlot(plan, read, now)));
			if (freeSlots.some((slot) => !slot)) return 'capped';

			freeSlots.forEach((slotRef, i) => {
				const { rule } = plans[i];
				const slot: NoticeCapSlot = {
					key: rule.key,
					queueItemId: notice.queueItemId,
					createdAt: now,
				};
				tx.create(slotRef as DocumentReference, {
					...slot,
					// A native TTL policy needs a Timestamp; lifetime slots never expire.
					...(rule.windowMs !== undefined && {
						expireAt: Timestamp.fromMillis(now + SLOT_RETENTION_WINDOWS * rule.windowMs),
					}),
				});
			});
			tx.set(
				stateRef,
				{
					statementId: answerId,
					lastNoticeAt: now,
					noticesSent: (state?.noticesSent ?? 0) + 1,
					quietUntil: 0,
					lastUpdate: now,
					...statePatch,
				},
				{ merge: true },
			);
			tx.create(queueRef, notice);

			return 'queued';
		});
	} catch (error) {
		logError(error, {
			operation: 'engagement.claimAnswerNotice',
			userId,
			statementId: answerId,
			metadata: { queueItemId: notice.queueItemId },
		});

		return 'failed';
	}
}
