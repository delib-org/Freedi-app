import { HttpsError } from 'firebase-functions/v2/https';
import type { DocumentReference } from 'firebase-admin/firestore';
import {
	Collections,
	Organization,
	OrganizationMember,
	OrganizationRole,
	SourceApp,
	Statement,
	StudioActivityType,
	StudioExistingActivitySnapshot,
	StudioPlanSession,
	STUDIO_PLAN_MESSAGES_PER_HOUR,
} from '@freedi/shared-types';
import { db } from '../../db';
import { assertStatementAdmin } from '../../progress/assertStatementAdmin';
import { detectLanguage } from '../../services/topic-cluster/language';
import { isSystemAdmin } from '../../utils/httpAuth';
import { requireOrgRole } from '../orgAuth';

/** Shared helpers for the "Start a question with AI" callables. */

export const LANGUAGE_NAMES: Record<string, string> = {
	he: 'Hebrew',
	en: 'English',
	ar: 'Arabic',
	es: 'Spanish',
	de: 'German',
	nl: 'Dutch',
	fa: 'Persian',
	fr: 'French',
	ru: 'Russian',
};

export function languageName(code: string): string {
	return LANGUAGE_NAMES[code] ?? LANGUAGE_NAMES.en;
}

/** Fixture mode = no OpenAI key (emulator / CI): deterministic canned plans. */
export function isFixtureMode(): boolean {
	return !process.env.OPENAI_API_KEY;
}

/** 'YYYY-MM-DD' for `now` in the admin's timezone (falls back to UTC). */
export function todayIsoInTimezone(now: number, timezone: string): string {
	try {
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: timezone,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).formatToParts(new Date(now));
		const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';

		return `${get('year')}-${get('month')}-${get('day')}`;
	} catch {
		return new Date(now).toISOString().slice(0, 10);
	}
}

export function isValidTimezone(timezone: unknown): timezone is string {
	if (typeof timezone !== 'string' || !timezone) return false;
	try {
		new Intl.DateTimeFormat('en-US', { timeZone: timezone });

		return true;
	} catch {
		return false;
	}
}

/**
 * Detected language of a message, falling back to the session's when the
 * detector is unsure (short or mixed text).
 */
export function resolveLanguage(message: string, fallback: string): string {
	const detected = detectLanguage(message);

	return LANGUAGE_NAMES[detected] ? detected : fallback;
}

export interface PlannerAccess {
	member: OrganizationMember;
	organization: Organization;
	topQuestion?: Statement;
}

/**
 * Org owner/admin (or system admin) on `organizationId`; in existing-question
 * mode also an admin of `topQuestionId`, which must be a top question of the
 * same organization.
 */
export async function assertPlannerAccess(
	uid: string,
	organizationId: string,
	topQuestionId?: string,
): Promise<PlannerAccess> {
	const member = await requireOrgRole(uid, organizationId, [
		OrganizationRole.owner,
		OrganizationRole.admin,
	]);
	const orgSnap = await db.collection(Collections.organizations).doc(organizationId).get();
	if (!orgSnap.exists) {
		throw new HttpsError('not-found', 'Organization not found');
	}
	const organization = orgSnap.data() as Organization;
	if (!topQuestionId) return { member, organization };

	const { statement } = await assertStatementAdmin(uid, topQuestionId, 'studio.plan');
	if (statement.parentId !== 'top') {
		throw new HttpsError('failed-precondition', 'Plans extend a main question');
	}
	if (statement.organizationId !== organizationId) {
		throw new HttpsError('permission-denied', 'Question belongs to a different organization');
	}

	return { member, organization, topQuestion: statement };
}

export interface LoadedSession {
	ref: DocumentReference;
	session: StudioPlanSession;
}

/** The session, if it exists and `uid` created it (system admins may read any). */
export async function loadSessionForCaller(sessionId: string, uid: string): Promise<LoadedSession> {
	if (!sessionId || typeof sessionId !== 'string') {
		throw new HttpsError('invalid-argument', 'sessionId is required');
	}
	const ref = db.collection(Collections.studioPlanSessions).doc(sessionId);
	const snap = await ref.get();
	if (!snap.exists) {
		throw new HttpsError('not-found', 'Plan session not found');
	}
	const session = snap.data() as StudioPlanSession;
	if (session.createdBy !== uid && !(await isSystemAdmin(uid))) {
		throw new HttpsError('permission-denied', 'This plan belongs to another user');
	}

	return { ref, session };
}

const RATE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Per-user hourly budget for AI turns (transaction on `studioRateLimits/{uid}`,
 * same shape as `reserveErrorNotificationSlot`). Throws `resource-exhausted`.
 */
export async function reservePlannerMessageSlot(uid: string, now: number): Promise<void> {
	const ref = db.collection(Collections.studioRateLimits).doc(uid);
	await db.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const data = (snap.data() ?? {}) as { windowStart?: number; count?: number };
		const windowStart = typeof data.windowStart === 'number' ? data.windowStart : 0;
		const inWindow = now - windowStart < RATE_WINDOW_MS;
		const count = inWindow && typeof data.count === 'number' ? data.count : 0;
		if (inWindow && count >= STUDIO_PLAN_MESSAGES_PER_HOUR) {
			const minutesLeft = Math.ceil((RATE_WINDOW_MS - (now - windowStart)) / 60000);
			throw new HttpsError(
				'resource-exhausted',
				`Hourly limit reached. Try again in ${minutesLeft} minute${minutesLeft === 1 ? '' : 's'}.`,
			);
		}
		tx.set(
			ref,
			{ windowStart: inWindow ? windowStart : now, count: count + 1, lastUpdate: now },
			{ merge: true },
		);
	});
}

export function activityTypeOf(statement: Statement): StudioActivityType {
	if (statement.sourceApp === SourceApp.JOIN) return 'liveSession';
	if (
		statement.sourceApp === SourceApp.MASS_CONSENSUS ||
		statement.questionSettings?.questionType === 'mass-consensus'
	) {
		return 'crowdSurvey';
	}

	return 'discussion';
}

/** Non-archived direct children of a top question, in board order. */
export async function loadExistingActivities(
	topQuestionId: string,
): Promise<StudioExistingActivitySnapshot[]> {
	const snap = await db
		.collection(Collections.statements)
		.where('parentId', '==', topQuestionId)
		.get();
	const rows = snap.docs
		.map((doc) => doc.data() as Statement)
		.filter((s) => !s.hide)
		.sort((a, b) => {
			const orderDiff = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);

			return orderDiff !== 0 ? orderDiff : (a.createdAt ?? 0) - (b.createdAt ?? 0);
		});

	return rows.map((s, index) => {
		const row: StudioExistingActivitySnapshot = {
			statementId: s.statementId,
			type: activityTypeOf(s),
			title: s.statement,
			order: typeof s.order === 'number' ? s.order : index,
		};
		if (s.description) row.description = s.description;
		if (s.statementSettings?.questionStatus) row.status = s.statementSettings.questionStatus;
		if (s.questionSettings?.massConsensusSurveyId) {
			row.surveyId = s.questionSettings.massConsensusSurveyId;
		}

		return row;
	});
}
