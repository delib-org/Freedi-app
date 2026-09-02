import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	StatementType,
	createStatementObject,
	functionConfig,
	getRandomUID,
	AgoraClass,
	AgoraDeviceMode,
	AgoraIdentityMode,
	AgoraParticipant,
	AgoraSession,
	AgoraSessionFlow,
	AgoraSessionFlowSchema,
	AgoraSessionStatus,
	AgoraStage,
	AgoraStagePlan,
	AgoraStagePlanItem,
	AgoraStagePlanSchema,
	AgoraTopicPackage,
	AgoraTopicStatus,
	SourceApp,
	AGORA_AI_REVIEW,
	AGORA_CYCLE,
	AGORA_SESSION,
	AGORA_STAGE_PLAN,
	createAgoraAiRaterUid,
	createAgoraParticipantId,
	deriveCamp,
} from '@freedi/shared-types';
import { safeParse } from 'valibot';
import { logError } from '../utils/errorHandling';
import { generateUniqueCode } from './joinCodes';
import { buildQuestionStatement } from './questionStage';
import { sanitizeStagePlan } from './stagePlanInput';

/** A game started by typing the main question — no scenario package behind it */
export interface QuickGameRequest {
	title: string;
	mainQuestion: string;
	explanation?: string;
	/** BCP-47, the language the room writes in */
	language: string;
}

interface Request {
	/** A ready scenario package — or omit it and send `quick` */
	topicPackageId?: string;
	quick?: QuickGameRequest;
	deviceMode: AgoraDeviceMode;
	teamSizeMax?: number;
	lessonLengthMs?: number;
	/** Link this game to a class — the caller must be one of its teachers */
	classId?: string;
	/** Which beats to run — the classroom counterpart of the civic script */
	flow?: AgoraSessionFlow;
	/** The ordered stage list. Absent means the legacy order for the flow. */
	stagePlan?: AgoraStagePlan;
	identity?: AgoraIdentityMode;
}

/** Sanity bounds on the teacher's flow knobs — a 40-round lesson is a typo */
const FLOW_BOUNDS = {
	MIN_ROUNDS: 1,
	MAX_ROUNDS: AGORA_CYCLE.ROUNDS,
	MIN_RATINGS_PER_ROUND: 1,
	MAX_RATINGS_PER_ROUND: 10,
} as const;

const QUICK_LEFT_ID = 'quick-left';
const QUICK_RIGHT_ID = 'quick-right';

/**
 * Validate and clamp a teacher-supplied session flow. Only fields the teacher
 * actually set survive (mirrors scriptToFlow's sparseness), so an untouched
 * knob still resolves through the mode's legacy defaults.
 */
function sanitizeFlow(flow: AgoraSessionFlow | undefined): AgoraSessionFlow | undefined {
	if (flow === undefined) return undefined;
	const parsed = safeParse(AgoraSessionFlowSchema, flow);
	if (!parsed.success) {
		throw new HttpsError('invalid-argument', 'Invalid session flow');
	}
	const clean = { ...parsed.output };
	if (clean.rounds !== undefined) {
		clean.rounds = Math.min(
			FLOW_BOUNDS.MAX_ROUNDS,
			Math.max(FLOW_BOUNDS.MIN_ROUNDS, Math.round(clean.rounds)),
		);
	}
	if (clean.ratingsPerRound !== undefined) {
		clean.ratingsPerRound = Math.min(
			FLOW_BOUNDS.MAX_RATINGS_PER_ROUND,
			Math.max(FLOW_BOUNDS.MIN_RATINGS_PER_ROUND, Math.round(clean.ratingsPerRound)),
		);
	}

	return Object.keys(clean).length > 0 ? clean : undefined;
}

/**
 * The minimal package a quick game runs on. Two placeholder characters
 * satisfy the tuple the scenario readers assume; nothing else is authored,
 * and the plan validator refuses every stage that would need it. A quick
 * game always runs without camps, needs, elders or a framing scene — there
 * is nobody to frame it and no sides to take.
 */
