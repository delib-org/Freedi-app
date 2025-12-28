import { getFunctionsUrl } from '../config';
import { logError } from '@/utils/errorHandling';
import { logger } from '@/services/logger';
import { store } from '@/redux/store';

// ============================================================================
// Types for API responses
// ============================================================================

interface RoomCreated {
	roomId: string;
	roomNumber: number;
	participantCount: number;
}

interface SplitJoinedOptionResponse {
	success: boolean;
	settingsId: string;
	optionStatementId: string;
	optionTitle: string;
	totalRooms: number;
	totalParticipants: number;
	balanceScore: number;
	rooms: RoomCreated[];
	error?: string;
}

interface OptionExceedingMax {
	statementId: string;
	statement: string;
	joinedCount: number;
	maxMembers: number;
	excessCount: number;
}

interface GetOptionsExceedingMaxResponse {
	hasMaxLimit: boolean;
	maxJoinMembers?: number;
	totalOptions?: number;
	exceedingCount?: number;
	options: OptionExceedingMax[];
	message?: string;
	error?: string;
}

export interface SplitJoinedOptionParams {
	optionStatementId: string;
	parentStatementId: string;
	roomSize: number;
	scrambleByQuestions?: string[];
}

export interface SplitResult {
	success: boolean;
	settingsId: string;
	optionTitle: string;
	totalRooms: number;
	totalParticipants: number;
	balanceScore: number;
	rooms: RoomCreated[];
}

// ============================================================================
// Split Joined Option Functions
// ============================================================================

/**
 * Split joined members of an option into rooms
 * Uses demographic data for heterogeneous splitting if questions provided
 * @param params - Split parameters including optionStatementId, parentStatementId, roomSize
 * @returns Split result with room assignments
 */
export async function splitJoinedOption(
	params: SplitJoinedOptionParams
): Promise<SplitResult> {
	const { optionStatementId, parentStatementId, roomSize, scrambleByQuestions } = params;

	try {
		const creator = store.getState().creator.creator;
		if (!creator) {
			throw new Error('User not authenticated');
		}

		const baseUrl = getFunctionsUrl();
		const response = await fetch(`${baseUrl}/splitJoinedOption`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				optionStatementId,
				parentStatementId,
				roomSize,
				scrambleByQuestions: scrambleByQuestions || [],
				adminId: creator.uid,
				adminName: creator.displayName,
			}),
		});

		const data: SplitJoinedOptionResponse = await response.json();

		if (!data.success) {
			throw new Error(data.error || 'Failed to split joined option');
		}

		logger.info('Split joined option into rooms', {
			optionStatementId,
			totalRooms: data.totalRooms,
			totalParticipants: data.totalParticipants,
			balanceScore: data.balanceScore,
		});

		return {
			success: true,
			settingsId: data.settingsId,
			optionTitle: data.optionTitle,
			totalRooms: data.totalRooms,
			totalParticipants: data.totalParticipants,
			balanceScore: data.balanceScore,
			rooms: data.rooms,
		};
	} catch (error) {
		logError(error, {
			operation: 'splitJoinedOption.splitJoinedOption',
			statementId: optionStatementId,
			metadata: { parentStatementId, roomSize },
		});
		throw error;
	}
}

/**
 * Get options that exceed their maximum member limit
 * Used by admin to see which options need splitting
 * @param parentStatementId - The parent statement to check options for
 * @returns List of options exceeding max with their details
 */
export async function getOptionsExceedingMax(
	parentStatementId: string
): Promise<GetOptionsExceedingMaxResponse> {
	try {
		const baseUrl = getFunctionsUrl();
		const response = await fetch(
			`${baseUrl}/getOptionsExceedingMax?parentStatementId=${encodeURIComponent(parentStatementId)}`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json',
				},
			}
		);

		const data: GetOptionsExceedingMaxResponse = await response.json();

		if (data.error) {
			throw new Error(data.error);
		}

		logger.info('Got options exceeding max', {
			parentStatementId,
			hasMaxLimit: data.hasMaxLimit,
			exceedingCount: data.exceedingCount,
		});

		return data;
	} catch (error) {
		logError(error, {
			operation: 'splitJoinedOption.getOptionsExceedingMax',
			statementId: parentStatementId,
		});
		throw error;
	}
}
