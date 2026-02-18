import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections, functionConfig } from '@freedi/shared-types';
import { EvidenceType } from '@freedi/shared-types';
import {
	calculateConsensusValid,
	determineStatus,
	updateHebbianScore,
	migrateCorroborationScore,
} from './helpers/consensusValidCalculator';

// Base weights now scaled to 0-1 range
// 1.0 = scientific/peer-reviewed data
// 0.1 = fallacious/unreliable
const EVIDENCE_WEIGHTS: Record<EvidenceType, number> = {
	[EvidenceType.data]: 1.0, // Peer-reviewed research
	[EvidenceType.testimony]: 0.7, // Expert testimony
	[EvidenceType.argument]: 0.4, // Logical reasoning
	[EvidenceType.anecdote]: 0.2, // Personal stories
	[EvidenceType.fallacy]: 0.1, // Flagged content
};

/**
 * Calculate evidence weight based on community voting
 * Returns value between -1 and 1:
 * - +1: Fully credible, high quality evidence
 * - 0: Neutral, no credibility
 * - -1: Discredited, harmful evidence (bad evidence actually hurts the position it claims to support)
 *
 * New evidence starts optimistically at +1.0, then moves toward community consensus.
 */
function calculatePostWeight(statement: Statement): number {
	const evidence = statement.evidence;
	if (!evidence?.evidenceType) return 0.0; // Default neutral if no type

	const baseWeight = EVIDENCE_WEIGHTS[evidence.evidenceType]; // 0 to 1
	const helpfulCount = evidence.helpfulCount || 0;
	const notHelpfulCount = evidence.notHelpfulCount || 0;
	const totalVotes = helpfulCount + notHelpfulCount;

	// New evidence starts optimistic: assume it's good until proven otherwise
	if (totalVotes === 0) {
		return baseWeight * 1.0; // Full credibility for new evidence
	}

	// Bayesian smoothing: add "virtual votes" to prevent wild swings from 1-2 votes
	// Optimistic prior: 75% helpful, 25% not helpful (3:1 ratio)
	const smoothing = 2;
	const smoothedHelpful = helpfulCount + smoothing * 0.75;
	const smoothedNotHelpful = notHelpfulCount + smoothing * 0.25;
	const smoothedTotal = smoothedHelpful + smoothedNotHelpful;

	// Calculate ratio of helpful votes (0 to 1)
	const helpfulRatio = smoothedHelpful / smoothedTotal;

	// Map ratio [0, 1] to vote credibility [-1, 1]
	// - ratio = 1.0 (all helpful) → voteCredibility = +1.0
	// - ratio = 0.5 (balanced) → voteCredibility = 0.0
	// - ratio = 0.0 (all not helpful) → voteCredibility = -1.0
	const voteCredibility = helpfulRatio * 2 - 1;

	// Combine evidence type quality with vote credibility
	// - baseWeight (0-1): How inherently reliable is this type of evidence?
	// - voteCredibility (-1 to 1): What does the community say?
	// Result: weight in range [-baseWeight, +baseWeight]
	const finalWeight = baseWeight * voteCredibility;

	// Clamp to valid range [-1, 1]
	return Math.max(-1.0, Math.min(1.0, finalWeight));
}

// Hebbian score constants
const PRIOR = 0.6; // Starting score (benefit of doubt)

async function recalculateScore(statementId: string): Promise<void> {
	const db = getFirestore();

	// Get the parent statement to access consensus
	const parentDoc = await db.collection(Collections.statements).doc(statementId).get();
	if (!parentDoc.exists) {
		console.error(`Parent statement ${statementId} not found`);

		return;
	}
	const parentStatement = parentDoc.data() as Statement;

	// Get all evidence posts for this statement
	const evidencePostsSnapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', statementId)
		.where('evidence', '!=', null)
		.get();

	const evidenceCount = evidencePostsSnapshot.size;

	// Start with prior (0.6) if no evidence
	let hebbianScore = PRIOR;

	// Apply multiplicative Popperian-Bayesian updates for each evidence post
	evidencePostsSnapshot.forEach((doc) => {
		const statement = doc.data() as Statement;

		// Calculate and update the weight based on votes
		const weight = calculatePostWeight(statement);
		doc.ref.update({
			'evidence.evidenceWeight': weight,
		});

		// Get corroboration score (with migration from old support field)
		const corroborationScore = migrateCorroborationScore(statement.evidence || {});

		// Apply Popperian-Bayesian update
		hebbianScore = updateHebbianScore(hebbianScore, corroborationScore, Math.abs(weight));
	});

	// Determine status based on hebbianScore (threshold at 0.6)
	const status = determineStatus(hebbianScore);

	// Create PopperHebbianScore object
	const popperHebbianScore = {
		statementId,
		hebbianScore,
		evidenceCount,
		status,
		lastCalculated: Date.now(),
		// Keep deprecated fields for backward compatibility
		totalScore: 0,
		corroborationLevel: hebbianScore,
	};

	// Calculate combined consensusValid score
	const consensus = parentStatement.consensus || 0;
	const consensusValid = calculateConsensusValid(consensus, popperHebbianScore);

	// Update the parent statement with both scores
	await db.collection(Collections.statements).doc(statementId).update({
		popperHebbianScore,
		consensusValid,
	});
}

export const onVoteUpdate = onDocumentUpdated(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
	},
	async (event) => {
		const before = event.data?.before.data() as Statement;
		const after = event.data?.after.data() as Statement;

		if (!before || !after) {
			return;
		}

		// Only process if this is an evidence post and votes changed
		if (!after.evidence) {
			return;
		}

		const votesChanged =
			before.evidence?.helpfulCount !== after.evidence?.helpfulCount ||
			before.evidence?.notHelpfulCount !== after.evidence?.notHelpfulCount;

		if (votesChanged) {
			try {
				// Update net score
				const netScore = (after.evidence.helpfulCount || 0) - (after.evidence.notHelpfulCount || 0);
				await event.data!.after.ref.update({
					'evidence.netScore': netScore,
				});

				// Recalculate parent statement score
				if (after.parentId) {
					await recalculateScore(after.parentId);
				}
			} catch (error) {
				console.error('Error updating vote scores:', error);
			}
		}
	},
);
