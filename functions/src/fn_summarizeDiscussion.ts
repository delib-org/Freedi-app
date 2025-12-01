import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections } from 'delib-npm';
import { getGeminiModel, geminiApiKey } from './config/gemini';

interface SummarizeDiscussionRequest {
	statementId: string;
	adminPrompt?: string;
	language?: string;
}

interface SummarizeDiscussionResponse {
	summary: string;
	questionTitle: string;
	totalParticipants: number;
	solutionsCount: number;
	generatedAt: number;
}

interface SelectedSolution {
	title: string;
	description?: string;
	consensus: number;
	averageEvaluation: number;
	numberOfEvaluators: number;
}

const LANGUAGE_NAMES: Record<string, string> = {
	'he': 'Hebrew',
	'ar': 'Arabic',
	'en': 'English',
	'es': 'Spanish',
	'fr': 'French',
	'de': 'German',
	'nl': 'Dutch'
};

/**
 * Detects language from text based on character patterns
 */
function detectLanguage(text: string): string {
	if (/[\u0590-\u05FF]/.test(text)) return 'he'; // Hebrew
	if (/[\u0600-\u06FF]/.test(text)) return 'ar'; // Arabic

	return 'en'; // Default to English
}

/**
 * Firebase callable function to generate AI-powered summary of a discussion
 * including the question, total participants, and selected solutions with metrics.
 *
 * Only accessible by admins or creators of the statement.
 */
export const summarizeDiscussion = onCall<SummarizeDiscussionRequest>(
	{ secrets: [geminiApiKey] },
	async (request): Promise<SummarizeDiscussionResponse> => {
		const { statementId, adminPrompt, language } = request.data;
		const userId = request.auth?.uid;

		if (!userId) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		if (!statementId) {
			throw new HttpsError('invalid-argument', 'Statement ID is required');
		}

		const db = getFirestore();

		// 1. Fetch question statement
		const questionDoc = await db.collection(Collections.statements).doc(statementId).get();
		if (!questionDoc.exists) {
			throw new HttpsError('not-found', 'Statement not found');
		}
		const question = questionDoc.data() as Statement;

		// 2. Check permissions: creator or admin
		const isCreator = question.creatorId === userId;

		let isAdmin = false;
		const topParentId = question.topParentId || statementId;
		const membersSnapshot = await db
			.collection(Collections.statementsSubscribe)
			.where('statementId', '==', topParentId)
			.where('oderId', '==', userId)
			.where('role', 'in', ['admin', 'creator'])
			.limit(1)
			.get();
		isAdmin = !membersSnapshot.empty;

		if (!isCreator && !isAdmin) {
			throw new HttpsError(
				'permission-denied',
				'Only admins can generate summaries'
			);
		}

		// 3. Get total participants from parent evaluation
		const totalParticipants = question.evaluation?.asParentTotalEvaluators || 0;

		// 4. Get selected solutions (using isChosen flag set by cutoff logic)
		const selectedSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.where('isChosen', '==', true)
			.orderBy('consensus', 'desc')
			.get();

		if (selectedSnapshot.empty) {
			throw new HttpsError(
				'failed-precondition',
				'No selected solutions to summarize. Please configure cutoff settings first.'
			);
		}

		const selectedSolutions: SelectedSolution[] = selectedSnapshot.docs.map(doc => {
			const s = doc.data() as Statement;

			return {
				title: s.statement,
				description: s.description,
				consensus: s.consensus || s.evaluation?.agreement || 0,
				averageEvaluation: s.evaluation?.averageEvaluation || 0,
				numberOfEvaluators: s.evaluation?.numberOfEvaluators || 0
			};
		});

		// 5. Detect language and build prompt
		const detectedLang = language || detectLanguage(question.statement);
		const prompt = buildSummaryPrompt(
			question,
			selectedSolutions,
			totalParticipants,
			adminPrompt,
			detectedLang
		);

		// 6. Call Gemini AI
		try {
			const model = getGeminiModel();

			const result = await model.generateContent({
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				generationConfig: {
					temperature: 0.4,
					maxOutputTokens: 2048,
				},
			});

			const response = result.response;
			let summaryText = response.text();

			// Clean up any markdown code blocks if AI accidentally wrapped the response
			summaryText = summaryText
				.replace(/^```(?:markdown)?\s*/i, '')
				.replace(/```\s*$/i, '')
				.trim();

			// 7. Save summary to Firestore
			const generatedAt = Date.now();
			await db.collection(Collections.statements).doc(statementId).update({
				summary: summaryText,
				summaryGeneratedAt: generatedAt,
				lastUpdate: generatedAt
			});

			return {
				summary: summaryText,
				questionTitle: question.statement,
				totalParticipants,
				solutionsCount: selectedSolutions.length,
				generatedAt
			};
		} catch (error) {
			if (error instanceof HttpsError) {
				throw error;
			}
			console.error('Error generating discussion summary:', error);
			throw new HttpsError('internal', 'Failed to generate summary');
		}
	}
);

/**
 * Build the summary prompt for Gemini AI
 */
function buildSummaryPrompt(
	question: Statement,
	solutions: SelectedSolution[],
	totalParticipants: number,
	adminPrompt?: string,
	language: string = 'en'
): string {
	const languageName = LANGUAGE_NAMES[language] || 'English';

	// Format solutions with their metrics
	const solutionsText = solutions.map((s, i) => `
### Solution ${i + 1}: ${s.title}
${s.description ? `*${s.description}*` : ''}
- **Consensus Score**: ${s.consensus.toFixed(2)} (higher = stronger agreement)
- **Average Rating**: ${s.averageEvaluation.toFixed(2)} (scale: -1 to +1)
- **Voters**: ${s.numberOfEvaluators} participants evaluated this option
`).join('\n');

	return `You are a professional facilitator summarizing the outcomes of a democratic deliberation process.

## Context
**Question/Topic**: "${question.statement}"
${question.description ? `**Description**: ${question.description}` : ''}

**Participation**: ${totalParticipants} unique participants voted on the proposed solutions

## Selected Solutions (Ranked by Consensus)
These solutions passed the cutoff threshold and are ranked by their consensus score:
${solutionsText}

${adminPrompt ? `## Additional Instructions from Administrator\n${adminPrompt}\n` : ''}

## Your Task
Create a clear, professional summary in ${languageName} that includes:

1. **Overview**: Briefly state what question was addressed and the participation level
2. **Key Outcomes**: Summarize the top solutions and explain why they achieved consensus
3. **Consensus Analysis**: Note the strength of agreement using the actual scores
4. **Conclusion**: Summarize what the group decided

**Format Guidelines**:
- Use markdown formatting for structure (headers, bold, bullets)
- Be concise but informative (aim for 200-400 words)
- Use bullet points and headers for clarity
- Include actual numbers from the evaluation data
- Maintain a neutral, facilitative tone
- Do not add opinions or recommendations not supported by the data

**Important Notes about Scores**:
- Consensus Score uses a Mean-SEM formula: higher scores indicate both positive ratings AND statistical confidence
- A score above 0 indicates net positive agreement
- Number of voters shows how representative each solution's score is

Return ONLY the markdown summary text. Do not wrap in code blocks or JSON.`;
}
