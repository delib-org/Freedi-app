import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v1';
import { Statement, StatementType, Collections, functionConfig } from '@freedi/shared-types';
import { getGeminiModel, getGenAI, LLM_MODEL_HEAVY } from './config/gemini';
import { ALLOWED_ORIGINS } from './config/cors';
import { getParagraphsText } from './helpers';
import { logError } from './utils/errorHandling';
import { hasAdminSubscription } from './utils/subscriptionIdentity';
import { stampWorkflowSummary } from './deliberation/records';
import { filterDividedOptions, summaryCoversDivided } from './utils/dividedOptions';

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
	/**
	 * When true, the summary ALSO covers options the group is divided on
	 * (decided by vote counts in code, see utils/dividedOptions). Default is
	 * selected options only. Applies to the flat path only: it is ignored when
	 * includeSubQuestions builds the tree summary.
	 */
	includeDivided?: boolean;
}

interface SummarizeDiscussionResponse {
	summary: string;
	questionTitle: string;
	totalParticipants: number;
	solutionsCount: number;
	subQuestionsCount: number;
	generatedAt: number;
	/** Whether the saved summary also covers options the group is divided on. */
	includeDivided: boolean;
	/** How many divided options were found (0 when none, or not asked for). */
	dividedCount: number;
}

interface SelectedSolution {
	/** Lets the prompt tell which divided options are also selected. */
	statementId?: string;
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

/**
 * A summary is "a minute of reading or less". 150 words is about a minute for
 * English readers and a little under for Hebrew/Arabic, who read slower, so
 * this is deliberately conservative. The cap covers the whole summary,
 * divided section included.
 */
export const SUMMARY_MAX_WORDS = 150;

/**
 * Output cap for the brief flat summary. ~150 words is a few hundred tokens
 * even in Hebrew; the rest is a safety margin because the reasoning models
 * count their hidden reasoning against the same limit.
 */
export const BRIEF_SUMMARY_MAX_OUTPUT_TOKENS = 2048;

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
		const { statementId, adminPrompt, language, includeSubQuestions, includeDivided } =
			request.data;
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

		// 2. Check permissions: creator or admin.
		//
		// Admin is resolved against the top parent AND against the question
		// itself. A subscription on the question alone is enough to edit that
		// statement under the Firestore rules (and is what the Join app's own
		// `isAdmin()` reads), so authorizing only top-parent subscriptions turned
		// away facilitators who legitimately run a single hub question.
		if (!(await canSummarize(db, question, statementId, userId))) {
			throw new HttpsError('permission-denied', 'Only admins can generate summaries');
		}

		const saved = await generateAndSaveSummary(question, statementId, userId, {
			adminPrompt,
			language,
			includeSubQuestions,
			includeDivided,
			operation: 'summarizeDiscussion.callable',
		});
		try {
			await stampWorkflowSummary(statementId, saved.generatedAt);
		} catch (error) {
			logError(error, { operation: 'summarizeDiscussion.stampWorkflow', statementId, userId });
		}

		return saved;
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
			statementId: s.statementId,
			title: s.statement,
			description: getParagraphsText(s.paragraphs),
			consensus: s.consensus ?? 0,
			averageEvaluation: s.evaluation?.averageEvaluation || 0,
			numberOfEvaluators: s.evaluation?.numberOfEvaluators || 0,
		}));
}

/**
 * Fetch the question's child options (selected or not) that the group is
 * divided on. Equality-only filters, no composite index needed.
 */
