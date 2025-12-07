import { Request, Response } from 'firebase-functions/v1';
import { logger } from 'firebase-functions';
import {
	Collections,
	StatementSubscription,
	StatementSubscriptionSchema,
	UserDemographicQuestion,
	Role,
	getRandomUID,
	// Room assignment types from delib-npm 5.6.76
	RoomSettings,
	Room,
	RoomParticipant,
	DemographicTag,
} from 'delib-npm';
import { parse } from 'valibot';
import { db } from '.';
import { solveWithFallback, ILPParticipant as TSILPParticipant } from './ilpRoomSolver';

interface ParticipantWithDemographics {
	userId: string;
	userName: string;
	demographicKey: string;
	demographicTags: DemographicTag[];
	hasCompleteDemographics: boolean;
}

interface CreateRoomAssignmentsRequest {
	statementId: string;
	topParentId: string;
	roomSize: number;
	scrambleByQuestions: string[];
	adminId: string;
	adminName?: string;
}

interface ScrambleResult {
	rooms: Array<{
		roomNumber: number;
		participants: ParticipantWithDemographics[];
	}>;
	totalParticipants: number;
	totalRooms: number;
	balanceScore: number;
}

/**
 * Shuffles an array in place using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
	const shuffled = [...array];
	for (let i = shuffled.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
	}

	return shuffled;
}

/**
 * Creates a demographic key from participant's answers to selected questions
 */
function createDemographicKey(tags: DemographicTag[], questionIds: string[]): string {
	const answers = questionIds.map(qId => {
		const tag = tags.find(t => t.questionId === qId);

		return tag?.answer || 'unknown';
	});

	return answers.join('|');
}

/**
 * Stratified Round-Robin Scrambling Algorithm
 * Distributes participants across rooms to maximize demographic diversity
 */
function scrambleIntoRooms(
	participants: ParticipantWithDemographics[],
	roomSize: number
): ScrambleResult {
	if (participants.length === 0) {
		return {
			rooms: [],
			totalParticipants: 0,
			totalRooms: 0,
			balanceScore: 0,
		};
	}

	// Calculate number of rooms needed
	const totalRooms = Math.ceil(participants.length / roomSize);

	// Separate complete and incomplete demographic profiles
	const completeProfiles = participants.filter(p => p.hasCompleteDemographics);
	const incompleteProfiles = participants.filter(p => !p.hasCompleteDemographics);

	// Group participants by demographic combination
	const demographicGroups = new Map<string, ParticipantWithDemographics[]>();
	for (const participant of completeProfiles) {
		const key = participant.demographicKey;
		if (!demographicGroups.has(key)) {
			demographicGroups.set(key, []);
		}
		demographicGroups.get(key)!.push(participant);
	}

	// Shuffle each group internally for randomness
	for (const [key, group] of demographicGroups) {
		demographicGroups.set(key, shuffleArray(group));
	}

	// Initialize empty rooms
	const rooms: Array<{ roomNumber: number; participants: ParticipantWithDemographics[] }> = [];
	for (let i = 0; i < totalRooms; i++) {
		rooms.push({ roomNumber: i + 1, participants: [] });
	}

	// Distribute using round-robin from each demographic group
	const groupKeys = shuffleArray(Array.from(demographicGroups.keys()));

	for (const key of groupKeys) {
		const group = demographicGroups.get(key)!;
		for (const participant of group) {
			// Find room with fewest participants
			const targetRoom = rooms.reduce((min, room) =>
				room.participants.length < min.participants.length ? room : min
			);
			targetRoom.participants.push(participant);
		}
	}

	// Assign incomplete profiles randomly to rooms with space
	const shuffledIncomplete = shuffleArray(incompleteProfiles);
	for (const participant of shuffledIncomplete) {
		// Find room with fewest participants that isn't full
		const availableRooms = rooms.filter(r => r.participants.length < roomSize);
		if (availableRooms.length > 0) {
			const targetRoom = availableRooms.reduce((min, room) =>
				room.participants.length < min.participants.length ? room : min
			);
			targetRoom.participants.push(participant);
		} else {
			// All rooms at capacity, add to room with fewest
			const targetRoom = rooms.reduce((min, room) =>
				room.participants.length < min.participants.length ? room : min
			);
			targetRoom.participants.push(participant);
		}
	}

	// Calculate balance score (0-1, how evenly distributed demographics are)
	const balanceScore = calculateBalanceScore(rooms, demographicGroups.size);

	return {
		rooms,
		totalParticipants: participants.length,
		totalRooms,
		balanceScore,
	};
}

