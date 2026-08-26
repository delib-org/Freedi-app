import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import {
	Collections,
	ScheduledAction,
	ScheduledNudge,
	Statement,
	StudioScheduledActionKind,
	STUDIO_NUDGE_MESSAGE_MAX,
	functionConfig,
	getRandomUID,
} from '@freedi/shared-types';
import { db } from '../../db';
import type { NudgeAudience, NudgeChannel } from '../../fn_nudgeQuestionSubscribers';
import { assertStatementAdmin } from '../../progress/assertStatementAdmin';
import { getCallerIdentity } from '../orgInvites';

export interface ScheduledActionUpsertRequest {
	scheduledActionId?: string;
	statementId: string;
	action: StudioScheduledActionKind;
	runAt: number;
	nudge?: { message: string; audience?: NudgeAudience; channels?: NudgeChannel[] };
}

export interface ScheduledActionUpsertResult {
	scheduledActionId: string;
}

const ACTIONS: ReadonlySet<string> = new Set(['open', 'freeze', 'close', 'nudge']);
const AUDIENCES: ReadonlySet<string> = new Set(['all', 'notSuggested', 'notEvaluated']);
const CHANNELS: ReadonlySet<string> = new Set(['inApp', 'email']);
/** Actions must be at least this far in the future. */
const MIN_LEAD_MS = 60 * 1000;

export function normalizeNudge(raw: ScheduledActionUpsertRequest['nudge']): ScheduledNudge {
	const message = typeof raw?.message === 'string' ? raw.message.trim() : '';
	if (message.length < 1 || message.length > STUDIO_NUDGE_MESSAGE_MAX) {
		throw new HttpsError(
			'invalid-argument',
			`Reminder message must be between 1 and ${STUDIO_NUDGE_MESSAGE_MAX} characters`,
		);
	}
	const audience = raw?.audience ?? 'all';
	if (!AUDIENCES.has(audience)) {
		throw new HttpsError('invalid-argument', 'Invalid reminder audience');
	}
	const channels: NudgeChannel[] =
		raw?.channels && raw.channels.length > 0 ? raw.channels : ['inApp', 'email'];
	if (channels.some((c) => !CHANNELS.has(c))) {
		throw new HttpsError('invalid-argument', 'Invalid reminder channel');
	}

	return { message, audience, channels: [...new Set(channels)] };
}

/** The top question id and organization of a target question. */
export async function resolveActionScope(
	statement: Statement,
): Promise<{ topParentId: string; organizationId: string }> {
	const topParentId = statement.parentId === 'top' ? statement.statementId : statement.topParentId;
	let organizationId = statement.organizationId;
	if (!organizationId && topParentId !== statement.statementId) {
		const topSnap = await db.collection(Collections.statements).doc(topParentId).get();
		organizationId = (topSnap.data() as Partial<Statement> | undefined)?.organizationId;
	}
	if (!organizationId) {
		throw new HttpsError('failed-precondition', 'Scheduled actions need an organization question');
	}

	return { topParentId, organizationId };
}

/**
 * Create or edit a pending scheduled action from the dashboard. Only a
 * question admin (or org admin) may schedule; `runAt` must be in the future;
 * only `pending` actions can be edited.
 */
export const fn_studioScheduledActionUpsert = onCall(
	{ region: functionConfig.region },
	async (
		request: CallableRequest<ScheduledActionUpsertRequest>,
	): Promise<ScheduledActionUpsertResult> => {
		const caller = getCallerIdentity(request);
		const { scheduledActionId, statementId, action, runAt, nudge } = request.data ?? {};
		if (!statementId || typeof statementId !== 'string') {
			throw new HttpsError('invalid-argument', 'statementId is required');
		}
		if (!ACTIONS.has(action)) {
			throw new HttpsError('invalid-argument', 'Invalid action');
		}
		const now = Date.now();
		if (typeof runAt !== 'number' || !Number.isFinite(runAt) || runAt < now + MIN_LEAD_MS) {
			throw new HttpsError('invalid-argument', 'runAt must be in the future');
		}
		const nudgePayload = action === 'nudge' ? normalizeNudge(nudge) : undefined;

		const { statement } = await assertStatementAdmin(
			caller.uid,
			statementId,
			'studio.scheduledAction.upsert',
		);
		const scope = await resolveActionScope(statement);

		if (scheduledActionId) {
			const ref = db.collection(Collections.scheduledActions).doc(scheduledActionId);
			const snap = await ref.get();
			if (!snap.exists) throw new HttpsError('not-found', 'Scheduled action not found');
			const existing = snap.data() as ScheduledAction;
			if (existing.statementId !== statementId) {
				throw new HttpsError('failed-precondition', 'Scheduled action targets another question');
			}
			if (existing.status !== 'pending') {
				throw new HttpsError('failed-precondition', 'Only pending actions can be edited');
			}
			const patch: Partial<ScheduledAction> = { action, runAt, lastUpdate: now };
			if (nudgePayload) patch.nudge = nudgePayload;
			await ref.update(patch);

			return { scheduledActionId };
		}

		const id = getRandomUID();
		const doc: ScheduledAction = {
			scheduledActionId: id,
			statementId,
			topParentId: scope.topParentId,
			organizationId: scope.organizationId,
			action,
			runAt,
			status: 'pending',
			createdBy: caller.uid,
			source: 'manual',
			createdAt: now,
			lastUpdate: now,
		};
		if (nudgePayload) doc.nudge = nudgePayload;
		await db.collection(Collections.scheduledActions).doc(id).set(doc);

		return { scheduledActionId: id };
	},
);
