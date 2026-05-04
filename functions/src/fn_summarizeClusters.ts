/**
 * HTTP endpoint that summarizes every cluster of a Framing (or a subset, if
 * the caller passes opts.clusterIds). Each cluster's `brief` field is
 * overwritten with a 2–3 sentence LLM summary of its high-consensus members.
 *
 * Body: { parentId: string, framingId: string, opts?: { threshold?: number, clusterIds?: string[] } }
 */

import { Request, Response } from 'express';
import { summarizeFramingClusters } from './services/cluster-summary/summarize';
import { logError } from './utils/errorHandling';

export async function triggerSummarizeFramingClusters(req: Request, res: Response): Promise<void> {
	try {
		const body = (req.body ?? {}) as {
			parentId?: unknown;
			framingId?: unknown;
			opts?: unknown;
		};
		if (typeof body.parentId !== 'string' || !body.parentId) {
			res.status(400).send({ ok: false, error: 'parentId (string) is required' });

			return;
		}
		if (typeof body.framingId !== 'string' || !body.framingId) {
			res.status(400).send({ ok: false, error: 'framingId (string) is required' });

			return;
		}

		const rawOpts = (body.opts ?? {}) as Record<string, unknown>;
		const opts: { threshold?: number; clusterIds?: string[] } = {};
		if (typeof rawOpts.threshold === 'number') opts.threshold = rawOpts.threshold;
		if (Array.isArray(rawOpts.clusterIds)) {
			opts.clusterIds = rawOpts.clusterIds.filter((id): id is string => typeof id === 'string');
		}

		const result = await summarizeFramingClusters(body.parentId, body.framingId, opts);
		res.status(200).send({ ok: true, summary: result });
	} catch (error) {
		logError(error, { operation: 'summarizeFramingClusters.trigger' });
		res.status(500).send({
			ok: false,
			error: error instanceof Error ? error.message : 'Unknown server error',
		});
	}
}
