import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/v1';
import { computeProposalDiff } from '@freedi/deliberation-brain';
import {
	Access,
	Collections,
	ScheduledAction,
	Statement,
	StatementType,
	StudioPlan,
	StudioPlanActivity,
	StudioPlanBuildResult,
	StudioPlanSession,
	SurveyStatus,
	createStatementObject,
	defaultStatementSettings,
	functionConfig,
} from '@freedi/shared-types';
import { db } from '../../db';
import { logError } from '../../utils/errorHandling';
import { commitInChunks, listOrgAdminMembers } from '../orgAuth';
import { getCallerIdentity } from '../orgInvites';
import {
	buildChildQuestion,
	buildTopQuestion,
	callerHasTopSubscription,
	childQuestionWrites,
	loadCallerUser,
	nextChildOrder,
	seedProgress,
	topQuestionWrites,
	type BatchWrite,
	type OrgActorMember,
	type OrgChildKind,
	type OrgStatementActor,
} from '../orgStatements';
import { applyMassConsensusQuestionDefaults } from './massConsensusDefaults';
import { assertPlannerAccess, loadSessionForCaller } from './planSession';
import {
	buildSurveyForActivity,
	surveyStatusForQuestionStatus,
	surveyWrites,
} from './surveyWriter';

export interface StudioPlanBuildRequest {
	sessionId: string;
	access?: Access;
}

const KIND_BY_TYPE: Record<StudioPlanActivity['type'], OrgChildKind> = {
	crowdSurvey: 'massConsensus',
	liveSession: 'join',
	discussion: 'question',
};
const BUILD_CLAIM_TTL_MS = 10 * 60 * 1000;
const ACCESS_VALUES: ReadonlySet<string> = new Set(Object.values(Access));

interface BuildState {
	session: StudioPlanSession;
	plan: StudioPlan;
	actor: OrgStatementActor;
	organizationId: string;
	now: number;
	build: StudioPlanBuildResult;
	/** Statements created or loaded during this build, by id. */
	statements: Map<string, Statement>;
}

async function claimBuild(
	sessionId: string,
	uid: string,
	now: number,
): Promise<{ session: StudioPlanSession; done?: StudioPlanBuildResult }> {
	const { ref } = await loadSessionForCaller(sessionId, uid);

	return db.runTransaction(async (tx) => {
		const snap = await tx.get(ref);
		const session = snap.data() as StudioPlanSession;
		if (session.status === 'built' && session.build) {
			return { session, done: session.build };
		}
		if (
			session.status === 'building' &&
			typeof session.buildStartedAt === 'number' &&
			now - session.buildStartedAt < BUILD_CLAIM_TTL_MS
		) {
			throw new HttpsError('aborted', 'This plan is already being built');
		}
		if (!session.currentPlan || session.currentPlan.activities.length === 0) {
			throw new HttpsError('failed-precondition', 'There is no plan to build yet');
		}
		tx.update(ref, { status: 'building', buildStartedAt: now, lastUpdate: now });

		return { session: { ...session, status: 'building', buildStartedAt: now } };
	});
}

async function persistBuild(state: BuildState): Promise<void> {
	await db
		.collection(Collections.studioPlanSessions)
		.doc(state.session.sessionId)
		.update({ build: state.build, lastUpdate: Date.now() });
}

async function loadStatement(id: string): Promise<Statement> {
	const snap = await db.collection(Collections.statements).doc(id).get();
	if (!snap.exists) throw new HttpsError('not-found', `Question ${id} not found`);

	return snap.data() as Statement;
}

