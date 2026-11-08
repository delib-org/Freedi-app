import { logger } from 'firebase-functions';
import type { Request, Response } from 'firebase-functions/v1';
import { db } from '.';
import { Collections, StatementSubscription } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_HOURS = 24;
/** One week. The query reads every subscription updated in the window. */
const MAX_HOURS = 168;

/** The look-back window, defaulted when unusable and kept to 1..MAX_HOURS. */
export function resolveAnalysisHours(raw: unknown): number {
	const hours = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
	if (!Number.isFinite(hours) || hours === 0) return DEFAULT_HOURS;

	return Math.min(Math.max(hours, 1), MAX_HOURS);
}

/**
 * PHASE 4 FIX: Metrics Analysis Function
 *
 * This HTTP function analyzes subscription update patterns to detect cascade issues.
 *
 * Usage: GET https://your-region-your-project.cloudfunctions.net/analyzeSubscriptionPatterns?hours=24
 *
 * System admins only: exported through wrapAdminHttpFunction in index.ts.
 *
 * Query Parameters:
 * - hours: Number of hours to look back (default: 24, at most one week)
 * - statementId: Optional - analyze specific statement
 */
export async function analyzeSubscriptionPatterns(req: Request, res: Response): Promise<void> {
	try {
		// Parse query parameters
		const hours = resolveAnalysisHours(req.query.hours);
		const statementId = req.query.statementId as string | undefined;

		const timeWindow = Date.now() - hours * HOUR_MS;

		logger.info(`Analyzing subscription patterns for last ${hours} hours`);

		// Query subscriptions updated in the time window
		let query = db
			.collection(Collections.statementsSubscribe)
			.where('lastUpdate', '>=', timeWindow);

		if (statementId) {
			query = query.where('statementId', '==', statementId);
		}

		const subscriptionsSnapshot = await query.get();

		if (subscriptionsSnapshot.empty) {
			res.json({
				message: `No subscription updates found in last ${hours} hours`,
				timeWindow: new Date(timeWindow).toISOString(),
				total: 0,
			});

			return;
		}

		// Analyze patterns
		const subscriptions = subscriptionsSnapshot.docs.map(
			(doc) => doc.data() as StatementSubscription,
		);

		// Group by statement
		const byStatement = new Map<string, StatementSubscription[]>();
		subscriptions.forEach((sub) => {
			const subs = byStatement.get(sub.statementId) || [];
			subs.push(sub);
			byStatement.set(sub.statementId, subs);
		});

		// Calculate metrics
		const statementMetrics = Array.from(byStatement.entries()).map(([stmtId, subs]) => {
			const updates = subs.length;
			const waitingRoleCount = subs.filter((s) => s.role === 'waiting').length;
			const otherRoleCount = updates - waitingRoleCount;

			return {
				statementId: stmtId,
				statementTitle: subs[0].statement.statement,
				totalUpdates: updates,
				waitingRoleUpdates: waitingRoleCount,
				otherRoleUpdates: otherRoleCount,
				cascadeRatio: ((otherRoleCount / updates) * 100).toFixed(1) + '%',
			};
		});

		// Sort by most updates
		statementMetrics.sort((a, b) => b.totalUpdates - a.totalUpdates);

		// Overall metrics
		const totalUpdates = subscriptions.length;
		const waitingRoleUpdates = subscriptions.filter((s) => s.role === 'waiting').length;
		const metadataOnlyUpdates = totalUpdates - waitingRoleUpdates;

		const response = {
			timeWindow: {
				start: new Date(timeWindow).toISOString(),
				end: new Date().toISOString(),
				hours: hours,
			},
			overall: {
				totalSubscriptionUpdates: totalUpdates,
				waitingRoleUpdates: waitingRoleUpdates,
				likelyMetadataOnlyUpdates: metadataOnlyUpdates,
				cascadeRatio: ((metadataOnlyUpdates / totalUpdates) * 100).toFixed(1) + '%',
			},
			topStatements: statementMetrics.slice(0, 10),
			analysis: {
				healthStatus:
					metadataOnlyUpdates > totalUpdates * 0.5
						? '🔴 HIGH CASCADE DETECTED'
						: metadataOnlyUpdates > totalUpdates * 0.3
							? '🟡 MODERATE CASCADE'
							: '🟢 HEALTHY',
				recommendation:
					metadataOnlyUpdates > totalUpdates * 0.5
						? 'High cascade ratio detected. Verify Phase 1 fixes are deployed.'
						: 'Normal operation. Continue monitoring.',
			},
		};

		res.json(response);
	} catch (error) {
		logError(error, { operation: 'metrics.analyzeSubscriptionPatterns' });
		res.status(500).json({ error: 'Failed to analyze patterns' });
	}
}
