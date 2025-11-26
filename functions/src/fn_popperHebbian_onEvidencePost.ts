import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections } from 'delib-npm';
import { EvidenceType } from 'delib-npm/dist/models/evidence/evidenceModel';
import { getGeminiModel, geminiApiKey } from './config/gemini';
import {
	calculateCorroborationLevel,
	calculateConsensusValid,
	determineStatus
} from './helpers/consensusValidCalculator';

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

async function classifySupportLevel(evidenceText: string, parentStatementText: string): Promise<number> {
	try {
		const model = getGeminiModel();

		const prompt = `Analyze whether this evidence supports or challenges the following statement.

Statement: "${parentStatementText}"

Evidence: "${evidenceText}"

Determine if the evidence is:
- PRO (supports the statement): Return a value from 0.3 to 1.0
  - Strongly supports: 0.8 to 1.0
  - Moderately supports: 0.5 to 0.7
  - Slightly supports: 0.3 to 0.4
- NEUTRAL (neither clearly supports nor challenges): Return 0.0
- CON (challenges the statement): Return a value from -0.3 to -1.0
  - Slightly challenges: -0.3 to -0.4
  - Moderately challenges: -0.5 to -0.7
  - Strongly challenges: -0.8 to -1.0

Respond with ONLY a single number between -1.0 and 1.0 (e.g., 0.7, -0.5, 0.0).`;

		const result = await model.generateContent(prompt);
		const response = result.response.text().trim();

		// Parse the number
		const supportValue = parseFloat(response);

		// Validate and clamp to [-1, 1]
		if (isNaN(supportValue)) {
			console.error('AI returned invalid support value:', response);

			return 0.0; // Default to neutral
		}

		// Ensure it's within bounds
		return Math.max(-1.0, Math.min(1.0, supportValue));
	} catch (error) {
		console.error('Error classifying support level:', error);
		// Default to neutral if AI fails

		return 0.0;
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

	let totalScore = 0;

	evidencePostsSnapshot.forEach((doc) => {
		const statement = doc.data() as Statement;
		const evidence = statement.evidence;

		if (!evidence) return;

		const support = evidence.support || 0;
		const weight = evidence.evidenceWeight || 1.0;

		// Contribution = support (-1 to 1) * weight
		totalScore += support * weight;
	});

	// Calculate normalized corroboration level [0, 1]
	const evidenceCount = evidencePostsSnapshot.size;
	const corroborationLevel = calculateCorroborationLevel(totalScore, evidenceCount);

	// Determine status based on corroboration level
	const status = determineStatus(corroborationLevel);

	// Create PopperHebbianScore object
	const popperHebbianScore = {
		statementId,
		totalScore,
		corroborationLevel,
		evidenceCount,
		status,
		lastCalculated: Date.now()
	};

	// Calculate combined consensusValid score
	const consensus = parentStatement.consensus || 0;
	const consensusValid = calculateConsensusValid(consensus, popperHebbianScore);

	// Update the parent statement with both scores
	await db.collection(Collections.statements).doc(statementId).update({
		popperHebbianScore,
		consensusValid
	});
}

export const onEvidencePostCreate = onDocumentCreated(
	{
		document: `${Collections.statements}/{statementId}`,
		secrets: [geminiApiKey]
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

			// 3. Call AI to classify support level (pro/con/neutral)
			const supportLevel = await classifySupportLevel(statement.statement, parentStatementText);

			// 4. Calculate initial weight
			const weight = calculateInitialWeight(evidenceType);

			// 5. Update statement with all classifications
			await snapshot.ref.update({
				'evidence.evidenceType': evidenceType,
				'evidence.evidenceWeight': weight,
				'evidence.support': supportLevel
			});

			console.info('Evidence classified:', {
				statementId: statement.statementId,
				evidenceType,
				supportLevel,
				initialWeight: weight
			});

			// 6. Trigger score recalculation for parent option
			if (statement.parentId) {
				await recalculateScore(statement.parentId);
			}

		} catch (error) {
			console.error('Error processing evidence post:', error);
		}
	}
);

export const onEvidencePostUpdate = onDocumentUpdated(
	{
		document: `${Collections.statements}/{statementId}`,
		secrets: [geminiApiKey]
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

		// Check if the statement text or support level changed
		const contentChanged = beforeStatement.statement !== afterStatement.statement;
		const supportChanged = beforeStatement.evidence?.support !== afterStatement.evidence?.support;

		if (!contentChanged && !supportChanged) {
			return;
		}

		try {
			const db = getFirestore();
			const oldEvidenceType = beforeStatement.evidence?.evidenceType;
			const oldSupportLevel = beforeStatement.evidence?.support;

			// 1. Get parent statement for context
			let parentStatementText = '';
			if (afterStatement.parentId) {
				const parentDoc = await db.collection(Collections.statements).doc(afterStatement.parentId).get();
				if (parentDoc.exists) {
					const parentStatement = parentDoc.data() as Statement;
					parentStatementText = parentStatement.statement || '';
				}
			}

			// 2. Re-classify evidence type based on new content
			const newEvidenceType = await classifyEvidenceType(afterStatement.statement);

			// 3. Re-classify support level
			const newSupportLevel = await classifySupportLevel(afterStatement.statement, parentStatementText);

			// 4. Calculate new weight
			const newWeight = calculateInitialWeight(newEvidenceType);

			// 5. Update statement with new classifications
			await afterSnapshot.ref.update({
				'evidence.evidenceType': newEvidenceType,
				'evidence.evidenceWeight': newWeight,
				'evidence.support': newSupportLevel,
				lastUpdate: Date.now()
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
				oldSupport: oldSupportLevel,
				newSupport: newSupportLevel
			});

		} catch (error) {
			console.error('Error re-evaluating evidence post:', error);
		}
	}
);