/**
 * Calculates how evenly demographics are distributed across rooms
 * Returns a score from 0 to 1, where 1 is perfectly balanced
 */
function calculateBalanceScore(
	rooms: Array<{ roomNumber: number; participants: ParticipantWithDemographics[] }>,
	numDemographicGroups: number
): number {
	if (rooms.length <= 1 || numDemographicGroups <= 1) return 1;

	// Calculate variance in room sizes
	const sizes = rooms.map(r => r.participants.length);
	const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
	const variance = sizes.reduce((sum, size) => sum + Math.pow(size - avgSize, 2), 0) / sizes.length;

	// Normalize variance to a 0-1 score (lower variance = higher score)
	const maxVariance = Math.pow(avgSize, 2);
	const sizeScore = maxVariance > 0 ? 1 - (variance / maxVariance) : 1;

	return Math.max(0, Math.min(1, sizeScore));
}

/**
 * HTTP endpoint to create room assignments
 */
export async function createRoomAssignments(req: Request, res: Response): Promise<void> {
	try {
		const {
			statementId,
			topParentId,
			roomSize,
			scrambleByQuestions,
			adminId,
			adminName,
		} = req.body as CreateRoomAssignmentsRequest;

		// Validate input
		if (!statementId || !topParentId || !roomSize || !adminId) {
			res.status(400).json({ error: 'Missing required fields' });

			return;
		}

		// Ensure scrambleByQuestions is an array (can be empty for random assignment)
		const questionsToScramble = scrambleByQuestions || [];

		if (roomSize < 2) {
			res.status(400).json({ error: 'Room size must be at least 2' });

			return;
		}

		// Note: questionsToScramble can be empty for simple random assignment
		const useRandomAssignment = questionsToScramble.length === 0;

		logger.info(`Creating room assignments for statement ${statementId} with room size ${roomSize}${useRandomAssignment ? ' (random assignment)' : ''}`);

		// 1. Get all participants (subscribers) for the statement
		const subscriptionsSnapshot = await db
			.collection(Collections.statementsSubscribe)
			.where('statement.statementId', '==', statementId)
			.where('role', 'in', [Role.member, Role.admin, Role.creator])
			.get();

		if (subscriptionsSnapshot.empty) {
			res.status(400).json({ error: 'No participants found for this statement' });

			return;
		}

		// Build participants list
		const participants: ParticipantWithDemographics[] = [];

		if (useRandomAssignment) {
			// Random assignment - no demographic data needed
			for (const doc of subscriptionsSnapshot.docs) {
				const subscription = parse(StatementSubscriptionSchema, doc.data()) as StatementSubscription;
				const userId = subscription.user.uid;
				const userName = subscription.user.displayName || 'Anonymous';

				participants.push({
					userId,
					userName,
					demographicKey: 'random',
					demographicTags: [],
					hasCompleteDemographics: false,
				});
			}
		} else {
			// 2. Get demographic questions
			const questionsSnapshot = await db
				.collection(Collections.userDemographicQuestions)
				.where('userQuestionId', 'in', questionsToScramble)
				.get();

			const questions = questionsSnapshot.docs.map(doc => doc.data() as UserDemographicQuestion);

			// 3. Get demographic answers for all participants
			const participantIds = subscriptionsSnapshot.docs.map(doc => {
				const sub = parse(StatementSubscriptionSchema, doc.data()) as StatementSubscription;

				return sub.user.uid;
			});

			// Query demographic answers - we need both group-level and statement-level
			const answersSnapshot = await db
				.collection(Collections.usersData)
				.where('userId', 'in', participantIds.slice(0, 30)) // Firestore limit
				.get();

			// Build a map of user answers
			const userAnswersMap = new Map<string, UserDemographicQuestion[]>();
			for (const doc of answersSnapshot.docs) {
				const answer = doc.data() as UserDemographicQuestion;
				const userId = answer.userId;
				if (userId) {
					if (!userAnswersMap.has(userId)) {
						userAnswersMap.set(userId, []);
					}
					userAnswersMap.get(userId)!.push(answer);
				}
			}

			// 4. Build participants with demographics
			for (const doc of subscriptionsSnapshot.docs) {
				const subscription = parse(StatementSubscriptionSchema, doc.data()) as StatementSubscription;
				const userId = subscription.user.uid;
				const userName = subscription.user.displayName || 'Anonymous';

				// Get user's demographic answers
				const userAnswers = userAnswersMap.get(userId) || [];

				// Build demographic tags for selected questions
				const demographicTags: DemographicTag[] = [];
				let hasAllAnswers = true;

				for (const questionId of questionsToScramble) {
					const answer = userAnswers.find(a => a.userQuestionId === questionId);
					const question = questions.find(q => q.userQuestionId === questionId);

					if (answer?.answer) {
						const option = question?.options?.find(o => o.option === answer.answer);
						demographicTags.push({
							questionId,
							questionText: question?.question || '',
							answer: answer.answer,
							color: option?.color,
						});
					} else {
						hasAllAnswers = false;
					}
				}

				const demographicKey = createDemographicKey(demographicTags, questionsToScramble);

				participants.push({
					userId,
					userName,
					demographicKey,
					demographicTags,
					hasCompleteDemographics: hasAllAnswers && demographicTags.length === questionsToScramble.length,
				});
			}
		}

		// 5. Run the scrambling algorithm
		const scrambleResult = scrambleIntoRooms(participants, roomSize);

		if (scrambleResult.totalRooms === 0) {
			res.status(400).json({ error: 'Could not create any rooms' });

			return;
		}

		// 6. Save to Firestore using batch
		const batch = db.batch();
		const settingsId = getRandomUID();
		const now = Date.now();

		// Create room settings document
		const roomSettings: RoomSettings = {
			settingsId,
			statementId,
			topParentId,
			roomSize,
			scrambleByQuestions: questionsToScramble,
			createdAt: now,
			lastUpdate: now,
			createdBy: { uid: adminId, displayName: adminName || 'Admin' },
			status: 'active',
			totalRooms: scrambleResult.totalRooms,
			totalParticipants: scrambleResult.totalParticipants,
			notificationSent: false,
		};

		batch.set(db.collection(Collections.roomsSettings).doc(settingsId), roomSettings);

		// Create room documents and participant documents
		for (const room of scrambleResult.rooms) {
			const roomId = getRandomUID();
			const roomDoc: Room = {
				roomId,
				settingsId,
				statementId,
				roomNumber: room.roomNumber,
				participants: room.participants.map(p => p.userId),
				createdAt: now,
			};

			batch.set(db.collection(Collections.rooms).doc(roomId), roomDoc);

			// Create participant documents
			for (const participant of room.participants) {
				const participantId = `${settingsId}--${participant.userId}`;
				const participantDoc: RoomParticipant = {
					participantId,
					settingsId,
					statementId,
					roomId,
					roomNumber: room.roomNumber,
					userId: participant.userId,
					userName: participant.userName,
					demographicTags: participant.demographicTags,
					assignedAt: now,
					notified: false,
				};

				batch.set(db.collection(Collections.roomParticipants).doc(participantId), participantDoc);
			}
		}

		await batch.commit();

		logger.info(`Created ${scrambleResult.totalRooms} rooms for ${scrambleResult.totalParticipants} participants`);

		res.status(200).json({
			success: true,
			settingsId,
			totalRooms: scrambleResult.totalRooms,
			totalParticipants: scrambleResult.totalParticipants,
			balanceScore: scrambleResult.balanceScore,
		});
	} catch (error) {
		logger.error('Error creating room assignments:', error);
		res.status(500).json({ error: 'Failed to create room assignments' });
	}
}

