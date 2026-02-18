import { AppDispatch } from '@/redux/store';
import { User } from '@freedi/shared-types';
import {
	setLoading,
	setError,
	clearRoomSettings,
} from '@/redux/roomAssignment/roomAssignmentSlice';
import { logError } from '@/utils/errorHandling';
import { getRoomAssignmentDataForAdmin } from './getRoomAssignment';
import { APIEndPoint } from '@/controllers/general/apiEndpoint';

interface CreateRoomAssignmentsRequest {
	statementId: string;
	topParentId: string;
	roomSize: number;
	scrambleByQuestions: string[];
	adminId: string;
	adminName?: string;
}

interface CreateRoomAssignmentsResponse {
	success: boolean;
	settingsId: string;
	totalRooms: number;
	totalParticipants: number;
	balanceScore: number;
	error?: string;
}

interface NotifyParticipantsResponse {
	success: boolean;
	notified: number;
	message?: string;
	error?: string;
}

interface DeleteRoomAssignmentsResponse {
	success: boolean;
	deletedRooms: number;
	deletedParticipants: number;
	error?: string;
}

/**
 * Create room assignments by calling the cloud function
 */
export async function createRoomAssignments(
	statementId: string,
	topParentId: string,
	roomSize: number,
	scrambleByQuestions: string[],
	user: User,
	dispatch: AppDispatch,
): Promise<CreateRoomAssignmentsResponse | null> {
	try {
		dispatch(setLoading(true));
		dispatch(setError(null));

		const requestData: CreateRoomAssignmentsRequest = {
			statementId,
			topParentId,
			roomSize,
			scrambleByQuestions,
			adminId: user.uid,
			adminName: user.displayName,
		};

		const endpoint = APIEndPoint('createRoomAssignments', {});

		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify(requestData),
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Failed to create room assignments');
		}

		const result = (await response.json()) as CreateRoomAssignmentsResponse;

		// Refresh the admin data
		await getRoomAssignmentDataForAdmin(statementId, dispatch);

		dispatch(setLoading(false));

		return result;
	} catch (error) {
		logError(error, {
			operation: 'roomAssignment.createRoomAssignments',
			statementId,
			metadata: { roomSize, questionsCount: scrambleByQuestions.length },
		});
		dispatch(setError('Failed to create room assignments'));
		dispatch(setLoading(false));

		return null;
	}
}

/**
 * Notify all participants of their room assignments
 */
export async function notifyRoomParticipants(
	settingsId: string,
	dispatch: AppDispatch,
): Promise<NotifyParticipantsResponse | null> {
	try {
		dispatch(setLoading(true));
		dispatch(setError(null));

		const endpoint = APIEndPoint('notifyRoomParticipants', {});

		const response = await fetch(endpoint, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ settingsId }),
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Failed to notify participants');
		}

		const result = (await response.json()) as NotifyParticipantsResponse;

		dispatch(setLoading(false));

		return result;
	} catch (error) {
		logError(error, {
			operation: 'roomAssignment.notifyParticipants',
			metadata: { settingsId },
		});
		dispatch(setError('Failed to notify participants'));
		dispatch(setLoading(false));

		return null;
	}
}

/**
 * Delete room assignments
 */
export async function deleteRoomAssignments(
	settingsId: string,
	dispatch: AppDispatch,
): Promise<DeleteRoomAssignmentsResponse | null> {
	try {
		dispatch(setLoading(true));
		dispatch(setError(null));

		const endpoint = APIEndPoint('deleteRoomAssignments', {});

		const response = await fetch(endpoint, {
			method: 'DELETE',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ settingsId }),
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Failed to delete room assignments');
		}

		const result = (await response.json()) as DeleteRoomAssignmentsResponse;

		// Clear the redux state
		dispatch(clearRoomSettings());

		dispatch(setLoading(false));

		return result;
	} catch (error) {
		logError(error, {
			operation: 'roomAssignment.deleteRoomAssignments',
			metadata: { settingsId },
		});
		dispatch(setError('Failed to delete room assignments'));
		dispatch(setLoading(false));

		return null;
	}
}
