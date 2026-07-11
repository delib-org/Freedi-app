/**
 * HTTP endpoint that produces the privacy-preserving user-data export for one
 * deliberation question. Wrapped by `wrapAdminHttpFunction` in index.ts, so the
 * caller must present a valid Firebase ID token AND be a system admin.
 *
 * Doing this server-side (rather than in the browser) means the raw per-user
 * evaluations and demographic answers are read with the Admin SDK, aggregated,
 * and k-anonymity–suppressed before anything is returned — the un-anonymized
 * data never reaches the client.
 *
 * Request body:
 *   { statementId: string, kAnonymityThreshold?: number }
 */

import { Request, Response } from 'express';
import { logError } from './utils/errorHandling';
import { buildPrivacyExport } from './privacyExport/builder';

export async function privacyExport(req: Request, res: Response): Promise<void> {
	try {
		const body = (req.body ?? {}) as {
			statementId?: unknown;
			kAnonymityThreshold?: unknown;
		};

		const statementId = body.statementId;
		if (typeof statementId !== 'string' || !statementId) {
			res.status(400).send({
				ok: false,
				error: 'Invalid input: statementId is required (string)',
			});

			return;
		}

		const kAnonymityThreshold =
			typeof body.kAnonymityThreshold === 'number' && body.kAnonymityThreshold > 0
				? Math.floor(body.kAnonymityThreshold)
				: undefined;

		const exportData = await buildPrivacyExport({ statementId, kAnonymityThreshold });

		res.status(200).send({ ok: true, export: exportData });
	} catch (error) {
		logError(error, { operation: 'privacyExport.handler' });
		const message = error instanceof Error ? error.message : 'Unknown server error';
		const isClientError = error instanceof Error && message.includes('Parent statement not found');
		res.status(isClientError ? 400 : 500).send({ ok: false, error: message });
	}
}
