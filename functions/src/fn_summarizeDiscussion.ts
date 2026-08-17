import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';
import { Statement, StatementType, Collections, functionConfig } from '@freedi/shared-types';
import { getGeminiModel, getGenAI, LLM_MODEL_HEAVY } from './config/gemini';
import { ALLOWED_ORIGINS } from './config/cors';
import { getParagraphsText } from './helpers';
import { logError } from './utils/errorHandling';

interface SummarizeDiscussionRequest {
	statementId: string;
	adminPrompt?: string;
	language?: string;
	/**
	 * When true, the summary is built from the answers (above-cutoff options)
	 * of the question AND all its sub-questions, up to 2 levels deep, and is
	 * generated with the heavy reasoning model.
	 */
	includeSubQuestions?: boolean;
}

interface SummarizeDiscussionResponse {
	summary: string;
	questionTitle: string;
	totalParticipants: number;
	solutionsCount: number;
	subQuestionsCount: number;
	generatedAt: number;
}

interface SelectedSolution {
	title: string;
	description?: string;
	consensus: number;
	averageEvaluation: number;
	numberOfEvaluators: number;
}

/** A question with its above-cutoff answers and nested sub-questions. */
export interface QuestionNode {
	statement: Statement;
	solutions: SelectedSolution[];
	children: QuestionNode[];
}

/** Sub-questions are gathered up to this many levels below the root question. */
const MAX_SUB_QUESTION_DEPTH = 2;

const LANGUAGE_NAMES: Record<string, string> = {
	he: 'Hebrew',
	ar: 'Arabic',
	en: 'English',
	es: 'Spanish',
	fr: 'French',
	de: 'German',
	nl: 'Dutch',
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
		cors: [...ALLOWED_ORIGINS],
	},
	async (request): Promise<SummarizeDiscussionResponse> => {
		const { statementId, adminPrompt, language, includeSubQuestions } = request.data;
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
			throw new HttpsError('permission-denied', 'Only admins can generate summaries');
		}

		// 3. Get total participants from parent evaluation
		const totalParticipants = question.evaluation?.asParentTotalEvaluators || 0;

		// 4. Gather the question tree with its above-cutoff answers.
		// Each question's answers are the child options flagged isChosen by the
		// cutoff logic (which applies that question's own resultsSettings).
		const maxDepth = includeSubQuestions === true ? MAX_SUB_QUESTION_DEPTH : 0;
		const tree = await buildQuestionTree(question, 0, maxDepth);

		const totalSolutions = countSolutions(tree);
		const subQuestionsCount = countSubQuestions(tree);

		if (totalSolutions === 0) {
			throw new HttpsError(
				'failed-precondition',
				includeSubQuestions
					? 'No selected solutions to summarize in this question or its sub-questions. Please configure cutoff settings first.'
					: 'No selected solutions to summarize. Please configure cutoff settings first.',
			);
		}

		// 5. Detect language and build prompt
		const detectedLang = language || detectLanguage(question.statement);
		const useDeepSummary = maxDepth > 0 && subQuestionsCount > 0;
		const prompt = useDeepSummary
			? buildTreeSummaryPrompt(tree, totalParticipants, adminPrompt, detectedLang)
			: buildSummaryPrompt(question, tree.solutions, totalParticipants, adminPrompt, detectedLang);

		// 6. Call the LLM with retry logic for truncation.
		// Deep (sub-question) summaries are an integration/synthesis task, so they
		// run on the heavy reasoning model; flat summaries stay on the fast tier.
		try {
			const model = useDeepSummary
				? getGenAI().getGenerativeModel({ model: LLM_MODEL_HEAVY })
				: getGeminiModel();

			// Calculate appropriate token limit based on number of solutions
			// More solutions = need more tokens for complete summary
			const baseTokens = 4096;
			const tokensPerSolution = 100;
			const maxOutputTokens = Math.min(8192, baseTokens + totalSolutions * tokensPerSolution);

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
					logger.warn(`Gemini response finished with reason: ${finishReason}`);
					if (finishReason === 'SAFETY') {
						throw new HttpsError('failed-precondition', 'Content was filtered by safety settings');
					}
					if (finishReason === 'MAX_TOKENS' && attempts < maxAttempts) {
						logger.warn('Summary was truncated, retrying with condensed prompt...');
						// Continue to retry with higher token count (already at max, so this is best effort)
						continue;
					}
				}

				summaryText = response.text();

				// Check if summary ends mid-sentence (basic truncation detection)
				const trimmedText = summaryText.trim();
				const endsWithPunctuation = /[.!?؟。،:\n]$/.test(trimmedText);

				if (!endsWithPunctuation && trimmedText.length > 100 && attempts < maxAttempts) {
					logger.warn('Summary appears truncated (no ending punctuation), retrying...');
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
				lastUpdate: generatedAt,
			});

			return {
				summary: summaryText,
				questionTitle: question.statement,
				totalParticipants,
				solutionsCount: totalSolutions,
				subQuestionsCount,
				generatedAt,
			};
		} catch (error) {
			if (error instanceof HttpsError) {
				throw error;
			}
			logError(error, {
				operation: 'summarizeDiscussion.generate',
				statementId,
				userId,
			});
			throw new HttpsError('internal', 'Failed to generate summary');
		}
	},
);