async function ensureTopQuestion(
	state: BuildState,
	access: Access | undefined,
): Promise<Statement> {
	const { session, plan, actor, organizationId, now } = state;
	if (state.build.topQuestionId) {
		const top = await loadStatement(state.build.topQuestionId);
		if (session.topQuestionId) {
			// Existing mode: apply a title/description update when the plan changed them.
			const patch: Partial<Statement> = {};
			if (plan.mainQuestion.title.trim() && plan.mainQuestion.title.trim() !== top.statement) {
				patch.statement = plan.mainQuestion.title.trim();
			}
			const desc = plan.mainQuestion.description?.trim();
			if (desc && desc !== top.description) patch.description = desc;
			if (Object.keys(patch).length > 0) {
				await db
					.collection(Collections.statements)
					.doc(top.statementId)
					.set({ ...patch, lastUpdate: now }, { merge: true });
				Object.assign(top, patch);
			}
		}
		state.statements.set(top.statementId, top);

		return top;
	}

	const orgSnap = await db.collection(Collections.organizations).doc(organizationId).get();
	const organization = orgSnap.data();
	if (!organization) throw new HttpsError('not-found', 'Organization not found');
	const statementId = db.collection(Collections.statements).doc().id;
	const top = buildTopQuestion({
		statementId,
		organization: { ...organization, organizationId } as Parameters<
			typeof buildTopQuestion
		>[0]['organization'],
		actor,
		title: plan.mainQuestion.title.trim(),
		description: plan.mainQuestion.description?.trim() || undefined,
		access,
		questionStatus: 'live',
	});
	const admins: OrgActorMember[] = await listOrgAdminMembers(organizationId);
	if (!admins.some((admin) => admin.userId === actor.uid)) {
		admins.push(actor.member);
	}
	await commitInChunks(topQuestionWrites({ statement: top, organizationId, admins, now }));
	state.build.topQuestionId = statementId;
	state.statements.set(statementId, top);
	await persistBuild(state);

	return top;
}

function buildExtraQuestion(
	state: BuildState,
	activity: Statement,
	top: Statement,
	extra: { title: string; description?: string },
	order: number,
): Statement {
	const statementId = db.collection(Collections.statements).doc().id;
	const statement = createStatementObject({
		statement: extra.title.trim(),
		statementType: StatementType.question,
		parentId: activity.statementId,
		topParentId: top.statementId,
		parents: [top.statementId, activity.statementId],
		statementId,
		creatorId: state.actor.uid,
		creator: state.actor.user,
		statementSettings: {
			...defaultStatementSettings,
			questionStatus: activity.statementSettings?.questionStatus,
		},
		sourceApp: activity.sourceApp,
	});
	if (!statement) throw new HttpsError('internal', 'Failed to build a survey question');
	statement.order = order;
	if (extra.description?.trim()) statement.description = extra.description.trim();

	return applyMassConsensusQuestionDefaults(statement, {
		askUserForASolutionBeforeEvaluation: true,
	});
}

