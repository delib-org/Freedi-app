import { useAuthorization } from './useAuthorization';

/**
 * Event Control Center — facilitator authorization (Phase 1).
 *
 * The Event is a sidecar over the anchor `group` Statement, so "can this user
 * run this event?" bridges to the existing group authorization: admins and
 * creators of the group are facilitators. Later phases add an explicit
 * per-event facilitator capability list on the Event doc; this hook is the
 * single seam that will absorb that change without touching callers.
 */
export interface EventAuthorizationState {
	/** User may open the control center for this event. */
	canManage: boolean;
	/** User is a full admin/creator of the anchor group. */
	isAdmin: boolean;
	loading: boolean;
	/** Auth resolved and the user is not allowed to manage. */
	denied: boolean;
}

export function useEventAuthorization(eventId?: string): EventAuthorizationState {
	const { isAdmin, loading } = useAuthorization(eventId);

	const canManage = isAdmin;

	return {
		canManage,
		isAdmin,
		loading,
		denied: !loading && !canManage,
	};
}
