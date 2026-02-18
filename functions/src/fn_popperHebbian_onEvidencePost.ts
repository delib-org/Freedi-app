import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections, functionConfig } from '@freedi/shared-types';
import { EvidenceType } from '@freedi/shared-types';
import { getGeminiModel } from './config/gemini';
import {
	calculateConsensusValid,
	determineStatus,
	updateHebbianScore,
	migrateCorroborationScore,
} from './helpers/consensusValidCalculator';

// Extended evidence interface with new corroborationScore field
// (until delib-npm is updated)
interface EvidenceWithCorroboration {
	evidenceType?: EvidenceType;
	support?: number;
	corroborationScore?: number; // NEW: 0-1 scale
	helpfulCount?: number;
	notHelpfulCount?: number;
	netScore?: number;
	evidenceWeight?: number;
}

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

async function classifyEvidenceType(evidenceText: string): Promise<EvidenceType> {
	try {
		const model = getGeminiModel();

		const prompt = `Classify this evidence into ONE of these types:
- data: Research, studies, statistics, verified facts
- testimony: Expert testimony, verified reports from authorities
- argument: Logical reasoning, deductive/inductive arguments
- anecdote: Personal experience, observations, stories
- fallacy: Logically flawed, off-topic, or misleading

Evidence: "${evidenceText}"

Respond with ONLY the type name (data, testimony, argument, anecdote, or fallacy).`;

		const result = await model.generateContent(prompt);
		const response = result.response.text().trim().toLowerCase();

		// Validate and return
		if (Object.values(EvidenceType).includes(response as EvidenceType)) {
			return response as EvidenceType;
		}

		// Default to argument if classification fails
		return EvidenceType.argument;
	} catch (error) {
		console.error('Error classifying evidence:', error);
		// Default to argument if AI fails

		return EvidenceType.argument;
	}
}

/**
 * Classify how much evidence corroborates or falsifies a statement
 * Returns 0-1 scale: 0=falsifies, 0.5=neutral, 1=corroborates
 */
async function classifyCorroborationScore(
	evidenceText: string,
	parentStatementText: string,
): Promise<number> {
	try {
		const model = getGeminiModel();

		const prompt = `Analyze whether this evidence corroborates or falsifies the statement.

Statement: "${parentStatementText}"

Evidence: "${evidenceText}"

Rate the evidence on a scale of 0 to 1:
- 0.0-0.2: Strongly falsifies the statement (provides counter-evidence)
- 0.2-0.4: Partially falsifies (challenges some aspects)
- 0.4-0.6: Neutral or irrelevant to the statement
- 0.6-0.8: Partially corroborates (supports some aspects)
- 0.8-1.0: Strongly corroborates (provides strong supporting evidence)

Respond with ONLY a single number between 0.0 and 1.0.`;

		const result = await model.generateContent(prompt);
		const response = result.response.text().trim();

		// Parse the number
		const corroborationScore = parseFloat(response);

		// Validate and clamp to [0, 1]
		if (isNaN(corroborationScore)) {
			console.error('AI returned invalid corroboration score:', response);

			return 0.5; // Default to neutral
		}

		// Ensure it's within bounds
		return Math.max(0.0, Math.min(1.0, corroborationScore));
	} catch (error) {
		console.error('Error classifying corroboration score:', error);
		// Default to neutral if AI fails

		return 0.5;
	}
}

/**
 * Calculate initial weight for new evidence (before any votes)
 * New evidence starts optimistically at its base weight:
 * - Data: 1.0 (highest credibility)
 * - Testimony: 0.7
 * - Argument: 0.4
 * - Anecdote: 0.2
 * - Fallacy: 0.1 (lowest credibility)
 *
 * As community votes come in, weight can move between -baseWeight and +baseWeight
 */
