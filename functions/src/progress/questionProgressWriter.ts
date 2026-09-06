/**
 * Server-side maintenance of the per-question participation funnel
 * (`questionProgress/{statementId}`) and its per-user markers
 * (`questionParticipation/{statementId}--{userId}`).
 *
 * The UNIQUE counters (`entered` / `suggested` / `evaluated`) flip at most once
 * per user; the raw event counters (`options` / `evaluations`) count every
 * event. The transaction that guarantees "at most once" is scoped to the user's
 * own marker document — see `recordParticipation` for why the shared progress
 * documents must stay out of it.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';
import {
	Collections,
	QuestionParticipation,
	Statement,
	getQuestionParticipationId,
} from '@freedi/shared-types';
import { db } from '../db';
import { logError } from '../utils/errorHandling';

export type ParticipationKind = 'entered' | 'suggested' | 'evaluated';
export type ProgressEventCounter = 'options' | 'evaluations';

export interface RecordParticipationInput {
	/** The question whose funnel is being updated. */
	statementId: string;
	/** Top statement of the question; resolved from Firestore when omitted. */
	topParentId?: string;
	/** Consultant tenant; resolved from the top statement when omitted. */
	organizationId?: string;
	userId: string;
	kind: ParticipationKind;
	eventCounter?: ProgressEventCounter;
	now?: number;
}

export interface ProgressContext {
	topParentId: string;
	organizationId?: string;
}

const TOP_PARENT_SENTINEL = 'top';
const TOP_CACHE_LIMIT = 500;

/** Per-instance cache of `statements/{topParentId}.organizationId`. */
const topOrganizationCache = new Map<string, string | undefined>();

function isRealTopParent(
	statementId: string,
	topParentId: string | undefined,
): topParentId is string {
	return !!topParentId && topParentId !== TOP_PARENT_SENTINEL && topParentId !== statementId;
}

async function readTopOrganizationId(topParentId: string): Promise<string | undefined> {
	if (topOrganizationCache.has(topParentId)) {
		return topOrganizationCache.get(topParentId);
	}
	const snap = await db.collection(Collections.statements).doc(topParentId).get();
	const organizationId = snap.exists
		? (snap.data() as Partial<Statement> | undefined)?.organizationId
		: undefined;
	if (topOrganizationCache.size >= TOP_CACHE_LIMIT) topOrganizationCache.clear();
	topOrganizationCache.set(topParentId, organizationId);

	return organizationId;
}

/**
 * Derives the progress context (top parent + organization) for a statement.
 * Reads the top statement at most once per instance thanks to the cache.
 */
export async function ensureProgressDoc(statement: Statement): Promise<ProgressContext> {
	const topParentId =
		statement.topParentId && statement.topParentId !== TOP_PARENT_SENTINEL
			? statement.topParentId
			: statement.statementId;

	if (statement.organizationId) {
		return { topParentId, organizationId: statement.organizationId };
	}
	if (topParentId === statement.statementId) {
		return { topParentId };
	}

	return { topParentId, organizationId: await readTopOrganizationId(topParentId) };
}

async function resolveContext(input: RecordParticipationInput): Promise<ProgressContext> {
	let { topParentId, organizationId } = input;

	if (!topParentId) {
		const snap = await db.collection(Collections.statements).doc(input.statementId).get();
		const data = snap.exists ? (snap.data() as Partial<Statement> | undefined) : undefined;
		topParentId = data?.topParentId ?? input.statementId;
		organizationId = organizationId ?? data?.organizationId;
	}
	if (topParentId === TOP_PARENT_SENTINEL) topParentId = input.statementId;

	if (!organizationId && isRealTopParent(input.statementId, topParentId)) {
		organizationId = await readTopOrganizationId(topParentId);
	}

	return { topParentId, organizationId };
}

function baseProgressFields(statementId: string, ctx: ProgressContext, now: number) {
	return {
		statementId,
		topParentId: ctx.topParentId,
		...(ctx.organizationId ? { organizationId: ctx.organizationId } : {}),
		lastActivity: now,
		lastUpdate: now,
	};
}