/**
 * Fetch a question's above-cutoff answers: child options flagged isChosen by
 * the cutoff logic, sorted by consensus (can't orderBy nested fields in
 * Firestore, so sorting happens in memory).
 */
async function fetchChosenSolutions(parentId: string): Promise<SelectedSolution[]> {
	const snapshot = await getFirestore()
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('isChosen', '==', true)
		.get();

	return snapshot.docs
		.map((doc) => doc.data() as Statement)
		.sort((a, b) => (b.consensus ?? 0) - (a.consensus ?? 0))
		.map((s) => ({
			title: s.statement,
			description: getParagraphsText(s.paragraphs),
			consensus: s.consensus ?? 0,
			averageEvaluation: s.evaluation?.averageEvaluation || 0,
			numberOfEvaluators: s.evaluation?.numberOfEvaluators || 0,
		}));
}

/**
 * Fetch a question's direct sub-questions, in their sibling order.
 * Equality-only filters, so Firestore serves this by merging single-field indexes.
 */
async function fetchSubQuestions(parentId: string): Promise<Statement[]> {
	const snapshot = await getFirestore()
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', StatementType.question)
		.get();

	return snapshot.docs
		.map((doc) => doc.data() as Statement)
		.sort((a, b) => (a.order ?? a.createdAt ?? 0) - (b.order ?? b.createdAt ?? 0));
}

/**
 * Recursively build the question tree with each question's above-cutoff
 * answers, descending into sub-questions until maxDepth.
 */
async function buildQuestionTree(
	statement: Statement,
	depth: number,
	maxDepth: number,
): Promise<QuestionNode> {
	const [solutions, subQuestions] = await Promise.all([
		fetchChosenSolutions(statement.statementId),
		depth < maxDepth ? fetchSubQuestions(statement.statementId) : Promise.resolve([]),
	]);

	const children = await Promise.all(
		subQuestions.map((subQuestion) => buildQuestionTree(subQuestion, depth + 1, maxDepth)),
	);

	return { statement, solutions, children };
}

export function countSolutions(node: QuestionNode): number {
	return (
		node.solutions.length + node.children.reduce((sum, child) => sum + countSolutions(child), 0)
	);
}

export function countSubQuestions(node: QuestionNode): number {
	return node.children.reduce((sum, child) => sum + 1 + countSubQuestions(child), 0);
}

/**
 * Render a sub-question node (and its nested sub-questions) as a markdown
 * section for the deep-summary prompt. Level-1 nodes get ### headers,
 * level-2 nodes #### headers.
 */
export function renderQuestionNode(node: QuestionNode, level: number): string {
	const header = '#'.repeat(Math.min(2 + level, 4));
	const description = getParagraphsText(node.statement.paragraphs);
	const evaluators = node.statement.evaluation?.asParentTotalEvaluators || 0;

	const solutionsText =
		node.solutions.length > 0
			? node.solutions
					.map(
						(s) =>
							`- **${s.title}** (consensus ${s.consensus.toFixed(2)}, ${s.numberOfEvaluators} voters)${
								s.description ? `\n  ${s.description}` : ''
							}`,
					)
					.join('\n')
			: '_No agreed answers yet — this sub-question is still open._';

	const childrenText = node.children
		.map((child) => renderQuestionNode(child, level + 1))
		.join('\n');

	return `${header} Sub-question: ${node.statement.statement}
${description ? `${description}\n` : ''}${evaluators ? `(${evaluators} participants evaluated)\n` : ''}Agreed answers:
${solutionsText}
${childrenText}`;
}

/**
 * Build the deep-summary prompt: synthesize an answer to the main question
 * from the above-cutoff answers of the whole sub-question tree.
 */