/**
 * HTTP endpoint to notify participants of their room assignments
 */
export async function notifyRoomParticipants(req: Request, res: Response): Promise<void> {
	try {
		const { settingsId } = req.body as { settingsId: string };

		if (!settingsId) {
			res.status(400).json({ error: 'Missing settingsId' });

			return;
		}

		logger.info(`Sending notifications for room settings ${settingsId}`);

		// Get room settings
		const settingsDoc = await db.collection(Collections.roomsSettings).doc(settingsId).get();
		if (!settingsDoc.exists) {
			res.status(404).json({ error: 'Room settings not found' });

			return;
		}

		// Get all participants who haven't been notified
		const participantsSnapshot = await db
			.collection(Collections.roomParticipants)
			.where('settingsId', '==', settingsId)
			.where('notified', '==', false)
			.get();

		if (participantsSnapshot.empty) {
			res.status(200).json({ message: 'All participants already notified', notified: 0 });

			return;
		}

		const batch = db.batch();
		const now = Date.now();

		// Create in-app notifications and mark participants as notified
		for (const doc of participantsSnapshot.docs) {
			const participant = doc.data() as RoomParticipant;

			// Create in-app notification
			const notificationId = getRandomUID();
			batch.set(db.collection(Collections.inAppNotifications).doc(notificationId), {
				notificationId,
				userId: participant.userId,
				type: 'room_assignment',
				title: 'Room Assignment',
				message: `You have been assigned to Room ${participant.roomNumber}`,
				statementId: participant.statementId,
				read: false,
				createdAt: now,
			});

			// Mark participant as notified
			batch.update(doc.ref, { notified: true });
		}

		// Update room settings
		batch.update(settingsDoc.ref, {
			notificationSent: true,
			notificationSentAt: now,
		});

		await batch.commit();

		logger.info(`Sent ${participantsSnapshot.size} notifications for room settings ${settingsId}`);

		res.status(200).json({
			success: true,
			notified: participantsSnapshot.size,
		});
	} catch (error) {
		logger.error('Error notifying room participants:', error);
		res.status(500).json({ error: 'Failed to notify participants' });
	}
}

