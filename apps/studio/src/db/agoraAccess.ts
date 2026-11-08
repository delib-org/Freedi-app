import { httpsCallable } from 'firebase/functions';
import type {
	ManageAccessRequest,
	ManageAccessResponse,
	AgoraAccessRole,
	AgoraAccessStatus,
} from '@freedi/shared-types';
import { functions } from '@/firebase';

/**
 * Typed wrappers for `agoraManageAccess` (me-west1), the approvers' door.
 * Admins and regional coordinators read and decide access requests ONLY
 * through this callable: the Firestore rules deny direct reads of
 * `agoraAccessRequests`, and applicant emails never leave the server except
 * in the rows it returns. Nothing here caches or stores those rows.
 */

type ListResponse = Extract<ManageAccessResponse, { action: 'list' }>;
type GetResponse = Extract<ManageAccessResponse, { action: 'get' }>;
type ApproveResponse = Extract<ManageAccessResponse, { action: 'approve' }>;
type DeclineResponse = Extract<ManageAccessResponse, { action: 'decline' }>;
type RemoveResponse = Extract<ManageAccessResponse, { action: 'remove' }>;

async function call(request: ManageAccessRequest): Promise<ManageAccessResponse> {
	const fn = httpsCallable<ManageAccessRequest, ManageAccessResponse>(
		functions,
		'agoraManageAccess',
	);
	const result = await fn(request);

	return result.data;
}

export async function listAccessRequests(
	status: AgoraAccessStatus = 'pending',
	schoolId?: string,
): Promise<ListResponse> {
	const data = await call({ action: 'list', status, ...(schoolId ? { schoolId } : {}) });

	return data as ListResponse;
}

export async function getAccessRequest(requestId: string): Promise<GetResponse> {
	return (await call({ action: 'get', requestId })) as GetResponse;
}

/** How many requests wait for the caller's decision (nav badges). */
export async function countAccessRequests(): Promise<number> {
	const data = await call({ action: 'count' });

	return data.action === 'count' ? data.pending : 0;
}

export interface ApproveAccessInput {
	requestId: string;
	/** Teacher request, admin only: the school to attach (overrides the request's). */
	schoolId?: string;
	/** Coordinator request, admin only: the schools to attach (at least one). */
	schoolIds?: string[];
}

export async function approveAccessRequest(input: ApproveAccessInput): Promise<ApproveResponse> {
	return (await call({ action: 'approve', ...input })) as ApproveResponse;
}

export async function declineAccessRequest(
	requestId: string,
	reason?: string,
): Promise<DeclineResponse> {
	return (await call({
		action: 'decline',
		requestId,
		...(reason ? { reason } : {}),
	})) as DeclineResponse;
}

export async function removeAccess(input: {
	uid: string;
	role: AgoraAccessRole;
	schoolId?: string;
}): Promise<RemoveResponse> {
	return (await call({ action: 'remove', ...input })) as RemoveResponse;
}