export function buildTreeSummaryPrompt(
	tree: QuestionNode,
	totalParticipants: number,
	adminPrompt?: string,
	language: string = 'en',
): string {
	const languageName = LANGUAGE_NAMES[language] || 'English';
	const question = tree.statement;
	const questionContext = getParagraphsText(question.paragraphs);

	const rootSolutionsText =
		tree.solutions.length > 0
			? `## Direct agreements on the main question
${tree.solutions
	.map(
		(s) =>
			`- **${s.title}** (consensus ${s.consensus.toFixed(2)}, ${s.numberOfEvaluators} voters)${
				s.description ? `\n  ${s.description}` : ''
			}`,
	)
	.join('\n')}
`
			: '';

	const subQuestionsText = tree.children.map((child) => renderQuestionNode(child, 1)).join('\n');

	return `You are writing an integrative summary of a group deliberation. The main question was explored through sub-questions; each question lists only the answers that passed that question's consensus cutoff — these are the group's agreed answers.

## The Main Question
"${question.statement}"
${questionContext ? `Context: ${questionContext}` : ''}
${totalParticipants ? `${totalParticipants} participants evaluated proposals on the main question.` : ''}

${rootSolutionsText}
## Sub-question results
${subQuestionsText}

${adminPrompt ? `## Special Focus Requested\n${adminPrompt}\n` : ''}

## Your Task
Write a clear, integrative summary in ${languageName} that:

1. **Answers the main question** - Open with the overall answer that emerges when the sub-question agreements are combined. This synthesis is the heart of the summary.
2. **Covers each sub-question** - For every sub-question that has agreed answers, state plainly what the group agreed. Group related sub-questions by theme when that reads better.
3. **Connects the pieces** - Point out where sub-question agreements reinforce or tension with each other, and what that means for the main question.
4. **Names what is still open** - If some sub-questions have no agreed answers yet, mention them briefly as open points.

**CRITICAL FORMATTING RULES - YOU MUST FOLLOW THESE**:
- Use proper markdown headers for ALL section titles:
  - Use "## " (with space) for main sections (e.g., "## The Answer in Brief", "## What Was Agreed")
  - Use "### " (with space) for subsections (one per sub-question or theme)
- Do NOT use **bold text** for section titles - use ## or ### headers instead
- Use bullet points (- ) for listing agreements under each section

**Writing Style**:
- Write for someone who wasn't part of the discussion - they should fully understand the decisions
- Focus on the SUBSTANCE of what was agreed, not the process
- Use clear, accessible language - avoid jargon
- Be specific about what the group decided to do/believe/support
- Aim for 300-700 words depending on how many sub-questions have agreements
- **IMPORTANT: Complete the entire summary - do not stop mid-sentence or mid-section**

Return ONLY the markdown summary text with proper ## and ### headers. Do not wrap in code blocks or JSON.`;
}

/**
 * Build the summary prompt for Gemini AI
 */
function buildSummaryPrompt(
	question: Statement,
	solutions: SelectedSolution[],
	totalParticipants: number,
	adminPrompt?: string,
	language: string = 'en',
): string {
	const languageName = LANGUAGE_NAMES[language] || 'English';

	// Format solutions with their content and metrics
	const solutionsText = solutions
		.map(
			(s, i) => `
### Agreement ${i + 1}: ${s.title}
${s.description ? `**Details**: ${s.description}` : ''}
- Consensus Score: ${s.consensus.toFixed(2)} | ${s.numberOfEvaluators} voters
`,
		)
		.join('\n');

	// Determine agreement strength descriptions
	const topSolution = solutions[0];
	const agreementStrength =
		topSolution.consensus > 0.5 ? 'strong' : topSolution.consensus > 0.2 ? 'moderate' : 'emerging';

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

**CRITICAL FORMATTING RULES - YOU MUST FOLLOW THESE**:
- Use proper markdown headers for ALL section titles:
  - Use "## " (with space) for main sections (e.g., "## The Discussion Question", "## What Was Agreed")
  - Use "### " (with space) for subsections (e.g., "### Key Agreements", "### Conclusions")
- Do NOT use **bold text** for section titles - use ## or ### headers instead
- Example of CORRECT formatting:
  ## The Discussion Question
  The group discussed...

  ## What Was Agreed
  ### Personal Updates
  - Agreement 1
  - Agreement 2

  ## Key Takeaways
  The main conclusions...

- Example of WRONG formatting (do NOT do this):
  **The Discussion Question**
  **What Was Agreed**

**Writing Style**:
- Write for someone who wasn't part of the discussion - they should fully understand the decisions
- Focus on the SUBSTANCE of what was agreed, not the process
- Use clear, accessible language - avoid jargon
- Be specific about what the group decided to do/believe/support
${
	solutions.length > 10
		? `- Since there are ${solutions.length} agreements, organize them by theme/category using ## and ### headers
- For each category, summarize the key agreements briefly
- Aim for 400-600 words to cover all major decisions`
		: `- Keep it concise (150-300 words) but ensure all key agreements are clearly explained`
}
- Use bullet points (- ) for listing multiple agreements under each section
- If solutions have descriptions, incorporate that detail into your explanation
- **IMPORTANT: Complete the entire summary - do not stop mid-sentence or mid-section**

Return ONLY the markdown summary text with proper ## and ### headers. Do not wrap in code blocks or JSON.`;
}
