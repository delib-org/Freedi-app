import { httpsCallable } from 'firebase/functions';
import type {
	ManageSchoolRequest,
	ManageSchoolResponse,
	OpenClassRequest,
	OpenClassResponse,
} from '@freedi/shared-types';
import { functions } from '@/firebase';

/**
 * Typed wrappers for the Agora classroom-hierarchy callables (me-west1).
 * Wire shapes come from `@freedi/shared-types` — the same interfaces the
 * functions import, so drift is a compile error.
 */

export async function manageAgoraSchool(
	request: ManageSchoolRequest,
): Promise<ManageSchoolResponse> {
	const call = httpsCallable<ManageSchoolRequest, ManageSchoolResponse>(
		functions,
		'agoraAdminManageSchool',
	);
	const result = await call(request);

	return result.data;
}

export async function openAgoraClass(request: OpenClassRequest): Promise<OpenClassResponse> {
	const call = httpsCallable<OpenClassRequest, OpenClassResponse>(functions, 'agoraAdminOpenClass');
	const result = await call(request);

	return result.data;
}
