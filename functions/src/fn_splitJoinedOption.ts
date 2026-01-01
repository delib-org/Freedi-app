import { Request, Response } from 'firebase-functions/v1';
import { logger } from 'firebase-functions';
import {
	Collections,
	Creator,
	UserDemographicQuestion,
	getRandomUID,
	RoomSettings,
	Room,
	RoomParticipant,
	DemographicTag,
} from '@freedi/shared-types';
import { db } from '.';

interface ParticipantWithDemographics {
	userId: string;
	userName: string;
	demographicKey: string;
	demographicTags: DemographicTag[];
	hasCompleteDemographics: boolean;
}

export interface SplitJoinedOptionRequest {
	optionStatementId: string;
	parentStatementId: string;
	roomSize: number;
	scrambleByQuestions?: string[];
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
 * Get all active room settings IDs for a parent statement
 * Used to find the highest room number across all options
 */
async function getActiveSettingsIdsForParent(parentStatementId: string): Promise<string[]> {
	const settingsSnapshot = await db
		.collection(Collections.roomsSettings)
		.where('topParentId', '==', parentStatementId)
		.where('status', '==', 'active')
		.get();

	if (settingsSnapshot.empty) {
		return ['__none__']; // Return dummy value for 'in' query (Firestore requires non-empty array)
	}

	return settingsSnapshot.docs.map(doc => doc.id);
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
 * HTTP endpoint to split joined members of an option into rooms
 * Uses the joined[] array from the option statement instead of subscriptions
 */
export async function splitJoinedOption(req: Request, res: Response): Promise<void> {
	try {
		const {
			optionStatementId,
			parentStatementId,
			roomSize,
			scrambleByQuestions,
			adminId,
			adminName,
		} = req.body as SplitJoinedOptionRequest;

		// Validate input
		if (!optionStatementId || !parentStatementId || !roomSize || !adminId) {
			res.status(400).json({ error: 'Missing required fields: optionStatementId, parentStatementId, roomSize, adminId' });

			return;
		}

		if (roomSize < 2) {
			res.status(400).json({ error: 'Room size must be at least 2' });

			return;
		}

		const questionsToScramble = scrambleByQuestions || [];
		const useRandomAssignment = questionsToScramble.length === 0;

		logger.info(`Splitting joined option ${optionStatementId} with room size ${roomSize}${useRandomAssignment ? ' (random assignment)' : ''}`);

		// 1. Get the option statement to access joined[] array
		const optionDoc = await db.collection(Collections.statements).doc(optionStatementId).get();

		if (!optionDoc.exists) {
			res.status(404).json({ error: 'Option statement not found' });

			return;
		}

		const optionData = optionDoc.data();
		const joinedMembers: Creator[] = optionData?.joined || [];

		if (joinedMembers.length === 0) {
			res.status(400).json({ error: 'No members have joined this option' });

			return;
		}

		if (joinedMembers.length < roomSize) {
			res.status(400).json({ error: `Not enough members to split. Need at least ${roomSize} members, have ${joinedMembers.length}` });

			return;
		}

		// Build participants list
		const participants: ParticipantWithDemographics[] = [];

		if (useRandomAssignment) {
			// Random assignment - no demographic data needed
			for (const member of joinedMembers) {
				participants.push({
					userId: member.uid,
					userName: member.displayName || 'Anonymous',
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

			// 3. Get demographic answers for all joined members
			const participantIds = joinedMembers.map(m => m.uid);

			// Query in batches of 30 (Firestore limit for 'in' queries)
			const userAnswersMap = new Map<string, UserDemographicQuestion[]>();

			for (let i = 0; i < participantIds.length; i += 30) {
				const batchIds = participantIds.slice(i, i + 30);
				const answersSnapshot = await db
					.collection(Collections.usersData)
					.where('userId', 'in', batchIds)
					.get();

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
			}

			// 4. Build participants with demographics
			for (const member of joinedMembers) {
				const userId = member.uid;
				const userName = member.displayName || 'Anonymous';

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

		// 6. Archive any existing active room settings for this option
		const existingSettingsSnapshot = await db
			.collection(Collections.roomsSettings)
			.where('statementId', '==', optionStatementId)
			.where('status', '==', 'active')
			.get();

		// 7. Find the highest room number used across all options for this parent
		// This ensures global room numbering (Room 1, 2 for Topic A, Room 3 for Topic B, etc.)
		const allRoomsSnapshot = await db
			.collection(Collections.rooms)
			.where('settingsId', 'in', await getActiveSettingsIdsForParent(parentStatementId))
			.get();

		let maxRoomNumber = 0;
		allRoomsSnapshot.docs.forEach(doc => {
			const roomNum = doc.data().roomNumber || 0;
			if (roomNum > maxRoomNumber) {
				maxRoomNumber = roomNum;
			}
		});

		logger.info(`Highest existing room number for parent ${parentStatementId}: ${maxRoomNumber}`);

		// 8. Save to Firestore using batch
		const batch = db.batch();
		const settingsId = getRandomUID();
		const now = Date.now();

		// Archive existing settings
		for (const doc of existingSettingsSnapshot.docs) {
			batch.update(doc.ref, { status: 'archived', lastUpdate: now });
			logger.info(`Archiving old room settings: ${doc.id}`);
		}

		// Create room settings document
		const roomSettings: RoomSettings = {
			settingsId,
			statementId: optionStatementId,
			topParentId: parentStatementId,
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
		// Apply global room number offset so room numbers continue across all options
		const roomsCreated: Array<{ roomId: string; roomNumber: number; participantCount: number }> = [];

		for (const room of scrambleResult.rooms) {
			const globalRoomNumber = room.roomNumber + maxRoomNumber; // Apply offset for global numbering
			const roomId = getRandomUID();
			const roomDoc: Room = {
				roomId,
				settingsId,
				statementId: optionStatementId,
				roomNumber: globalRoomNumber,
				participants: room.participants.map(p => p.userId),
				createdAt: now,
			};

			batch.set(db.collection(Collections.rooms).doc(roomId), roomDoc);

			roomsCreated.push({
				roomId,
				roomNumber: globalRoomNumber,
				participantCount: room.participants.length,
			});

			// Create participant documents
			for (const participant of room.participants) {
				const participantId = `${settingsId}--${participant.userId}`;
				const participantDoc: RoomParticipant = {
					participantId,
					settingsId,
					statementId: optionStatementId,
					roomId,
					roomNumber: globalRoomNumber,
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

		logger.info(`Created ${scrambleResult.totalRooms} rooms for ${scrambleResult.totalParticipants} joined members of option ${optionStatementId}`);

		res.status(200).json({
			success: true,
			settingsId,
			optionStatementId,
			optionTitle: optionData?.statement || '',
			totalRooms: scrambleResult.totalRooms,
			totalParticipants: scrambleResult.totalParticipants,
			balanceScore: scrambleResult.balanceScore,
			rooms: roomsCreated,
		});
	} catch (error) {
		logger.error('Error splitting joined option:', error);
		res.status(500).json({ error: 'Failed to split joined option' });
	}
}

/**
 * HTTP endpoint to get options that exceed their maximum member limit
 * Used by admin to see which options need splitting
 */
export async function getOptionsExceedingMax(req: Request, res: Response): Promise<void> {
	try {
		const { parentStatementId } = req.query as { parentStatementId: string };

		if (!parentStatementId) {
			res.status(400).json({ error: 'Missing parentStatementId' });

			return;
		}

		// Get parent statement to check maxJoinMembers setting
		const parentDoc = await db.collection(Collections.statements).doc(parentStatementId).get();

		if (!parentDoc.exists) {
			res.status(404).json({ error: 'Parent statement not found' });

			return;
		}

		const parentData = parentDoc.data();
		const maxJoinMembers = parentData?.statementSettings?.maxJoinMembers;

		if (!maxJoinMembers) {
			res.status(200).json({
				hasMaxLimit: false,
				message: 'No maximum members limit set on parent statement',
				options: []
			});

			return;
		}

		// Get all option statements under this parent
		const optionsSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', parentStatementId)
			.where('statementType', '==', 'option')
			.get();

		const exceedingOptions: Array<{
			statementId: string;
			statement: string;
			joinedCount: number;
			maxMembers: number;
			excessCount: number;
		}> = [];

		for (const doc of optionsSnapshot.docs) {
			const option = doc.data();
			const joinedCount = option.joined?.length || 0;

			if (joinedCount > maxJoinMembers) {
				exceedingOptions.push({
					statementId: option.statementId,
					statement: option.statement,
					joinedCount,
					maxMembers: maxJoinMembers,
					excessCount: joinedCount - maxJoinMembers,
				});
			}
		}

		res.status(200).json({
			hasMaxLimit: true,
			maxJoinMembers,
			totalOptions: optionsSnapshot.size,
			exceedingCount: exceedingOptions.length,
			options: exceedingOptions.sort((a, b) => b.excessCount - a.excessCount),
		});
	} catch (error) {
		logger.error('Error getting options exceeding max:', error);
		res.status(500).json({ error: 'Failed to get options exceeding max' });
	}
}

/**
 * HTTP endpoint to get all options with at least one joined member
 * Used by admin to see all options that can have rooms assigned
 */
export async function getAllOptionsWithMembers(req: Request, res: Response): Promise<void> {
	try {
		const { parentStatementId } = req.query as { parentStatementId: string };

		if (!parentStatementId) {
			res.status(400).json({ error: 'Missing parentStatementId' });

			return;
		}

		// Get parent statement to check settings
		const parentDoc = await db.collection(Collections.statements).doc(parentStatementId).get();

		if (!parentDoc.exists) {
			res.status(404).json({ error: 'Parent statement not found' });

			return;
		}

		const parentData = parentDoc.data();
		const maxJoinMembers = parentData?.statementSettings?.maxJoinMembers || 7;
		const minJoinMembers = parentData?.statementSettings?.minJoinMembers || 3;

		// Get all option statements under this parent
		const optionsSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', parentStatementId)
			.where('statementType', '==', 'option')
			.get();

		// Get existing room settings to check which options already have rooms
		const settingsSnapshot = await db
			.collection(Collections.roomsSettings)
			.where('topParentId', '==', parentStatementId)
			.where('status', '==', 'active')
			.get();

		const optionsWithActiveRooms = new Set<string>();
		settingsSnapshot.docs.forEach(doc => {
			optionsWithActiveRooms.add(doc.data().statementId);
		});

		const optionsWithMembers: Array<{
			statementId: string;
			statement: string;
			joinedCount: number;
			maxMembers: number;
			minMembers: number;
			hasActiveRooms: boolean;
		}> = [];

		for (const doc of optionsSnapshot.docs) {
			const option = doc.data();
			const joinedCount = option.joined?.length || 0;

			// Only include options with at least 1 member
			if (joinedCount > 0) {
				optionsWithMembers.push({
					statementId: option.statementId,
					statement: option.statement,
					joinedCount,
					maxMembers: maxJoinMembers,
					minMembers: minJoinMembers,
					hasActiveRooms: optionsWithActiveRooms.has(option.statementId),
				});
			}
		}

		res.status(200).json({
			maxJoinMembers,
			minJoinMembers,
			totalOptions: optionsSnapshot.size,
			optionsWithMembersCount: optionsWithMembers.length,
			options: optionsWithMembers.sort((a, b) => b.joinedCount - a.joinedCount),
		});
	} catch (error) {
		logger.error('Error getting all options with members:', error);
		res.status(500).json({ error: 'Failed to get options with members' });
	}
}

/**
 * HTTP endpoint to clear all rooms for a parent statement
 * Deletes all rooms, participants, and archives settings
 * Used before reassigning all rooms to start fresh with Room 1
 */
export async function clearAllRoomsForParent(req: Request, res: Response): Promise<void> {
	try {
		const { parentStatementId } = req.body as { parentStatementId: string };

		if (!parentStatementId) {
			res.status(400).json({ error: 'Missing parentStatementId' });

			return;
		}

		logger.info(`Clearing all rooms for parent: ${parentStatementId}`);

		// 1. Get all room settings for this parent
		const settingsSnapshot = await db
			.collection(Collections.roomsSettings)
			.where('topParentId', '==', parentStatementId)
			.get();

		if (settingsSnapshot.empty) {
			res.status(200).json({
				success: true,
				message: 'No rooms to clear',
				deletedSettings: 0,
				deletedRooms: 0,
				deletedParticipants: 0,
			});

			return;
		}

		const settingsIds = settingsSnapshot.docs.map(doc => doc.id);
		logger.info(`Found ${settingsIds.length} room settings to clear`);

		// 2. Delete all rooms for these settings
		let deletedRooms = 0;
		for (const settingsId of settingsIds) {
			const roomsSnapshot = await db
				.collection(Collections.rooms)
				.where('settingsId', '==', settingsId)
				.get();

			const batch = db.batch();
			roomsSnapshot.docs.forEach(doc => {
				batch.delete(doc.ref);
				deletedRooms++;
			});

			if (!roomsSnapshot.empty) {
				await batch.commit();
			}
		}

		// 3. Delete all participants for these settings
		let deletedParticipants = 0;
		for (const settingsId of settingsIds) {
			const participantsSnapshot = await db
				.collection(Collections.roomParticipants)
				.where('settingsId', '==', settingsId)
				.get();

			const batch = db.batch();
			participantsSnapshot.docs.forEach(doc => {
				batch.delete(doc.ref);
				deletedParticipants++;
			});

			if (!participantsSnapshot.empty) {
				await batch.commit();
			}
		}

		// 4. Delete all room settings
		const settingsBatch = db.batch();
		settingsSnapshot.docs.forEach(doc => {
			settingsBatch.delete(doc.ref);
		});
		await settingsBatch.commit();

		logger.info(`Cleared: ${settingsSnapshot.size} settings, ${deletedRooms} rooms, ${deletedParticipants} participants`);

		res.status(200).json({
			success: true,
			deletedSettings: settingsSnapshot.size,
			deletedRooms,
			deletedParticipants,
		});
	} catch (error) {
		logger.error('Error clearing rooms for parent:', error);
		res.status(500).json({ error: 'Failed to clear rooms' });
	}
}

/**
 * HTTP endpoint to clean up duplicate room settings
 * Keeps only the most recent active setting per option, archives the rest
 */
export async function cleanupDuplicateRoomSettings(req: Request, res: Response): Promise<void> {
	try {
		const { topParentId } = req.query as { topParentId: string };

		if (!topParentId) {
			res.status(400).json({ error: 'Missing topParentId' });
			return;
		}

		logger.info(`Cleaning up duplicate room settings for topParentId: ${topParentId}`);

		// Get all room settings for this parent
		const settingsSnapshot = await db
			.collection(Collections.roomsSettings)
			.where('topParentId', '==', topParentId)
			.get();

		if (settingsSnapshot.empty) {
			res.status(200).json({ message: 'No room settings found', cleaned: 0 });
			return;
		}

		// Group by option (statementId) and find duplicates
		const settingsByOption = new Map<string, Array<{ id: string; createdAt: number; status: string }>>();

		for (const doc of settingsSnapshot.docs) {
			const data = doc.data();
			const optionId = data.statementId;

			if (!settingsByOption.has(optionId)) {
				settingsByOption.set(optionId, []);
			}
			settingsByOption.get(optionId)!.push({
				id: doc.id,
				createdAt: data.createdAt || 0,
				status: data.status || 'active',
			});
		}

		// Archive duplicates (keep only the most recent per option)
		const batch = db.batch();
		let archivedCount = 0;
		const now = Date.now();

		for (const [optionId, settings] of settingsByOption) {
			// Sort by createdAt descending (most recent first)
			settings.sort((a, b) => b.createdAt - a.createdAt);

			// Archive all except the most recent
			for (let i = 1; i < settings.length; i++) {
				const setting = settings[i];
				if (setting.status === 'active') {
					batch.update(db.collection(Collections.roomsSettings).doc(setting.id), {
						status: 'archived',
						lastUpdate: now,
					});
					archivedCount++;
					logger.info(`Archiving duplicate setting ${setting.id} for option ${optionId}`);
				}
			}
		}

		if (archivedCount > 0) {
			await batch.commit();
		}

		res.status(200).json({
			message: `Cleanup complete`,
			totalSettings: settingsSnapshot.size,
			optionsWithSettings: settingsByOption.size,
			archivedCount,
		});
	} catch (error) {
		logger.error('Error cleaning up room settings:', error);
		res.status(500).json({ error: 'Failed to cleanup room settings' });
	}
}