function calculateInitialWeight(evidenceType: EvidenceType): number {
	return EVIDENCE_WEIGHTS[evidenceType];
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
		const evidence = statement.evidence;

		if (!evidence) return;

		// Get corroboration score (with migration from old support field)
		const corroborationScore = migrateCorroborationScore(evidence);

		// Get weight (0-1) based on evidence type and votes
		const weight = evidence.evidenceWeight || 1.0;

		// Apply Popperian-Bayesian update
		hebbianScore = updateHebbianScore(hebbianScore, corroborationScore, weight);
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

export const onEvidencePostCreate = onDocumentCreated(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
	},
	async (event) => {
		const snapshot = event.data;
		if (!snapshot) {
			console.error('No data associated with the event');

			return;
		}

		const statement = snapshot.data() as Statement;

		// Only process statements with evidence field
		if (!statement.evidence) {
			return;
		}

		try {
			const db = getFirestore();

			// 1. Get parent statement to understand context
			let parentStatementText = '';
			if (statement.parentId) {
				const parentDoc = await db.collection(Collections.statements).doc(statement.parentId).get();
				if (parentDoc.exists) {
					const parentStatement = parentDoc.data() as Statement;
					parentStatementText = parentStatement.statement || '';
				}
			}

			// 2. Call AI to classify evidence type
			const evidenceType = await classifyEvidenceType(statement.statement);

			// 3. Call AI to classify corroboration score (0-1)
			const corroborationScore = await classifyCorroborationScore(
				statement.statement,
				parentStatementText,
			);

			// 4. Calculate initial weight
			const weight = calculateInitialWeight(evidenceType);

			// 5. Update statement with all classifications
			await snapshot.ref.update({
				'evidence.evidenceType': evidenceType,
				'evidence.evidenceWeight': weight,
				'evidence.corroborationScore': corroborationScore,
				// Keep support for backward compatibility (map 0-1 to -1 to 1)
				'evidence.support': corroborationScore * 2 - 1,
			});

			console.info('Evidence classified:', {
				statementId: statement.statementId,
				evidenceType,
				corroborationScore,
				initialWeight: weight,
			});

			// 6. Trigger score recalculation for parent option
			if (statement.parentId) {
				await recalculateScore(statement.parentId);
			}
		} catch (error) {
			console.error('Error processing evidence post:', error);
		}
	},
);

export const onEvidencePostUpdate = onDocumentUpdated(
	{
		document: `${Collections.statements}/{statementId}`,
		region: functionConfig.region,
	},
	async (event) => {
		const beforeSnapshot = event.data?.before;
		const afterSnapshot = event.data?.after;

		if (!beforeSnapshot || !afterSnapshot) {
			console.error('No data associated with the event');

			return;
		}

		const beforeStatement = beforeSnapshot.data() as Statement;
		const afterStatement = afterSnapshot.data() as Statement;

		// Only process if this is an evidence statement
		if (!afterStatement.evidence) {
			return;
		}

		// Check if the statement text or corroboration score changed
		const contentChanged = beforeStatement.statement !== afterStatement.statement;
		const beforeEvidence = beforeStatement.evidence as EvidenceWithCorroboration | undefined;
		const afterEvidence = afterStatement.evidence as EvidenceWithCorroboration | undefined;
		const corroborationChanged =
			beforeEvidence?.corroborationScore !== afterEvidence?.corroborationScore;

		if (!contentChanged && !corroborationChanged) {
			return;
		}

		try {
			const db = getFirestore();
			const oldEvidenceType = beforeEvidence?.evidenceType;
			const oldCorroborationScore = beforeEvidence?.corroborationScore;

			// 1. Get parent statement for context
			let parentStatementText = '';
			if (afterStatement.parentId) {
				const parentDoc = await db
					.collection(Collections.statements)
					.doc(afterStatement.parentId)
					.get();
				if (parentDoc.exists) {
					const parentStatement = parentDoc.data() as Statement;
					parentStatementText = parentStatement.statement || '';
				}
			}

			// 2. Re-classify evidence type based on new content
			const newEvidenceType = await classifyEvidenceType(afterStatement.statement);

			// 3. Re-classify corroboration score (0-1)
			const newCorroborationScore = await classifyCorroborationScore(
				afterStatement.statement,
				parentStatementText,
			);

			// 4. Calculate new weight
			const newWeight = calculateInitialWeight(newEvidenceType);

			// 5. Update statement with new classifications
			await afterSnapshot.ref.update({
				'evidence.evidenceType': newEvidenceType,
				'evidence.evidenceWeight': newWeight,
				'evidence.corroborationScore': newCorroborationScore,
				// Keep support for backward compatibility
				'evidence.support': newCorroborationScore * 2 - 1,
				lastUpdate: Date.now(),
			});

			// 6. Trigger score recalculation for parent option
			if (afterStatement.parentId) {
				await recalculateScore(afterStatement.parentId);
			}

			// Log the change for monitoring
			console.info('Evidence re-evaluated:', {
				statementId: afterStatement.statementId,
				oldType: oldEvidenceType,
				newType: newEvidenceType,
				oldWeight: beforeStatement.evidence?.evidenceWeight,
				newWeight,
				oldCorroborationScore,
				newCorroborationScore,
			});
		} catch (error) {
			console.error('Error re-evaluating evidence post:', error);
		}
	},
);
