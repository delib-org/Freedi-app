import { onCall } from 'firebase-functions/v2/https';
import { functionConfig, type ThemeRebuildResponse } from '@freedi/shared-types';
import { ALLOWED_ORIGINS } from '../../config/cors';
import { handleRebuildThemes } from './rebuildThemes';

/**
 * Admin "Re-theme with AI" callable. Contract: `ThemeRebuildRequest` /
 * `ThemeRebuildPreviewResponse` / `ThemeRebuildApplyResponse` in shared-types.
 */
export const rebuildThemes = onCall(
	{
		timeoutSeconds: 540,
		memory: '512MiB',
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<ThemeRebuildResponse> =>
		handleRebuildThemes(request.auth?.uid, request.data),
);