/**
 * Records one participation event. Flips the user's marker for `kind` the
 * first time only (incrementing the unique counter), always increments
 * `eventCounter` when given, and bumps `lastActivity` on both the question
 * and its top parent.
 *
 * `FieldValue.increment(0)` on the untouched counters guarantees a freshly
 * created progress doc is schema-complete (all counters present as 0).
 *
 * ## Why the transaction covers only the marker
 *
 * This used to be one transaction spanning three documents: the user's marker,
 * the question's progress doc, and the top parent's. The last two are shared —
 * EVERY participant's every event writes them — so every rating and every
 * suggestion in a question queued behind the same two documents, and a whole
 * group of questions queued behind one top parent. A class submitting together
 * produced `10 ABORTED: Transaction lock timeout`, and the catch below turned
 * that into a silently dropped count.
 *
 * Only one thing here actually needs read-then-write atomicity: deciding
 * whether this is the user's FIRST event of this kind. That question is about
 * one document, private to one user, which nobody else contends for — so the
 * transaction is scoped to it and the "at most once per user" guarantee is
 * unchanged, including for two events from the same user racing each other.
 *
 * The shared counters then move to a plain batched `increment`, which is atomic
 * server-side and takes no transaction lock.
 *
 * The trade: a crash in the window between the two commits leaves the marker
 * flipped and the unique counter one short, where before both would have rolled
 * back together. That is a strictly rarer loss than the one being fixed — the
 * lock timeout dropped the same count on every contended write — and it errs
 * toward under-counting, which cannot push a unique counter above the event
 * counter that bounds it.
 */
export async function recordParticipation(input: RecordParticipationInput): Promise<void> {
	const { statementId, userId, kind, eventCounter } = input;
	const now = input.now ?? Date.now();
	if (!statementId || !userId || statementId === TOP_PARENT_SENTINEL) return;

	try {
		const ctx = await resolveContext(input);
		const progressRef = db.collection(Collections.questionProgress).doc(statementId);
		const participationRef = db
			.collection(Collections.questionParticipation)
			.doc(getQuestionParticipationId(statementId, userId));

		// Uncontended: one document per (question, user).
		const firstTime = await db.runTransaction(async (t) => {
			const markerSnap = await t.get(participationRef);
			const marker = markerSnap.exists
				? (markerSnap.data() as Partial<QuestionParticipation>)
				: undefined;
			if (marker?.[kind]) return false;

			const markerDoc: QuestionParticipation = { statementId, userId, [kind]: true };
			t.set(participationRef, markerDoc, { merge: true });

			return true;
		});

		const counters: Record<ParticipationKind | ProgressEventCounter, FieldValue> = {
			entered: FieldValue.increment(0),
			suggested: FieldValue.increment(0),
			evaluated: FieldValue.increment(0),
			options: FieldValue.increment(0),
			evaluations: FieldValue.increment(0),
		};
		if (firstTime) counters[kind] = FieldValue.increment(1);
		if (eventCounter) counters[eventCounter] = FieldValue.increment(1);

		const batch = db.batch();
		batch.set(
			progressRef,
			{ ...baseProgressFields(statementId, ctx, now), ...counters },
			{ merge: true },
		);
		if (isRealTopParent(statementId, ctx.topParentId)) {
			batch.set(
				db.collection(Collections.questionProgress).doc(ctx.topParentId),
				baseProgressFields(ctx.topParentId, ctx, now),
				{ merge: true },
			);
		}
		await batch.commit();
	} catch (error) {
		logError(error, {
			operation: 'progress.recordParticipation',
			userId,
			statementId,
			metadata: { kind, eventCounter },
		});
	}
}

export interface TouchActivityInput {
	statementId: string;
	topParentId?: string;
	organizationId?: string;
	now?: number;
}

/**
 * Cheap "something happened here" bump: merges `lastActivity` / `lastUpdate`
 * (plus ids) onto the progress docs of a statement and its top parent.
 * Never touches counters.
 */
export async function touchActivity(input: TouchActivityInput): Promise<void> {
	const { statementId } = input;
	const now = input.now ?? Date.now();
	if (!statementId || statementId === TOP_PARENT_SENTINEL) return;

	try {
		const ctx = await resolveContext({ ...input, userId: '', kind: 'entered' });
		const batch = db.batch();
		batch.set(
			db.collection(Collections.questionProgress).doc(statementId),
			baseProgressFields(statementId, ctx, now),
			{ merge: true },
		);
		if (isRealTopParent(statementId, ctx.topParentId)) {
			batch.set(
				db.collection(Collections.questionProgress).doc(ctx.topParentId),
				baseProgressFields(ctx.topParentId, ctx, now),
				{ merge: true },
			);
		}
		await batch.commit();
	} catch (error) {
		logger.warn('progress.touchActivity failed', {
			statementId,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

/** Test-only: reset the per-instance top-statement cache. */
export function clearProgressCache(): void {
	topOrganizationCache.clear();
}