async function fetchDividedOptions(parentId: string): Promise<Statement[]> {
	const snapshot = await getFirestore()
		.collection(Collections.statements)
		.where('parentId', '==', parentId)
		.where('statementType', '==', StatementType.option)
		.get();

	return filterDividedOptions(snapshot.docs.map((doc) => doc.data() as Statement));
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
export function buildSummaryPrompt(
	question: Statement,
	solutions: SelectedSolution[],
	totalParticipants: number,
	adminPrompt?: string,
	language: string = 'en',
	dividedOptions: Statement[] = [],
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

	const selectedIds = new Set(solutions.map((s) => s.statementId).filter(Boolean));
	const selectedTitles = new Set(solutions.map((s) => s.title.trim()));
	const isAlsoSelected = (o: Statement): boolean =>
		selectedIds.has(o.statementId) || selectedTitles.has(o.statement.trim());

	const dividedText =
		dividedOptions.length > 0
			? `## Where the Group Is Divided
The following option(s) split the group: many evaluators supported them and many opposed them.
${dividedOptions
	.map((o) => {
		const total = o.evaluation?.numberOfEvaluators ?? 0;
		const pro = o.evaluation?.numberOfProEvaluators ?? 0;
		const con = o.evaluation?.numberOfConEvaluators ?? 0;
		const description = getParagraphsText(o.paragraphs);
		const selectedNote = isAlsoSelected(o) ? ' [selected above, but the group is split on it]' : '';

		return `- **${o.statement}** (${pro} for, ${con} against, ${total} voters)${selectedNote}${description ? `\n  ${description}` : ''}`;
	})
	.join('\n')}
`
			: '';
	const dividedTask =
		dividedOptions.length > 0
			? `\n5. **Where is the group divided?** - In one or two short sentences or bullets, say what the group is split on, using ONLY the divided options listed above. Present them as splits, not as agreements. An option marked "selected above, but the group is split on it" passed the selection cutoff, so say it was selected but that the group is split on it, rather than listing it as a plain agreement.`
			: '';

	return `You are writing a BRIEF summary of a group decision for busy readers.

## The Question Discussed
"${question.statement}"
${getParagraphsText(question.paragraphs) ? `Context: ${getParagraphsText(question.paragraphs)}` : ''}

## What the Group Agreed On
${totalParticipants} participants evaluated the proposals. The following ${solutions.length} solution(s) achieved consensus:
${solutionsText}

${dividedText}${adminPrompt ? `## Special Focus Requested\n${adminPrompt}\n` : ''}

## Your Task
Write a brief summary in ${languageName} that tells readers:

1. **What was decided** - State each agreed solution in plain language. If there are many, group them and name only the main ones.
2. **How strong is the agreement?** - This discussion shows ${agreementStrength} consensus (top score: ${topSolution.consensus.toFixed(2)}). One short clause is enough.${dividedTask}

**LENGTH - THIS IS THE MOST IMPORTANT RULE**:
- The WHOLE summary must be at most ${SUMMARY_MAX_WORDS} words, including any section on where the group is divided. A person must be able to read it in one minute or less.
- Use short, plain sentences. Drop background and repetition; do not retell the discussion.
- If the content does not fit, keep the most important points and leave the rest out.

**Formatting**:
- Use at most one short "## " heading per part, or no headings at all. Do NOT use **bold text** as a heading.
- Bullet points (- ) are fine for listing agreements.

**Writing Style**:
- Write for someone who wasn't part of the discussion
- Focus on the SUBSTANCE of what was agreed, not the process
- Use clear, accessible language - avoid jargon
- **IMPORTANT: Finish the whole summary - do not stop mid-sentence**

Return ONLY the markdown summary text with proper ## and ### headers. Do not wrap in code blocks or JSON.`;
}

export interface SummaryOptions {
	adminPrompt?: string;
	language?: string;
	includeSubQuestions?: boolean;
	includeDivided?: boolean;
	/** Caller label for error logs, e.g. 'deliberation.generateSummary'. */
	operation?: string;
}

/**
 * Builds the question's summary and saves it on the statement (summary,
 * summaryGeneratedAt, summaryIncludesDivided). The one place a question summary
 * is written: the card button and the deliberation workflow both call it.
 * The caller has already checked permissions.
 */
export async function generateAndSaveSummary(
	question: Statement,
	statementId: string,
	userId: string,
	options: SummaryOptions,
): Promise<SummarizeDiscussionResponse> {
	const { adminPrompt, language, includeSubQuestions, includeDivided } = options;
	const operation = options.operation ?? 'summarizeDiscussion.generate';
	const db = getFirestore();
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

	// Options the group is split on, picked by code from the vote counts.
	const dividedOptions = includeDivided === true ? await fetchDividedOptions(statementId) : [];

	// 5. Detect language and build prompt
	const detectedLang = language || detectLanguage(question.statement);
	const useDeepSummary = maxDepth > 0 && subQuestionsCount > 0;
	const prompt = useDeepSummary
		? buildTreeSummaryPrompt(tree, totalParticipants, adminPrompt, detectedLang)
		: buildSummaryPrompt(
				question,
				tree.solutions,
				totalParticipants,
				adminPrompt,
				detectedLang,
				dividedOptions,
			);

	// 6. Call the LLM with retry logic for truncation.
	// Deep (sub-question) summaries are an integration/synthesis task, so they
	// run on the heavy reasoning model; flat summaries stay on the fast tier.
	try {
		const model = useDeepSummary
			? getGenAI().getGenerativeModel({ model: LLM_MODEL_HEAVY })
			: getGeminiModel();

		// Calculate appropriate token limit based on number of solutions
		// More solutions = need more tokens for complete summary
		// The brief flat summary needs far fewer than the deep one.
		const baseTokens = 4096;
		const tokensPerSolution = 100;
		const maxOutputTokens = useDeepSummary
			? Math.min(8192, baseTokens + totalSolutions * tokensPerSolution)
			: BRIEF_SUMMARY_MAX_OUTPUT_TOKENS;

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
		// The deep tree summary never covers divided options.
		const coversDivided = summaryCoversDivided(useDeepSummary, dividedOptions.length);
		await db
			.collection(Collections.statements)
			.doc(statementId)
			.update({
				summary: summaryText,
				summaryGeneratedAt: generatedAt,
				summaryIncludesDivided: coversDivided,
				// What the summary was built from, so the UI can tell when the selection changes.
				summarySelectedIds: tree.solutions
					.map((solution) => solution.statementId)
					.filter((id): id is string => typeof id === 'string')
					.sort(),
				lastUpdate: generatedAt,
			});

		return {
			summary: summaryText,
			questionTitle: question.statement,
			totalParticipants,
			solutionsCount: totalSolutions,
			subQuestionsCount,
			generatedAt,
			includeDivided: coversDivided,
			dividedCount: dividedOptions.length,
		};
	} catch (error) {
		if (error instanceof HttpsError) {
			throw error;
		}
		logError(error, {
			operation,
			statementId,
			userId,
		});
		throw new HttpsError('internal', 'Failed to generate summary');
	}
}

/**
 * Whether `userId` may generate a summary for the question: its creator, or an
 * admin of its top parent or of the question itself. Subscriptions are read by
 * doc id and the admin check fails closed on any lookup error.
 */
export async function canSummarize(
	db: Firestore,
	question: Pick<Statement, 'creatorId' | 'topParentId'>,
	statementId: string,
	userId: string,
): Promise<boolean> {
	if (question.creatorId === userId) return true;
	const scopeIds = [question.topParentId || statementId];
	if (scopeIds[0] !== statementId) scopeIds.push(statementId);
	try {
		return await hasAdminSubscription(db, userId, scopeIds);
	} catch (error) {
		logError(error, { operation: 'summarizeDiscussion.adminCheck', userId, statementId });

		return false;
	}
}
