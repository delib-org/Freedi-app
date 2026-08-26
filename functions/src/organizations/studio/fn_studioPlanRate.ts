import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { StudioPlanRating, functionConfig } from '@freedi/shared-types';
import { getCallerIdentity } from '../orgInvites';
import { loadSessionForCaller } from './planSession';

export interface StudioPlanRateRequest {
	sessionId: string;
	value: 'up' | 'down';
	note?: string;
}

const NOTE_MAX = 500;

/** Learning loop: the admin's verdict on the AI plan after building it. */
export const fn_studioPlanRate = onCall(
	{ region: functionConfig.region },
	async (request: CallableRequest<StudioPlanRateRequest>): Promise<{ ok: true }> => {
		const caller = getCallerIdentity(request);
		const { sessionId, value, note } = request.data ?? {};
		if (value !== 'up' && value !== 'down') {
			throw new HttpsError('invalid-argument', 'value must be up or down');
		}
		const trimmedNote = typeof note === 'string' ? note.trim().slice(0, NOTE_MAX) : '';
		const { ref } = await loadSessionForCaller(sessionId, caller.uid);
		const now = Date.now();
		const rating: StudioPlanRating = { value, ratedAt: now };
		if (trimmedNote) rating.note = trimmedNote;
		await ref.update({ rating, lastUpdate: now });

		return { ok: true };
	},
);
