/**
 * HTTP endpoint that produces an AI-ready strategic-report JSON for one
 * deliberation question. Wrapped by `wrapAdminHttpFunction` in index.ts so
 * the caller must present a valid Firebase ID token.
 *
 * Request body:
 *   { questionStatementId: string, consensusThreshold?: number,
 *     kAnonymity?: number, forceClustering?: boolean }
 */

import { Request, Response } from 'express';
import { logError } from './utils/errorHandling';
import { buildStrategicExport } from './strategicExport/builder';

const DEFAULT_CONSENSUS_THRESHOLD = 0.4;
const DEFAULT_K_ANONYMITY = 5;

export async function strategicExport(req: Request, res: Response): Promise<void> {
	try {
		const body = (req.body ?? {}) as {
			questionStatementId?: unknown;
			consensusThreshold?: unknown;
			kAnonymity?: unknown;
			forceClustering?: unknown;
		};

		const questionStatementId = body.questionStatementId;
		if (typeof questionStatementId !== 'string' || !questionStatementId) {
			res.status(400).send({
				ok: false,
				error: 'Invalid input: questionStatementId is required (string)',
			});

			return;
		}

		const consensusThreshold =
			typeof body.consensusThreshold === 'number' && Number.isFinite(body.consensusThreshold)
				? body.consensusThreshold
				: DEFAULT_CONSENSUS_THRESHOLD;
		const kAnonymity =
			typeof body.kAnonymity === 'number' && body.kAnonymity > 0
				? Math.floor(body.kAnonymity)
				: DEFAULT_K_ANONYMITY;
		const forceClustering = body.forceClustering === true;

		const exportResponse = await buildStrategicExport({
			questionStatementId,
			consensusThreshold,
			kAnonymity,
			forceClustering,
		});

		res.status(200).send({ ok: true, export: exportResponse });
	} catch (error) {
		logError(error, { operation: 'strategicExport.handler' });
		const message = error instanceof Error ? error.message : 'Unknown server error';
		// Surface validation/auth-style messages with 400 so the UI can show them.
		const isClientError =
			error instanceof Error &&
			(message.includes('Strategic export only works on questions') ||
				message.includes('Question statement not found'));
		res.status(isClientError ? 400 : 500).send({ ok: false, error: message });
	}
}
