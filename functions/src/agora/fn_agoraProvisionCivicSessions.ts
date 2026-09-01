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
	AgoraScene,
	AgoraDeviceMode,
	AgoraSceneKind,
	AgoraSession,
	AgoraSessionMode,
	AgoraSessionStatus,
	AgoraStage,
	AgoraTopicPackage,
	AgoraTopicStatus,
	OdysseyElder,
	OdysseyGame,
	OdysseyIsland,
	OdysseyIslandAgoraSession,
	SourceApp,
	AGORA_SESSION,
	resolveSessionFlow,
	scriptToFlow,
} from '@freedi/shared-types';
import type {
	ProvisionCivicSessionsRequest as Request,
	ProvisionCivicSessionsResponse as Result,
	ProvisionedCivicSession as ProvisionedSession,
} from '@freedi/shared-types';
import { logError } from '../utils/errorHandling';
import { generateUniqueCode } from './joinCodes';

/**
 * A civic session writes four docs; the game update is one more. Firestore
 * caps a batch at 500, so this keeps a whole provisioning run inside one
 * atomic commit — either every island opens or none does.
 */
const MAX_ISLANDS_PER_RUN = 100;

/**
 * The camp names. In a classroom these are the two sides of the era
 * ("royalists" / "jacobins") and they label the results board's axis, so they
 * have to stay short — a whole stance sentence would not fit under a chart.
 * The stance text itself goes on the character instead.
 */
const POLE_LABEL_LEFT = 'עמדה א׳';
const POLE_LABEL_RIGHT = 'עמדה ב׳';

/** Character names sit in chips; a whole stance sentence will not fit. */
const CHARACTER_NAME_MAX = 40;

function shorten(text: string, max: number): string {
	const clean = text.trim();

	return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * A civic deliberation has no historical characters to role-play — but the
 * topic-package schema is what every Agora load path reads, and it wants
 * exactly two. So the island's two anchor stances become the two "voices",
 * which is also what the camp scale is built from: the same two poles define
 * left and right.
 *
 * The stance text goes on the character and the short pole name on the scale,
 * not the other way round. The scale labels are camp names — they letter the
 * results board's axis — while the character name is what the fallback
 * positioning screen shows as "name (camp)". Putting the stance in both would
 * print it twice there and overflow the chart here.
 */
/**
 * The opening beat, when an event asks for one.
 *
 * A classroom package earns its framing from an AI-written era; a civic island
 * already carries the words a person needs before they start writing — the
 * opening line, the issue, the plain-language explanation. Building the scene
 * from those rather than generating anything keeps the organizer's own text on
 * the screen, and keeps this function free of an API call.
 */
export function buildCivicFramingScene(island: OdysseyIsland, questionText: string): AgoraScene {
	const body = [island.opening, island.shortExplain].map((part) => part?.trim()).filter(Boolean);

	return {
		sceneId: 'civic-framing',
		kind: AgoraSceneKind.intro,
		title: island.title,
		text: body.length ? body.join('\n\n') : island.issue || questionText,
		imageUrls: island.imageUrl ? [island.imageUrl] : [],
		dialogue: [],
	};
}

/**
 * An Odyssey elder as an askable Agora character. Its argument is the stance
 * it declared on THIS island, so the review prompt argues the island's actual
 * question; needs/values come from the persona. `isElder` keeps it off the
 * positioning scale (the two stance voices stay that) and puts it on the
 * ask-the-characters panel.
 */
function elderCharacter(
	elder: OdysseyElder,
	island: OdysseyIsland,
	stanceText: string | undefined,
): AgoraCharacter {
	return {
		characterId: `elder--${elder.elderId}`,
		name: elder.name,
		role: elder.role,
		...(elder.portraitUrl ? { portraitUrl: elder.portraitUrl } : {}),
		arguments: [
			...(stanceText ? [stanceText] : []),
			...(elder.challenges[island.statementId] ? [elder.challenges[island.statementId]] : []),
		],
		needs: elder.needs,
		values: elder.values,
		isElder: true,
	};
}

function buildCivicTopicPackage(params: {
	topicPackageId: string;
	creatorId: string;
	island: OdysseyIsland;
	questionText: string;
	leftStanceText?: string;
	rightStanceText?: string;
	elders: AgoraCharacter[];
	framing: boolean;
	now: number;
}): AgoraTopicPackage {
	const { topicPackageId, creatorId, island, questionText, elders, framing, now } = params;
	const leftStance = params.leftStanceText?.trim() || POLE_LABEL_LEFT;
	const rightStance = params.rightStanceText?.trim() || POLE_LABEL_RIGHT;

	const voice = (characterId: string, stance: string): AgoraCharacter => ({
		characterId,
		name: shorten(stance, CHARACTER_NAME_MAX),
		role: island.title,
		arguments: [stance],
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
		characters: [voice('left', leftStance), voice('right', rightStance), ...elders],
		positioningScale: {
			leftLabel: POLE_LABEL_LEFT,
			rightLabel: POLE_LABEL_RIGHT,
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
		scenes: framing ? [buildCivicFramingScene(island, questionText)] : [],
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

			// The organizer's script, projected once for the whole run. Resolving
			// it here too means the flags that steer provisioning (framing) read
			// from exactly the same fold the client will apply later.
			const flow = scriptToFlow(game.script);
			const resolved = resolveSessionFlow({ sessionMode: AgoraSessionMode.civic, flow });

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

			// The elders join the square only when the script asks for them.
			const activeElders = resolved.elders
				? (game.elders ?? [])
						.filter((elder) => elder.enabled)
						.sort((a, b) => a.sortOrder - b.sortOrder)
				: [];

			// The island's question text, its anchor stances and the elders'
			// declared stances all live on Statement docs — read them together
			// rather than per island.
			const statementIds = new Set<string>();
			for (const island of toOpen) {
				statementIds.add(island.statementId);
				if (island.leftAnchorStanceId) statementIds.add(island.leftAnchorStanceId);
				if (island.rightAnchorStanceId) statementIds.add(island.rightAnchorStanceId);
				for (const elder of activeElders) {
					const declared = elder.positions[island.statementId];
					if (declared) statementIds.add(declared);
				}
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
					elders: activeElders.map((elder) =>
						elderCharacter(
							elder,
							island,
							elder.positions[island.statementId]
								? statementText.get(elder.positions[island.statementId])
								: undefined,
						),
					),
					framing: resolved.framing,
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
					...(flow ? { flow } : {}),
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