async function createActivities(state: BuildState, top: Statement): Promise<void> {
	const { plan, actor, organizationId, now } = state;
	const ordered = [...plan.activities].sort((a, b) => a.order - b.order);
	let nextOrder = await nextChildOrder(top.statementId);

	for (const activity of ordered) {
		if (activity.change === 'keep') continue;
		if (activity.change === 'update') {
			if (!activity.existingStatementId) continue;
			const existing = await loadStatement(activity.existingStatementId);
			if (existing.parentId !== top.statementId) {
				throw new HttpsError('failed-precondition', 'Activity does not belong to this question');
			}
			const patch: Partial<Statement> = {};
			if (activity.title.trim() && activity.title.trim() !== existing.statement) {
				patch.statement = activity.title.trim();
			}
			const desc = activity.description?.trim();
			if (desc && desc !== existing.description) patch.description = desc;
			if (Object.keys(patch).length > 0) {
				await db
					.collection(Collections.statements)
					.doc(existing.statementId)
					.set({ ...patch, lastUpdate: now }, { merge: true });
			}
			state.statements.set(existing.statementId, { ...existing, ...patch });
			state.build.activityIds[activity.tempId] = existing.statementId;
			continue;
		}

		// change === 'add'
		const alreadyId = state.build.activityIds[activity.tempId];
		if (alreadyId) {
			state.statements.set(alreadyId, await loadStatement(alreadyId));
			continue;
		}
		const kind = KIND_BY_TYPE[activity.type];
		const statementId = db.collection(Collections.statements).doc().id;
		let statement = buildChildQuestion({
			statementId,
			parent: top,
			kind,
			actor,
			title: activity.title.trim(),
			description: activity.description?.trim() || undefined,
			order: nextOrder++,
			questionStatus: activity.openNow ? 'live' : 'frozen',
		});
		const writes: BatchWrite[] = [];
		if (activity.type === 'crowdSurvey') {
			statement = applyMassConsensusQuestionDefaults(statement, {
				askUserForASolutionBeforeEvaluation:
					activity.survey?.askUserForASolutionBeforeEvaluation ?? true,
			});
		}
		const topSubExists =
			kind === 'join' ? await callerHasTopSubscription(actor.uid, top.statementId) : false;
		writes.push(
			...childQuestionWrites({
				statement,
				parent: top,
				organizationId,
				kind,
				actor,
				now,
				topSubExists,
			}),
		);
		state.build.activityIds[activity.tempId] = statementId;
		const extras = activity.type === 'crowdSurvey' ? (activity.survey?.extraQuestions ?? []) : [];
		const extraStatements = extras.map((extra, index) =>
			buildExtraQuestion(state, statement, top, extra, index + 1),
		);
		extraStatements.forEach((extra, index) => {
			writes.push((batch) =>
				batch.set(db.collection(Collections.statements).doc(extra.statementId), extra),
			);
			writes.push((batch) =>
				batch.set(
					db.collection(Collections.questionProgress).doc(extra.statementId),
					seedProgress(extra.statementId, top.statementId, organizationId, now),
				),
			);
			state.build.activityIds[extras[index].tempId] = extra.statementId;
		});
		await commitInChunks(writes);
		state.statements.set(statementId, statement);
		extraStatements.forEach((extra) => state.statements.set(extra.statementId, extra));
		await persistBuild(state);
	}
}

async function createSurveys(state: BuildState, top: Statement): Promise<void> {
	const { plan, session, actor, now } = state;
	for (const activity of plan.activities) {
		if (activity.type !== 'crowdSurvey' || activity.change !== 'add') continue;
		const statementId = state.build.activityIds[activity.tempId];
		const statement = statementId ? state.statements.get(statementId) : undefined;
		if (!statement || statement.questionSettings?.massConsensusSurveyId) continue;
		const extras = (activity.survey?.extraQuestions ?? [])
			.map((extra) => state.build.activityIds[extra.tempId])
			.filter((id): id is string => !!id)
			.map((id) => state.statements.get(id))
			.filter((s): s is Statement => !!s);
		const status: SurveyStatus = surveyStatusForQuestionStatus(
			statement.statementSettings?.questionStatus,
		);
		const survey = buildSurveyForActivity({
			activity: statement,
			extraQuestions: extras,
			config: activity.survey,
			parentStatementId: top.statementId,
			creatorId: actor.uid,
			language: session.language,
			status,
			now,
		});
		const refs = [statement, ...extras].map((s) =>
			db.collection(Collections.statements).doc(s.statementId),
		);
		await commitInChunks(surveyWrites(survey, refs, now));
		statement.questionSettings = {
			...statement.questionSettings,
			massConsensusSurveyId: survey.surveyId,
		};
		state.build.surveyIds.push(survey.surveyId);
		await persistBuild(state);
	}
}

