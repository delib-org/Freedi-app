import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections } from 'delib-npm';
import { EvidenceType } from 'delib-npm/dist/models/evidence/evidenceModel';

// Base weights now scaled to 0-1 range
// 1.0 = scientific/peer-reviewed data
// 0.1 = fallacious/unreliable
const EVIDENCE_WEIGHTS: Record<EvidenceType, number> = {
	[EvidenceType.data]: 1.0,        // Peer-reviewed research
	[EvidenceType.testimony]: 0.7,   // Expert testimony
	[EvidenceType.argument]: 0.4,    // Logical reasoning
	[EvidenceType.anecdote]: 0.2,    // Personal stories
	[EvidenceType.fallacy]: 0.1      // Flagged content
};

function calculatePostWeight(statement: Statement): number {
	const evidence = statement.evidence;
	if (!evidence?.evidenceType) return 0.4; // Default to argument weight

	const baseWeight = EVIDENCE_WEIGHTS[evidence.evidenceType];
	const rawNetScore = (evidence.helpfulCount || 0) - (evidence.notHelpfulCount || 0);

	// Normalize netScore to [-1, 1] using tanh
	// Dividing by 10 makes ±10 votes reach ~76% of max effect
	const normalizedNetScore = Math.tanh(rawNetScore / 10);

	// Translate from [-1, 1] to [0, 1]
	const voteMultiplier = (normalizedNetScore + 1) / 2;

	// Final weight: baseWeight * voteMultiplier
	// This gives range of [0, 1] where:
	// - baseWeight determines evidence type quality
	// - voteMultiplier determines community validation
	const finalWeight = baseWeight * voteMultiplier;

	// Ensure minimum weight to prevent complete dismissal
	return Math.max(0.01, finalWeight);
}

async function recalculateScore(statementId: string): Promise<void> {
	const db = getFirestore();

	// Get all evidence posts for this statement
	const evidencePostsSnapshot = await db
		.collection(Collections.statements)
		.where('parentId', '==', statementId)
		.where('evidence', '!=', null)
		.get();

	let totalScore = 0;

	evidencePostsSnapshot.forEach((doc) => {
		const statement = doc.data() as Statement;
		const weight = calculatePostWeight(statement);
		const support = statement.evidence?.support || 0;

		// Update the weight in the statement
		doc.ref.update({
			'evidence.evidenceWeight': weight
		});

		// Contribution = support (-1 to 1) * weight
		totalScore += support * weight;
	});

	// Determine status based on total score
	let status: 'looking-good' | 'under-discussion' | 'needs-fixing';

	if (totalScore > 2) {
		status = 'looking-good';
	} else if (totalScore < -2) {
		status = 'needs-fixing';
	} else {
		status = 'under-discussion';
	}

	// Update the parent statement with the score
	await db.collection(Collections.statements).doc(statementId).update({
		popperHebbianScore: {
			statementId,
			totalScore,
			status,
			lastCalculated: Date.now()
		}
	});
}

export const onVoteUpdate = onDocumentUpdated(
	{
		document: `${Collections.statements}/{statementId}`
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
					'evidence.netScore': netScore
				});

				// Recalculate parent statement score
				if (after.parentId) {
					await recalculateScore(after.parentId);
				}
			} catch (error) {
				console.error('Error updating vote scores:', error);
			}
		}
	}
);