function buildQuickTopic(
	sessionId: string,
	uid: string,
	quick: QuickGameRequest,
	now: number,
): AgoraTopicPackage {
	const title = quick.title.trim().slice(0, AGORA_STAGE_PLAN.MAX_TITLE_LENGTH);
	const mainQuestion = quick.mainQuestion.trim().slice(0, AGORA_STAGE_PLAN.MAX_TITLE_LENGTH);
	const explanation = (quick.explanation ?? '')
		.trim()
		.slice(0, AGORA_STAGE_PLAN.MAX_EXPLANATION_LENGTH);
	const placeholder = (characterId: string) => ({
		characterId,
		name: '',
		role: '',
		arguments: [],
		values: [],
	});

	return {
		topicPackageId: `quick-${sessionId}`,
		creatorId: uid,
		kind: 'quick',
		topic: title,
		language: quick.language,
		status: AgoraTopicStatus.ready,
		title,
		framingText: explanation,
		characters: [placeholder(QUICK_LEFT_ID), placeholder(QUICK_RIGHT_ID)],
		positioningScale: {
			leftLabel: '',
			rightLabel: '',
			leftCharacterId: QUICK_LEFT_ID,
			rightCharacterId: QUICK_RIGHT_ID,
		},
		challengeQuestion: mainQuestion,
		valueAnswerKey: [],
		plausibilityRubric: { criteria: [] },
		healthMetrics: [],
		scenes: [],
		createdAt: now,
		lastUpdate: now,
	};
}

const QUICK_FLOW: AgoraSessionFlow = {
	stances: false,
	needs: false,
	elders: false,
	framing: false,
};

function parseQuick(quick: unknown): QuickGameRequest {
	const q = quick as Partial<QuickGameRequest> | undefined;
	if (!q || typeof q.title !== 'string' || !q.title.trim()) {
		throw new HttpsError('invalid-argument', 'quick.title is required');
	}
	if (typeof q.mainQuestion !== 'string' || !q.mainQuestion.trim()) {
		throw new HttpsError('invalid-argument', 'quick.mainQuestion is required');
	}
	const language = typeof q.language === 'string' && q.language.trim() ? q.language.trim() : 'he';

	return {
		title: q.title,
		mainQuestion: q.mainQuestion,
		language,
		...(typeof q.explanation === 'string' ? { explanation: q.explanation } : {}),
	};
}

interface Result {
	sessionId: string;
	code: string;
}

/**
 * Teacher opens a session — for a ready topic package, or as a quick game
 * from a typed main question. Creates the session root Statement + the
 * challenge-question Statement (so the wizcol evaluation pipeline works
 * unchanged), one question Statement per question item in the plan, and the
 * AgoraSession doc.
 */
