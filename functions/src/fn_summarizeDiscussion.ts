import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections, functionConfig } from '@freedi/shared-types';
import { getGeminiModel } from './config/gemini';
import { ALLOWED_ORIGINS } from './config/cors';
import { getParagraphsText } from './helpers';

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
	{
		region: functionConfig.region,
		cors: [...ALLOWED_ORIGINS]
	},
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
			.where('userId', '==', userId)
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
		// Note: Can't orderBy nested field evaluation.agreement in Firestore, so we sort in memory
		const selectedSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.where('isChosen', '==', true)
			.get();

		if (selectedSnapshot.empty) {
			throw new HttpsError(
				'failed-precondition',
				'No selected solutions to summarize. Please configure cutoff settings first.'
			);
		}

		// Sort by evaluation.agreement (fallback to consensus for legacy data)
		const sortedDocs = selectedSnapshot.docs
			.map(doc => doc.data() as Statement)
			.sort((a, b) => (b.evaluation?.agreement ?? b.consensus ?? 0) - (a.evaluation?.agreement ?? a.consensus ?? 0));

		const selectedSolutions: SelectedSolution[] = sortedDocs.map(s => {
			return {
				title: s.statement,
				description: getParagraphsText(s.paragraphs),
				// Use evaluation.agreement when available, fallback to consensus for legacy data
				consensus: s.evaluation?.agreement ?? s.consensus ?? 0,
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

		// 6. Call Gemini AI with retry logic for truncation
		try {
			const model = getGeminiModel();

			// Calculate appropriate token limit based on number of solutions
			// More solutions = need more tokens for complete summary
			const baseTokens = 4096;
			const tokensPerSolution = 100;
			const maxOutputTokens = Math.min(8192, baseTokens + (selectedSolutions.length * tokensPerSolution));

			let summaryText = '';
			let attempts = 0;
			const maxAttempts = 2;

			while (attempts < maxAttempts) {
				attempts++;

				const result = await model.generateContent({
					contents: [{ role: 'user', parts: [{ text: prompt }] }],
					generationConfig: {
						temperature: 0.4,
						maxOutputTokens,
					},
				});

				const response = result.response;

				// Check if response was truncated
				const finishReason = response.candidates?.[0]?.finishReason;
				if (finishReason && finishReason !== 'STOP') {
					console.warn(`Gemini response finished with reason: ${finishReason}`);
					if (finishReason === 'SAFETY') {
						throw new HttpsError('failed-precondition', 'Content was filtered by safety settings');
					}
					if (finishReason === 'MAX_TOKENS' && attempts < maxAttempts) {
						console.warn('Summary was truncated, retrying with condensed prompt...');
						// Continue to retry with higher token count (already at max, so this is best effort)
						continue;
					}
				}

				summaryText = response.text();

				// Check if summary ends mid-sentence (basic truncation detection)
				const trimmedText = summaryText.trim();
				const endsWithPunctuation = /[.!?؟。،:\n]$/.test(trimmedText);

				if (!endsWithPunctuation && trimmedText.length > 100 && attempts < maxAttempts) {
					console.warn('Summary appears truncated (no ending punctuation), retrying...');
					continue;
				}

				break; // Success - exit loop
			}

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

	// Format solutions with their content and metrics
	const solutionsText = solutions.map((s, i) => `
### Agreement ${i + 1}: ${s.title}
${s.description ? `**Details**: ${s.description}` : ''}
- Consensus Score: ${s.consensus.toFixed(2)} | ${s.numberOfEvaluators} voters
`).join('\n');

	// Determine agreement strength descriptions
	const topSolution = solutions[0];
	const agreementStrength = topSolution.consensus > 0.5 ? 'strong' :
		topSolution.consensus > 0.2 ? 'moderate' : 'emerging';

	return `You are writing an informative summary of a group decision for people who want to understand what was agreed upon.

## The Question Discussed
"${question.statement}"
${getParagraphsText(question.paragraphs) ? `Context: ${getParagraphsText(question.paragraphs)}` : ''}

## What the Group Agreed On
${totalParticipants} participants evaluated the proposals. The following ${solutions.length} solution(s) achieved consensus:
${solutionsText}

${adminPrompt ? `## Special Focus Requested\n${adminPrompt}\n` : ''}

## Your Task
Write a clear, informative summary in ${languageName} that helps readers understand:

1. **What was the question/challenge?** - Briefly explain what the group was trying to decide
2. **What did they agree on?** - Clearly state each agreed solution in plain language. The reader should understand exactly what was decided.
3. **How strong is the agreement?** - This discussion shows ${agreementStrength} consensus (top score: ${topSolution.consensus.toFixed(2)})
4. **Key takeaways** - What should someone know about this decision?

**Writing Style**:
- Write for someone who wasn't part of the discussion - they should fully understand the decisions
- Focus on the SUBSTANCE of what was agreed, not the process
- Use clear, accessible language - avoid jargon
- Be specific about what the group decided to do/believe/support
${solutions.length > 10
		? `- Since there are ${solutions.length} agreements, organize them by theme/category using headers
- For each category, summarize the key agreements briefly
- Aim for 400-600 words to cover all major decisions`
		: `- Keep it concise (150-300 words) but ensure all key agreements are clearly explained`}
- Use bullet points for multiple agreements
- If solutions have descriptions, incorporate that detail into your explanation
- **IMPORTANT: Complete the entire summary - do not stop mid-sentence or mid-section**

**Example of good summary style**:
Instead of: "Solution 1 achieved a consensus score of 0.65"
Write: "The group agreed to implement weekly team meetings, with strong support from participants"

Return ONLY the markdown summary text. Do not wrap in code blocks or JSON.`;
}