/**
 * HTTP endpoint to get room assignments for a statement
 */
export async function getRoomAssignments(req: Request, res: Response): Promise<void> {
	try {
		const { statementId } = req.query as { statementId: string };

		if (!statementId) {
			res.status(400).json({ error: 'Missing statementId' });

			return;
		}

		// Get active room settings for this statement
		const settingsSnapshot = await db
			.collection(Collections.roomsSettings)
			.where('statementId', '==', statementId)
			.where('status', '==', 'active')
			.orderBy('createdAt', 'desc')
			.limit(1)
			.get();

		if (settingsSnapshot.empty) {
			res.status(200).json({ hasAssignments: false });

			return;
		}

		const settings = settingsSnapshot.docs[0].data() as RoomSettings;

		// Get rooms
		const roomsSnapshot = await db
			.collection(Collections.rooms)
			.where('settingsId', '==', settings.settingsId)
			.orderBy('roomNumber', 'asc')
			.get();

		const rooms = roomsSnapshot.docs.map(doc => doc.data() as Room);

		// Get participants
		const participantsSnapshot = await db
			.collection(Collections.roomParticipants)
			.where('settingsId', '==', settings.settingsId)
			.get();

		const participants = participantsSnapshot.docs.map(doc => doc.data() as RoomParticipant);

		res.status(200).json({
			hasAssignments: true,
			settings,
			rooms,
			participants,
		});
	} catch (error) {
		logger.error('Error getting room assignments:', error);
		res.status(500).json({ error: 'Failed to get room assignments' });
	}
}