async function createScheduledActions(state: BuildState, top: Statement): Promise<void> {
	const { plan, session, actor, organizationId, now } = state;
	const known = new Set<string>([top.statementId, ...Object.values(state.build.activityIds)]);
	(session.existingActivities ?? []).forEach((a) => known.add(a.statementId));
	const writes: BatchWrite[] = [];
	for (const item of plan.scheduledActions) {
		const targetId = item.activityTempId
			? state.build.activityIds[item.activityTempId]
			: item.statementId;
		if (!targetId || !known.has(targetId) || item.at <= now) continue;
		const scheduledActionId = `${session.sessionId}--${item.tempId}`;
		if (state.build.scheduledActionIds.includes(scheduledActionId)) continue;
		const doc: ScheduledAction = {
			scheduledActionId,
			statementId: targetId,
			topParentId: top.statementId,
			organizationId,
			action: item.action,
			runAt: item.at,
			status: 'pending',
			createdBy: actor.uid,
			source: 'plan',
			sessionId: session.sessionId,
			createdAt: now,
			lastUpdate: now,
		};
		if (item.action === 'nudge') {
			if (!item.nudgeMessage?.trim()) continue;
			doc.nudge = {
				message: item.nudgeMessage.trim(),
				audience: 'all',
				channels: ['inApp', 'email'],
			};
		}
		writes.push((batch) =>
			batch.set(db.collection(Collections.scheduledActions).doc(scheduledActionId), doc),
		);
		state.build.scheduledActionIds.push(scheduledActionId);
	}
	if (writes.length > 0) await commitInChunks(writes);
}

/**
 * Materializes the negotiated plan: top question (new mode), activities in
 * order, MC surveys for crowd surveys, scheduled actions. Idempotent — ids
 * are persisted on the session after each step so a retry skips what exists.
 */
export const fn_studioPlanBuild = onCall(
	{ region: functionConfig.region, timeoutSeconds: 300, memory: '512MiB' },
	async (request: CallableRequest<StudioPlanBuildRequest>): Promise<StudioPlanBuildResult> => {
		const caller = getCallerIdentity(request);
		const { sessionId, access } = request.data ?? {};
		if (access !== undefined && !ACCESS_VALUES.has(access)) {
			throw new HttpsError('invalid-argument', 'Invalid access');
		}
		const now = Date.now();
		const claimed = await claimBuild(sessionId, caller.uid, now);
		if (claimed.done) return claimed.done;
		const session = claimed.session;
		const plan = session.currentPlan as StudioPlan;
		const sessionRef = db.collection(Collections.studioPlanSessions).doc(session.sessionId);

		try {
			const planner = await assertPlannerAccess(
				caller.uid,
				session.organizationId,
				session.topQuestionId,
			);
			const user = await loadCallerUser(caller.uid, caller);
			const state: BuildState = {
				session,
				plan,
				actor: {
					uid: caller.uid,
					user,
					member: { ...planner.member, email: user.email ?? '', displayName: user.displayName },
				},
				organizationId: session.organizationId,
				now,
				build: session.build ?? {
					topQuestionId: session.topQuestionId ?? '',
					activityIds: {},
					surveyIds: [],
					scheduledActionIds: [],
				},
				statements: new Map(),
			};

			const top = await ensureTopQuestion(state, access);
			await createActivities(state, top);
			await createSurveys(state, top);
			await createScheduledActions(state, top);

			state.build.completedAt = Date.now();
			const proposed = session.proposedPlan ?? plan;
			await sessionRef.update({
				status: 'built',
				build: state.build,
				builtStatementId: top.statementId,
				builtPlan: plan,
				proposedPlan: proposed,
				proposalDiff: computeProposalDiff(proposed, plan),
				lastUpdate: state.build.completedAt,
			});

			logger.info('[fn_studioPlanBuild] built', {
				sessionId: session.sessionId,
				topQuestionId: top.statementId,
				activities: Object.keys(state.build.activityIds).length,
				surveys: state.build.surveyIds.length,
				scheduledActions: state.build.scheduledActionIds.length,
			});

			return state.build;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			logError(error, {
				operation: 'studio.plan.build',
				userId: caller.uid,
				metadata: { sessionId: session.sessionId, organizationId: session.organizationId },
			});
			await sessionRef.update({ status: 'failed', buildError: message, lastUpdate: Date.now() });
			if (error instanceof HttpsError) throw error;
			throw new HttpsError('internal', 'Could not build the plan');
		}
	},
);
