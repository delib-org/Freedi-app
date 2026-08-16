import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from '../db';
import {
	Collections,
	StatementType,
	Statement,
	createStatementObject,
	functionConfig,
	getRandomUID,
	AgoraCharacter,
	AgoraDeviceMode,
	AgoraSession,
	AgoraSessionMode,
	AgoraSessionStatus,
	AgoraStage,
	AgoraTopicPackage,
	AgoraTopicStatus,
	OdysseyGame,
	OdysseyIsland,
	OdysseyIslandAgoraSession,
	SourceApp,
	AGORA_SESSION,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { generateUniqueCode } from './joinCodes';

interface Request {
	gameId: string;
	/** Islands to open; omitted = every enabled island not already open */
	islandStatementIds?: string[];
}

interface ProvisionedSession {
	islandStatementId: string;
	sessionId: string;
	code: string;
}

interface Result {
	sessions: ProvisionedSession[];
	/** Islands skipped because a deliberation was already open for them */
	alreadyOpen: string[];
}

/**
 * A civic session writes four docs; the game update is one more. Firestore
 * caps a batch at 500, so this keeps a whole provisioning run inside one
 * atomic commit — either every island opens or none does.
 */
const MAX_ISLANDS_PER_RUN = 100;

/** Fallback pole labels when an island has no anchor stances chosen yet. */
const DEFAULT_LEFT_LABEL = 'עמדה א׳';
const DEFAULT_RIGHT_LABEL = 'עמדה ב׳';

/** Character names are shown as chips; a whole stance sentence will not fit. */
const CHARACTER_NAME_MAX = 40;

function shorten(text: string, max: number): string {
	const clean = text.trim();

	return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * A civic deliberation has no historical characters to role-play — but the
 * topic-package schema is what every Agora load path reads, and it wants
 * exactly two. So the island's two anchor stances become the two "voices",
 * which is also what the camp scale is built from: the same two poles name the
 * scale and define left and right.
 */
function buildCivicTopicPackage(params: {
	topicPackageId: string;
	creatorId: string;
	island: OdysseyIsland;
	questionText: string;
	leftStanceText?: string;
	rightStanceText?: string;
	now: number;
}): AgoraTopicPackage {
	const { topicPackageId, creatorId, island, questionText, now } = params;
	const leftLabel = params.leftStanceText?.trim() || DEFAULT_LEFT_LABEL;
	const rightLabel = params.rightStanceText?.trim() || DEFAULT_RIGHT_LABEL;

	const voice = (characterId: string, label: string): AgoraCharacter => ({
		characterId,
		name: shorten(label, CHARACTER_NAME_MAX),
		role: island.title,
		arguments: [label],
		needs: [],
		values: [],
	});

	return {
		topicPackageId,
		creatorId,
		topic: island.title,
		language: 'he',
		status: AgoraTopicStatus.ready,
		title: island.title,
		framingText: island.shortExplain || island.opening || island.issue,
		characters: [voice('left', leftLabel), voice('right', rightLabel)],
		positioningScale: {
			leftLabel: shorten(leftLabel, CHARACTER_NAME_MAX),
			rightLabel: shorten(rightLabel, CHARACTER_NAME_MAX),
			leftCharacterId: 'left',
			rightCharacterId: 'right',
		},
		challengeQuestion: questionText,
		valueAnswerKey: [],
		plausibilityRubric: {
			criteria: [
				{
					criterionId: 'feasible',
					label: 'ישימות',
					description: 'האם אפשר באמת לבצע את ההצעה?',
					weight: 0.4,
				},
				{
					criterionId: 'fair',
					label: 'הוגנות',
					description: 'האם ההצעה מתחשבת גם במי שחושב אחרת?',
					weight: 0.3,
				},
				{
					criterionId: 'effective',
					label: 'אפקטיביות',
					description: 'האם ההצעה באמת פותרת את הבעיה שבשאלה?',
					weight: 0.3,
				},
			],
		},
		healthMetrics: [],
		scenes: [],
		createdAt: now,
		lastUpdate: now,
	};
}

/**
 * Open one always-on Agora deliberation per Odyssey island — the other side of
 * the gates the summary and the map show.
 *
 * These sessions start at the deliberation stage and carry no lessonEndsAt, so
 * nobody has to advance them and the hourly sweep never ends them: a player who
 * finishes the voyage at midnight finds the square already open. Idempotent —
 * an island that already has a session is reported back, never re-opened.
 */
export const agoraProvisionCivicSessions = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<Request>): Promise<Result> => {
		const uid = request.auth?.uid;
		if (!uid) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}
		if (request.auth?.token.firebase.sign_in_provider === 'anonymous') {
			throw new HttpsError('permission-denied', 'Provisioning requires a full account');
		}

		const { gameId, islandStatementIds } = request.data ?? {};
		if (!gameId || typeof gameId !== 'string') {
			throw new HttpsError('invalid-argument', 'gameId is required');
		}

		try {
			const gameRef = db.collection(Collections.odysseyGames).doc(gameId);
			const gameSnap = await gameRef.get();
			if (!gameSnap.exists) {
				throw new HttpsError('not-found', 'Odyssey game not found');
			}
			const game = gameSnap.data() as OdysseyGame;

			const isAdmin = game.creatorId === uid || (game.adminUids ?? []).includes(uid);
			if (!isAdmin) {
				throw new HttpsError('permission-denied', 'Only game admins can open deliberations');
			}

			const openAlready = game.agoraSessions ?? {};
			const requested = islandStatementIds?.length
				? game.islands.filter((island) => islandStatementIds.includes(island.statementId))
				: game.islands.filter((island) => island.enabled);

			const alreadyOpen = requested
				.filter((island) => openAlready[island.statementId])
				.map((island) => island.statementId);
			const toOpen = requested.filter((island) => !openAlready[island.statementId]);

			if (!toOpen.length) {
				return { sessions: [], alreadyOpen };
			}
			if (toOpen.length > MAX_ISLANDS_PER_RUN) {
				throw new HttpsError(
					'invalid-argument',
					`Cannot open more than ${MAX_ISLANDS_PER_RUN} deliberations at once`,
				);
			}

			// The island's question text and its anchor stances all live on
			// Statement docs — read them together rather than per island.
			const statementIds = new Set<string>();
			for (const island of toOpen) {
				statementIds.add(island.statementId);
				if (island.leftAnchorStanceId) statementIds.add(island.leftAnchorStanceId);
				if (island.rightAnchorStanceId) statementIds.add(island.rightAnchorStanceId);
			}
			const statementSnaps = await db.getAll(
				...[...statementIds].map((id) => db.collection(Collections.statements).doc(id)),
			);
			const statementText = new Map<string, string>();
			for (const snap of statementSnaps) {
				const data = snap.data() as Statement | undefined;
				if (data?.statement) statementText.set(snap.id, data.statement);
			}

			const token = request.auth?.token as Record<string, unknown> | undefined;
			const creator = {
				uid,
				displayName: typeof token?.name === 'string' ? token.name : 'Odyssey',
				email: typeof token?.email === 'string' ? token.email : null,
				photoURL: typeof token?.picture === 'string' ? token.picture : null,
				isAnonymous: false,
			};

			const now = Date.now();
			const batch = db.batch();
			const sessions: ProvisionedSession[] = [];
			const gameSessionsPatch: Record<string, OdysseyIslandAgoraSession> = {};

			for (const island of toOpen) {
				const sessionId = getRandomUID();
				const questionText = statementText.get(island.statementId) || island.issue || island.title;

				const topicPackageId = `odyssey--${gameId}--${island.statementId}`;
				const topic = buildCivicTopicPackage({
					topicPackageId,
					creatorId: uid,
					island,
					questionText,
					leftStanceText: island.leftAnchorStanceId
						? statementText.get(island.leftAnchorStanceId)
						: undefined,
					rightStanceText: island.rightAnchorStanceId
						? statementText.get(island.rightAnchorStanceId)
						: undefined,
					now,
				});

				// A fresh tree, deliberately NOT the island's own question. Proposals
				// are `option` children of the challenge question, and Odyssey reads
				// an island's option children as its stances — hang them off the
				// island and every proposal would appear as a stance to rate.
				const rootStatement = createStatementObject({
					statement: island.title,
					statementType: StatementType.question,
					parentId: 'top',
					topParentId: 'top',
					creatorId: uid,
					creator,
					sourceApp: SourceApp.AGORA,
					agoraSessionId: sessionId,
				});
				if (!rootStatement) {
					throw new HttpsError('internal', 'Failed to build root statement');
				}

				const challengeStatement = createStatementObject({
					statement: questionText,
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

				const session: AgoraSession = {
					sessionId,
					code,
					topicPackageId,
					teacherId: uid,
					rootStatementId: rootStatement.statementId,
					challengeQuestionId: challengeStatement.statementId,
					deviceMode: AgoraDeviceMode.individual,
					teamSizeMax: AGORA_SESSION.TEAM_SIZE_MAX,
					sessionMode: AgoraSessionMode.civic,
					civic: {
						odysseyGameId: gameId,
						islandStatementId: island.statementId,
						...(island.leftAnchorStanceId ? { leftAnchorStanceId: island.leftAnchorStanceId } : {}),
						...(island.rightAnchorStanceId
							? { rightAnchorStanceId: island.rightAnchorStanceId }
							: {}),
					},
					// Straight into the square: there is no teacher here to walk the
					// room through framing, and no bell to end it. Leaving
					// lessonEndsAt unset is what keeps the sweep off these sessions.
					stage: AgoraStage.deliberation,
					roundNumber: 1,
					participantCount: 0,
					status: AgoraSessionStatus.open,
					createdAt: now,
					lastUpdate: now,
				};

				batch.set(db.collection(Collections.agoraTopicPackages).doc(topicPackageId), topic);
				batch.set(
					db.collection(Collections.statements).doc(rootStatement.statementId),
					rootStatement,
				);
				batch.set(
					db.collection(Collections.statements).doc(challengeStatement.statementId),
					challengeStatement,
				);
				batch.set(db.collection(Collections.agoraSessions).doc(sessionId), session);

				gameSessionsPatch[island.statementId] = {
					sessionId,
					code,
					topicPackageId,
					createdAt: now,
				};
				sessions.push({ islandStatementId: island.statementId, sessionId, code });
			}

			batch.update(gameRef, {
				agoraSessions: { ...openAlready, ...gameSessionsPatch },
				lastUpdate: now,
			});

			await batch.commit();

			return { sessions, alreadyOpen };
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'agora.provisionCivicSessions',
				userId: uid,
				metadata: { gameId },
			});
			throw new HttpsError('internal', 'Failed to open civic deliberations');
		}
	},
);
