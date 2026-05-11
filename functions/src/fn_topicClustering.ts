/**
 * HTTP endpoint for the topic-cluster pipeline. Calls the same
 * runTopicClusterPipeline() core that functions/scripts/recluster.ts uses.
 *
 * Request body: { parentStatementId: string, opts?: { dryRun?, rebuildCache?, rebuildTaxonomy? } }
 */

import { Request, Response } from 'express';
import { runTopicClusterPipeline } from './services/topic-cluster';
import { logError } from './utils/errorHandling';
import type { RunOptions } from './services/topic-cluster/types';

export async function triggerTopicClusterPipeline(req: Request, res: Response): Promise<void> {
	try {
		const body = (req.body ?? {}) as {
			parentStatementId?: unknown;
			opts?: unknown;
		};
		const parentStatementId = body.parentStatementId;

		if (!parentStatementId || typeof parentStatementId !== 'string') {
			res.status(400).send({
				ok: false,
				error: 'Invalid input: parentStatementId is required (string)',
			});

			return;
		}

		// Normalize opts — accept only the documented flags, ignore anything else.
		const rawOpts = (body.opts ?? {}) as Record<string, unknown>;
		const opts: RunOptions = {
			dryRun: rawOpts.dryRun === true,
			rebuildCache: rawOpts.rebuildCache === true,
			rebuildTaxonomy: rawOpts.rebuildTaxonomy === true,
		};

		const summary = await runTopicClusterPipeline(parentStatementId, opts);
		res.status(200).send({ ok: true, summary });
	} catch (error) {
		logError(error, { operation: 'topicClustering.trigger' });
		res.status(500).send({
			ok: false,
			error: error instanceof Error ? error.message : 'Unknown server error',
		});
	}
}