/**
 * HTTP endpoint to get a user's room assignment
 */
export async function getMyRoomAssignment(req: Request, res: Response): Promise<void> {
	try {
		const { statementId, userId } = req.query as { statementId: string; userId: string };

		if (!statementId || !userId) {
			res.status(400).json({ error: 'Missing statementId or userId' });

			return;
		}

		// Get active room settings for this statement
		const settingsSnapshot = await db
			.collection(Collections.roomsSettings)
			.where('statementId', '==', statementId)
			.where('status', '==', 'active')
			.orderBy('createdAt', 'desc')
			.limit(1)
			.get();

		if (settingsSnapshot.empty) {
			res.status(200).json({ hasAssignment: false });

			return;
		}

		const settings = settingsSnapshot.docs[0].data() as RoomSettings;

		// Get user's assignment using composite ID
		const participantId = `${settings.settingsId}--${userId}`;
		const participantDoc = await db.collection(Collections.roomParticipants).doc(participantId).get();

		if (!participantDoc.exists) {
			res.status(200).json({ hasAssignment: false });

			return;
		}

		const assignment = participantDoc.data() as RoomParticipant;

		res.status(200).json({
			hasAssignment: true,
			assignment,
		});
	} catch (error) {
		logger.error('Error getting user room assignment:', error);
		res.status(500).json({ error: 'Failed to get room assignment' });
	}
}

/**
 * HTTP endpoint to delete room assignments
 */
export async function deleteRoomAssignments(req: Request, res: Response): Promise<void> {
	try {
		const { settingsId, adminId } = req.body as { settingsId: string; adminId: string };

		if (!settingsId || !adminId) {
			res.status(400).json({ error: 'Missing settingsId or adminId' });

			return;
		}

		logger.info(`Deleting room assignments ${settingsId}`);

		// Verify settings exist
		const settingsDoc = await db.collection(Collections.roomsSettings).doc(settingsId).get();
		if (!settingsDoc.exists) {
			res.status(404).json({ error: 'Room settings not found' });

			return;
		}

		// Delete all related documents using batch
		const batch = db.batch();

		// Delete rooms
		const roomsSnapshot = await db
			.collection(Collections.rooms)
			.where('settingsId', '==', settingsId)
			.get();

		for (const doc of roomsSnapshot.docs) {
			batch.delete(doc.ref);
		}

		// Delete participants
		const participantsSnapshot = await db
			.collection(Collections.roomParticipants)
			.where('settingsId', '==', settingsId)
			.get();

		for (const doc of participantsSnapshot.docs) {
			batch.delete(doc.ref);
		}

		// Update settings to archived (or delete)
		batch.update(settingsDoc.ref, { status: 'archived', lastUpdate: Date.now() });

		await batch.commit();

		logger.info(`Deleted room assignments ${settingsId}`);

		res.status(200).json({ success: true });
	} catch (error) {
		logger.error('Error deleting room assignments:', error);
		res.status(500).json({ error: 'Failed to delete room assignments' });
	}
}

// ============================================================================
// ILP-BASED ROOM ASSIGNMENT
// ============================================================================

interface JoinedParticipant {
	participantId: string;
	statementId: string;
	parentId: string;
	userId: string;
	userName: string;
	userPhoto?: string;
	spectrum: number;
	joinedAt: number;
}

interface ILPAssignmentRequest {
	questionId: string;
	minRoomSize: number;
	maxRoomSize: number;
	adminId: string;
	adminName?: string;
	useILP: boolean;
	optimizationWeights?: {
		satisfaction: number;
		heterogeneity: number;
		relaxationPenalty: number;
	};
}

interface ILPParticipant {
	user_id: string;
	user_name: string;
	spectrum: number;
	joined_options: string[];
}

