import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { ALLOWED_ORIGINS } from './config/cors';
import { covenantService } from './covenant/service';

export const covenantWorkflow = onCall(
	{
		region: 'me-west1',
		cors:
			process.env.FUNCTIONS_EMULATOR === 'true'
				? [...ALLOWED_ORIGINS, /^http:\/\/(localhost|127\.0\.0\.1):\d+$/]
				: [...ALLOWED_ORIGINS],
		maxInstances: 10,
	},
	async (request) => {
		if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in to work on the covenant.');

		return covenantService(request.auth.uid, request.data);
	},
);
