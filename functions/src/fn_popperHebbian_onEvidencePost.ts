import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections } from 'delib-npm';
import { EvidenceType } from 'delib-npm/dist/models/evidence/evidenceModel';
import { getGeminiModel, geminiApiKey } from './config/gemini';

const EVIDENCE_WEIGHTS: Record<EvidenceType, number> = {
	[EvidenceType.data]: 3.0,       // Research, studies
	[EvidenceType.testimony]: 2.0,  // Expert testimony
	[EvidenceType.argument]: 1.0,   // Logical reasoning
	[EvidenceType.anecdote]: 0.5,   // Personal stories
	[EvidenceType.fallacy]: 0.1     // Flagged content
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

function calculateInitialWeight(evidenceType: EvidenceType): number {
	return EVIDENCE_WEIGHTS[evidenceType];
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
		const evidence = statement.evidence;

		if (!evidence) return;

		const support = evidence.support || 0;
		const weight = evidence.evidenceWeight || 1.0;

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
			// 1. Call AI to classify evidence type
			const evidenceType = await classifyEvidenceType(statement.statement);

			// 2. Calculate initial weight
			const weight = calculateInitialWeight(evidenceType);

			// 3. Update statement with classification and weight
			await snapshot.ref.update({
				'evidence.evidenceType': evidenceType,
				'evidence.evidenceWeight': weight
			});

			// 4. Trigger score recalculation for parent option
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
			const oldEvidenceType = beforeStatement.evidence?.evidenceType;

			// 1. Re-classify evidence type based on new content
			const newEvidenceType = await classifyEvidenceType(afterStatement.statement);

			// 2. Calculate new weight
			const newWeight = calculateInitialWeight(newEvidenceType);

			// 3. Update statement with new classification and weight
			await afterSnapshot.ref.update({
				'evidence.evidenceType': newEvidenceType,
				'evidence.evidenceWeight': newWeight,
				lastUpdate: Date.now()
			});

			// 4. Trigger score recalculation for parent option
			if (afterStatement.parentId) {
				await recalculateScore(afterStatement.parentId);
			}

			// Log the change for monitoring
			console.info('Evidence re-evaluated:', {
				statementId: afterStatement.statementId,
				oldType: oldEvidenceType,
				newType: newEvidenceType,
				oldWeight: beforeStatement.evidence?.evidenceWeight,
				newWeight
			});

		} catch (error) {
			console.error('Error re-evaluating evidence post:', error);
		}
	}
);