interface ILPRoomResult {
	room_number: number;
	topic_id: string;
	participants: Array<{
		user_id: string;
		user_name: string;
		spectrum: number;
	}>;
	size: number;
	avg_spectrum: number;
}

interface ILPResponse {
	success: boolean;
	rooms: ILPRoomResult[];
	statistics: {
		total_participants: number;
		total_rooms: number;
		heterogeneity_score: number;
		satisfaction_score: number;
		avg_room_size: number;
		solver_status: string;
	};
	error?: string;
}

/**
 * HTTP endpoint to create room assignments using ILP solver
 * This fetches joined participants from the joinedParticipants collection,
 * calls the Python ILP service, and writes results to Firestore.
 */
export async function createILPRoomAssignments(req: Request, res: Response): Promise<void> {
	try {
		const {
			questionId,
			minRoomSize,
			maxRoomSize,
			adminId,
			adminName,
			useILP,
			optimizationWeights,
		} = req.body as ILPAssignmentRequest;

		// Validate input
		if (!questionId || !adminId) {
			res.status(400).json({ error: 'Missing required fields: questionId, adminId' });

			return;
		}

		const minSize = minRoomSize || 5;
		const maxSize = maxRoomSize || 7;

		if (minSize < 2 || minSize > maxSize) {
			res.status(400).json({ error: 'Invalid room size range' });

			return;
		}

		logger.info(`Creating ILP room assignments for question ${questionId}`);

		// 1. Get all child options (statements) under this question
		const optionsSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', questionId)
			.where('statementType', '==', 'option')
			.get();

		if (optionsSnapshot.empty) {
			res.status(400).json({ error: 'No options found under this question' });

			return;
		}

		const optionIds = optionsSnapshot.docs.map(doc => doc.id);
		const optionNames = new Map<string, string>();
		optionsSnapshot.docs.forEach(doc => {
			const data = doc.data();
			optionNames.set(doc.id, data.statement || 'Unnamed option');
		});

		// 2. Get joined participants from the joinedParticipants collection
		// Query for all participants who joined any of these options
		const joinedParticipants: JoinedParticipant[] = [];

		// Firestore 'in' query limited to 30 items, so we batch
		for (let i = 0; i < optionIds.length; i += 30) {
			const batch = optionIds.slice(i, i + 30);
			const participantsSnapshot = await db
				.collection('joinedParticipants')
				.where('statementId', 'in', batch)
				.get();

			participantsSnapshot.docs.forEach(doc => {
				joinedParticipants.push(doc.data() as JoinedParticipant);
			});
		}

		if (joinedParticipants.length === 0) {
			res.status(400).json({ error: 'No participants have joined any options' });

			return;
		}

		// 3. Group participants by user and collect their joined options
		const userParticipants = new Map<string, {
			userId: string;
			userName: string;
			spectrum: number;
			joinedOptions: string[];
		}>();

		for (const jp of joinedParticipants) {
			const existing = userParticipants.get(jp.userId);
			if (existing) {
				// User joined multiple options
				if (!existing.joinedOptions.includes(jp.statementId)) {
					existing.joinedOptions.push(jp.statementId);
				}
			} else {
				userParticipants.set(jp.userId, {
					userId: jp.userId,
					userName: jp.userName,
					spectrum: jp.spectrum,
					joinedOptions: [jp.statementId],
				});
			}
		}

		// Convert to TypeScript ILP format
		const tsIlpParticipants: TSILPParticipant[] = Array.from(userParticipants.values()).map(p => ({
			oderId: p.userId,
			odeName: p.userName,
			spectrum: p.spectrum,
			joinedOptions: p.joinedOptions,
		}));

		// Also keep legacy format for fallback
		const ilpParticipants: ILPParticipant[] = Array.from(userParticipants.values()).map(p => ({
			user_id: p.userId,
			user_name: p.userName,
			spectrum: p.spectrum,
			joined_options: p.joinedOptions,
		}));

		let ilpResult: ILPResponse;

		// 4. Call TypeScript ILP solver or fall back to simple scrambling
		if (useILP) {
			try {
				// Use local TypeScript ILP solver
				const tsResult = solveWithFallback(tsIlpParticipants, optionIds, {
					minRoomSize: minSize,
					maxRoomSize: maxSize,
					weights: optimizationWeights ? {
						satisfaction: optimizationWeights.satisfaction,
						heterogeneity: optimizationWeights.heterogeneity,
					} : undefined,
				});

				// Convert TypeScript result to expected format
				ilpResult = {
					success: tsResult.success,
					rooms: tsResult.rooms.map(r => ({
						room_number: r.roomNumber,
						topic_id: r.topicId,
						participants: r.participants.map(p => ({
							user_id: p.oderId,
							user_name: p.odeName,
							spectrum: p.spectrum,
						})),
						size: r.size,
						avg_spectrum: r.avgSpectrum,
					})),
					statistics: {
						total_participants: tsResult.statistics.totalParticipants,
						total_rooms: tsResult.statistics.totalRooms,
						heterogeneity_score: tsResult.statistics.heterogeneityScore,
						satisfaction_score: tsResult.statistics.satisfactionScore,
						avg_room_size: tsResult.statistics.avgRoomSize,
						solver_status: tsResult.statistics.solverStatus,
					},
					error: tsResult.error,
				};

				logger.info(`ILP solver completed with status: ${tsResult.statistics.solverStatus}`);
			} catch (ilpError) {
				logger.warn('ILP solver failed, falling back to simple scrambling:', ilpError);
				// Fall back to simple scrambling
				ilpResult = simpleScrambleAssignment(ilpParticipants, optionIds, minSize, maxSize);
			}
		} else {
			// Use simple scrambling directly
			ilpResult = simpleScrambleAssignment(ilpParticipants, optionIds, minSize, maxSize);
		}

		if (!ilpResult.success || ilpResult.rooms.length === 0) {
			res.status(400).json({
				error: ilpResult.error || 'Could not create any rooms',
				statistics: ilpResult.statistics,
			});

			return;
		}

		// 5. Save results to Firestore
		const batch = db.batch();
		const settingsId = getRandomUID();
		const now = Date.now();

		// Create room settings document
		const roomSettings: RoomSettings = {
			settingsId,
			statementId: questionId,
			topParentId: questionId, // Question is top parent for this context
			roomSize: Math.round(ilpResult.statistics.avg_room_size),
			scrambleByQuestions: [], // Not using demographic questions, using spectrum
			createdAt: now,
			lastUpdate: now,
			createdBy: { uid: adminId, displayName: adminName || 'Admin' },
			status: 'active',
			totalRooms: ilpResult.statistics.total_rooms,
			totalParticipants: ilpResult.statistics.total_participants,
			notificationSent: false,
		};

		batch.set(db.collection(Collections.roomsSettings).doc(settingsId), roomSettings);

		// Create room and participant documents
		for (const room of ilpResult.rooms) {
			const roomId = getRandomUID();
			const roomDoc: Room = {
				roomId,
				settingsId,
				statementId: room.topic_id, // The option this room discusses
				roomNumber: room.room_number,
				roomName: optionNames.get(room.topic_id),
				participants: room.participants.map(p => p.user_id),
				createdAt: now,
			};

			batch.set(db.collection(Collections.rooms).doc(roomId), roomDoc);

			// Create participant documents
			for (const participant of room.participants) {
				const participantId = `${settingsId}--${participant.user_id}`;
				const participantDoc: RoomParticipant = {
					participantId,
					settingsId,
					statementId: room.topic_id,
					roomId,
					roomNumber: room.room_number,
					userId: participant.user_id,
					userName: participant.user_name,
					demographicTags: [{
						questionId: 'spectrum',
						questionText: 'Spectrum Position',
						answer: String(participant.spectrum),
					}],
					assignedAt: now,
					notified: false,
				};

				batch.set(db.collection(Collections.roomParticipants).doc(participantId), participantDoc);
			}
		}

		await batch.commit();

		logger.info(`Created ${ilpResult.statistics.total_rooms} rooms for ${ilpResult.statistics.total_participants} participants using ${useILP ? 'ILP' : 'simple'} assignment`);

		res.status(200).json({
			success: true,
			settingsId,
			totalRooms: ilpResult.statistics.total_rooms,
			totalParticipants: ilpResult.statistics.total_participants,
			heterogeneityScore: ilpResult.statistics.heterogeneity_score,
			satisfactionScore: ilpResult.statistics.satisfaction_score,
			solverStatus: ilpResult.statistics.solver_status,
		});
	} catch (error) {
		logger.error('Error creating ILP room assignments:', error);
		res.status(500).json({ error: 'Failed to create room assignments' });
	}
}

