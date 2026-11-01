import { DemographicTag } from '@freedi/shared-types';

/**
 * Pure room-splitting logic for splitJoinedOption: no Firestore, so it can be
 * tested on its own.
 */

/** Fewest people an answer needs before it can become a room. */
export const MIN_PEOPLE_TO_SPLIT = 2;

export function hasEnoughPeopleToSplit(joinedCount: number): boolean {
	return joinedCount >= MIN_PEOPLE_TO_SPLIT;
}

export interface ParticipantWithDemographics {
	userId: string;
	userName: string;
	demographicKey: string;
	demographicTags: DemographicTag[];
	hasCompleteDemographics: boolean;
}

export interface ScrambleResult {
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
export function shuffleArray<T>(array: T[]): T[] {
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
export function createDemographicKey(tags: DemographicTag[], questionIds: string[]): string {
	const answers = questionIds.map((qId) => {
		const tag = tags.find((t) => t.questionId === qId);

		return tag?.answer || 'unknown';
	});

	return answers.join('|');
}

/**
 * Stratified Round-Robin Scrambling Algorithm
 * Distributes participants across rooms to maximize demographic diversity
 */
export function scrambleIntoRooms(
	participants: ParticipantWithDemographics[],
	roomSize: number,
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
	const completeProfiles = participants.filter((p) => p.hasCompleteDemographics);
	const incompleteProfiles = participants.filter((p) => !p.hasCompleteDemographics);

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
				room.participants.length < min.participants.length ? room : min,
			);
			targetRoom.participants.push(participant);
		}
	}

	// Assign incomplete profiles randomly to rooms with space
	const shuffledIncomplete = shuffleArray(incompleteProfiles);
	for (const participant of shuffledIncomplete) {
		// Find room with fewest participants that isn't full
		const availableRooms = rooms.filter((r) => r.participants.length < roomSize);
		if (availableRooms.length > 0) {
			const targetRoom = availableRooms.reduce((min, room) =>
				room.participants.length < min.participants.length ? room : min,
			);
			targetRoom.participants.push(participant);
		} else {
			// All rooms at capacity, add to room with fewest
			const targetRoom = rooms.reduce((min, room) =>
				room.participants.length < min.participants.length ? room : min,
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
	numDemographicGroups: number,
): number {
	if (rooms.length <= 1 || numDemographicGroups <= 1) return 1;

	// Calculate variance in room sizes
	const sizes = rooms.map((r) => r.participants.length);
	const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
	const variance = sizes.reduce((sum, size) => sum + Math.pow(size - avgSize, 2), 0) / sizes.length;

	// Normalize variance to a 0-1 score (lower variance = higher score)
	const maxVariance = Math.pow(avgSize, 2);
	const sizeScore = maxVariance > 0 ? 1 - variance / maxVariance : 1;

	return Math.max(0, Math.min(1, sizeScore));
}
