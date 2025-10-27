import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections } from 'delib-npm';
import { EvidenceType } from 'delib-npm/dist/models/evidence/evidenceModel';

const EVIDENCE_WEIGHTS: Record<EvidenceType, number> = {
	[EvidenceType.data]: 3.0,
	[EvidenceType.testimony]: 2.0,
	[EvidenceType.argument]: 1.0,
	[EvidenceType.anecdote]: 0.5,
	[EvidenceType.fallacy]: 0.1
};

function calculatePostWeight(statement: Statement): number {
	const evidence = statement.evidence;
	if (!evidence?.evidenceType) return 1.0;

	const baseWeight = EVIDENCE_WEIGHTS[evidence.evidenceType];
	const netScore = (evidence.helpfulCount || 0) - (evidence.notHelpfulCount || 0);

	// Each net vote changes weight by 10%
	const multiplier = 1 + (netScore * 0.1);

	// Ensure weight never goes below 0.1
	return Math.max(0.1, baseWeight * multiplier);
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