/**
 * Simple scrambling fallback when ILP service is unavailable
 */
function simpleScrambleAssignment(
	participants: ILPParticipant[],
	options: string[],
	minSize: number,
	maxSize: number
): ILPResponse {
	if (participants.length === 0 || options.length === 0) {
		return {
			success: false,
			rooms: [],
			statistics: {
				total_participants: 0,
				total_rooms: 0,
				heterogeneity_score: 0,
				satisfaction_score: 0,
				avg_room_size: 0,
				solver_status: 'EMPTY_INPUT',
			},
			error: 'No participants or options',
		};
	}

	// Group participants by their first joined option
	const byOption = new Map<string, ILPParticipant[]>();
	for (const p of participants) {
		if (p.joined_options.length > 0) {
			const firstOption = p.joined_options[0];
			if (!byOption.has(firstOption)) {
				byOption.set(firstOption, []);
			}
			byOption.get(firstOption)!.push(p);
		}
	}

	// Calculate global average spectrum
	const globalAvg = participants.reduce((sum, p) => sum + p.spectrum, 0) / participants.length;

	// Create rooms for each option
	const rooms: ILPRoomResult[] = [];
	let roomNumber = 1;

	for (const [optionId, optParticipants] of byOption) {
		// Sort by spectrum for alternating distribution
		const sorted = [...optParticipants].sort((a, b) => a.spectrum - b.spectrum);

		// Calculate target room size
		const targetSize = Math.floor((minSize + maxSize) / 2);

		// Create rooms
		for (let i = 0; i < sorted.length; i += targetSize) {
			const roomParticipants = sorted.slice(i, i + targetSize);
			if (roomParticipants.length > 0) {
				const avgSpectrum = roomParticipants.reduce((sum, p) => sum + p.spectrum, 0) / roomParticipants.length;

				rooms.push({
					room_number: roomNumber++,
					topic_id: optionId,
					participants: roomParticipants.map(p => ({
						user_id: p.user_id,
						user_name: p.user_name,
						spectrum: p.spectrum,
					})),
					size: roomParticipants.length,
					avg_spectrum: Math.round(avgSpectrum * 100) / 100,
				});
			}
		}
	}

	// Calculate heterogeneity score
	const deviations = rooms.map(r => Math.abs(r.avg_spectrum - globalAvg));
	const avgDeviation = deviations.length > 0 ? deviations.reduce((a, b) => a + b, 0) / deviations.length : 0;
	const heterogeneityScore = Math.max(0, 1 - avgDeviation / 2);

	const totalAssigned = rooms.reduce((sum, r) => sum + r.size, 0);

	return {
		success: rooms.length > 0,
		rooms,
		statistics: {
			total_participants: totalAssigned,
			total_rooms: rooms.length,
			heterogeneity_score: Math.round(heterogeneityScore * 100) / 100,
			satisfaction_score: totalAssigned / participants.length,
			avg_room_size: rooms.length > 0 ? totalAssigned / rooms.length : 0,
			solver_status: 'SIMPLE_SCRAMBLE',
		},
	};
}