export const agoraCreateSession = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Teachers must sign in with a full account');
		}

		const {
			topicPackageId,
			quick,
			deviceMode,
			teamSizeMax,
			lessonLengthMs,
			classId,
			flow,
			stagePlan,
			identity,
		} = request.data ?? {};
		const quickGame = quick !== undefined ? parseQuick(quick) : undefined;
		if (!quickGame && (!topicPackageId || typeof topicPackageId !== 'string')) {
			throw new HttpsError('invalid-argument', 'topicPackageId or quick is required');
		}
		if (!Object.values(AgoraDeviceMode).includes(deviceMode)) {
			throw new HttpsError('invalid-argument', 'deviceMode must be individual or team');
		}
		if (identity !== undefined && identity !== 'pseudonym' && identity !== 'named') {
			throw new HttpsError('invalid-argument', 'identity must be pseudonym or named');
		}
		const resolvedTeamSize = teamSizeMax ?? AGORA_SESSION.TEAM_SIZE_MAX;
		if (
			resolvedTeamSize < AGORA_SESSION.TEAM_SIZE_MIN ||
			resolvedTeamSize > AGORA_SESSION.TEAM_SIZE_MAX
		) {
			throw new HttpsError('invalid-argument', 'teamSizeMax out of range');
		}
		let plan: AgoraStagePlan | undefined;
		if (stagePlan !== undefined) {
			const parsedPlan = safeParse(AgoraStagePlanSchema, stagePlan);
			if (!parsedPlan.success) {
				throw new HttpsError('invalid-argument', 'Invalid stage plan');
			}
			plan = parsedPlan.output;
		}

		try {
			const sessionId = getRandomUID();
			const now = Date.now();

			let topic: AgoraTopicPackage;
			if (quickGame) {
				topic = buildQuickTopic(sessionId, uid, quickGame, now);
			} else {
				const topicSnap = await db
					.collection(Collections.agoraTopicPackages)
					.doc(topicPackageId as string)
					.get();
				if (!topicSnap.exists) {
					throw new HttpsError('not-found', 'Topic package not found');
				}
				topic = topicSnap.data() as AgoraTopicPackage;
				if (topic.status !== AgoraTopicStatus.ready) {
					throw new HttpsError('failed-precondition', 'Topic package is not ready');
				}
			}
			const isQuick = topic.kind === 'quick';

			// A class game must be opened by one of the class's own teachers; a
			// guest game (no classId) stays exactly what sessions have always been.
			let schoolId: string | undefined;
			if (classId !== undefined) {
				if (typeof classId !== 'string' || !classId) {
					throw new HttpsError('invalid-argument', 'classId must be a string');
				}
				const classSnap = await db.collection(Collections.agoraClasses).doc(classId).get();
				const agoraClass = classSnap.data() as AgoraClass | undefined;
				if (!agoraClass || agoraClass.status !== 'active') {
					throw new HttpsError('failed-precondition', 'Class not found or archived');
				}
				if (!agoraClass.teacherIds.includes(uid)) {
					throw new HttpsError(
						'permission-denied',
						'Only a teacher of this class can open a game for it',
					);
				}
				schoolId = agoraClass.schoolId;
			}

			const teacherFlow = sanitizeFlow(flow);
			// A quick game has no sides and nothing to frame; only the pace knobs
			// (rounds, ratings per round) are the teacher's to set.
			const sessionFlow: AgoraSessionFlow | undefined = isQuick
				? {
						...QUICK_FLOW,
						...(teacherFlow?.rounds !== undefined ? { rounds: teacherFlow.rounds } : {}),
						...(teacherFlow?.ratingsPerRound !== undefined
							? { ratingsPerRound: teacherFlow.ratingsPerRound }
							: {}),
					}
				: teacherFlow;

			const cleanPlan: AgoraStagePlanItem[] | undefined = plan
				? sanitizeStagePlan(plan, { hasCharacters: !isQuick })
				: undefined;
			if (isQuick && !cleanPlan) {
				throw new HttpsError('invalid-argument', 'A quick game needs a stage plan');
			}

			const token = request.auth?.token as Record<string, unknown> | undefined;
			const creator = {
				uid,
				displayName: typeof token?.name === 'string' ? token.name : 'Teacher',
				email: typeof token?.email === 'string' ? token.email : null,
				photoURL: typeof token?.picture === 'string' ? token.picture : null,
				isAnonymous: false,
			};

			const rootBuilt = createStatementObject({
				statement: topic.title,
				statementType: StatementType.question,
				parentId: 'top',
				topParentId: 'top',
				creatorId: uid,
				creator,
				sourceApp: SourceApp.AGORA,
				agoraSessionId: sessionId,
			});
			if (!rootBuilt) {
				throw new HttpsError('internal', 'Failed to build root statement');
			}
			const rootStatement =
				isQuick && topic.framingText ? { ...rootBuilt, description: topic.framingText } : rootBuilt;

			const challengeStatement = createStatementObject({
				statement: topic.challengeQuestion,
				statementType: StatementType.question,
				parentId: rootStatement.statementId,
				topParentId: rootStatement.statementId,
				creatorId: uid,
				creator,
				sourceApp: SourceApp.AGORA,
				agoraSessionId: sessionId,
			});
			if (!challengeStatement) {
				throw new HttpsError('internal', 'Failed to build challenge statement');
			}

			const code = await generateUniqueCode();
			const batch = db.batch();

			// One question Statement per question item — the answers' parent
			const planWithStatements = cleanPlan?.map((item) => {
				if (item.stage !== AgoraStage.question) return item;
				const statement = buildQuestionStatement({
					item,
					sessionId,
					rootStatementId: rootStatement.statementId,
					creatorId: uid,
					creator,
				});
				if (!statement) throw new HttpsError('internal', 'Failed to build question');
				batch.set(db.collection(Collections.statements).doc(statement.statementId), statement);

				return { ...item, statementId: statement.statementId };
			});

			const session: AgoraSession = {
				sessionId,
				code,
				topicPackageId: topic.topicPackageId,
				teacherId: uid,
				rootStatementId: rootStatement.statementId,
				challengeQuestionId: challengeStatement.statementId,
				deviceMode,
				teamSizeMax: resolvedTeamSize,
				...(classId && schoolId ? { classId, schoolId } : {}),
				...(sessionFlow ? { flow: sessionFlow } : {}),
				...(planWithStatements
					? { stagePlan: planWithStatements, stageIndex: 0, stageState: {} }
					: {}),
				...(identity ? { identity } : {}),
				stage: AgoraStage.lobby,
				roundNumber: 0,
				participantCount: 0,
				status: AgoraSessionStatus.open,
				lessonEndsAt: now + (lessonLengthMs ?? AGORA_SESSION.DEFAULT_LESSON_MS),
				createdAt: now,
				lastUpdate: now,
			};

			if (isQuick) {
				batch.set(db.collection(Collections.agoraTopicPackages).doc(topic.topicPackageId), topic);
			}
			batch.set(
				db.collection(Collections.statements).doc(rootStatement.statementId),
				rootStatement,
			);
			batch.set(
				db.collection(Collections.statements).doc(challengeStatement.statementId),
				challengeStatement,
			);
			batch.set(db.collection(Collections.agoraSessions).doc(sessionId), session);

			// Seed the characters' synthetic AI rater identities — each character
			// reviews proposals "as if they were 3 participants". Their participant
			// docs must exist (with a camp) before their first evaluation, because
			// the bridging trigger resolves camps server-side. Excluded everywhere
			// from participantCount and student-only metrics via isAI. A quick
			// game has no characters worth the name and seeds none.
			if (!isQuick) {
				for (const character of topic.characters) {
					const campPosition =
						character.characterId === topic.positioningScale.rightCharacterId
							? AGORA_AI_REVIEW.RIGHT_CAMP_POSITION
							: AGORA_AI_REVIEW.LEFT_CAMP_POSITION;
					for (let index = 1; index <= AGORA_AI_REVIEW.RATERS_PER_CHARACTER; index++) {
						const aiUid = createAgoraAiRaterUid(character.characterId, index);
						const aiParticipant: AgoraParticipant = {
							participantId: createAgoraParticipantId(sessionId, aiUid),
							sessionId,
							userId: aiUid,
							anonName: character.name,
							isAI: true,
							campPosition,
							camp: deriveCamp(campPosition),
							points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 0 },
							joinedAt: now,
							lastActive: now,
						};
						batch.set(
							db.collection(Collections.agoraParticipants).doc(aiParticipant.participantId),
							aiParticipant,
						);
					}
				}
			}

			await batch.commit();

			return { sessionId, code };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.createSession',
				userId: uid,
				metadata: { topicPackageId: topicPackageId ?? 'quick' },
			});
			throw new HttpsError('internal', 'Failed to create session');
		}
	},
);
