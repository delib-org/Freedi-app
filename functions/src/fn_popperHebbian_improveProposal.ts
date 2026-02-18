import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getFirestore } from 'firebase-admin/firestore';
import { Statement, Collections, functionConfig } from '@freedi/shared-types';
import { getGeminiModel } from './config/gemini';
import { getParagraphsText } from './helpers';

interface ImproveProposalRequest {
	statementId: string;
	language?: string;
}

interface ImproveProposalResponse {
	originalTitle: string;
	originalDescription: string;
	improvedTitle: string;
	improvedDescription: string;
	improvementSummary: string;
	changesHighlight: string[];
	evidenceConsidered: number;
	confidence: number;
}

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
 * Firebase callable function to generate an AI-improved version of a proposal
 * based on discussion comments (supporting and challenging evidence).
 *
 * Only accessible by the proposal creator or group admins.
 */
export const improveProposalWithAI = onCall<ImproveProposalRequest>(
	{ region: functionConfig.region },
	async (request): Promise<ImproveProposalResponse> => {
		const { statementId, language = 'en' } = request.data;
		const userId = request.auth?.uid;

		if (!userId) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		if (!statementId) {
			throw new HttpsError('invalid-argument', 'Statement ID is required');
		}

		const db = getFirestore();

		// 1. Fetch the proposal statement
		const statementDoc = await db.collection(Collections.statements).doc(statementId).get();
		if (!statementDoc.exists) {
			throw new HttpsError('not-found', 'Statement not found');
		}
		const statement = statementDoc.data() as Statement;

		// 2. Check permissions: creator or admin
		const isCreator = statement.creatorId === userId;

		// Check if user is admin for this group
		let isAdmin = false;
		if (statement.topParentId) {
			const membersSnapshot = await db
				.collection(Collections.statementsSubscribe)
				.where('statementId', '==', statement.topParentId)
				.where('oderId', '==', userId)
				.where('role', 'in', ['admin', 'creator'])
				.limit(1)
				.get();
			isAdmin = !membersSnapshot.empty;
		}

		if (!isCreator && !isAdmin) {
			throw new HttpsError(
				'permission-denied',
				'Only the creator or admins can improve this proposal',
			);
		}

		// 3. Fetch all comments/evidence posts for this statement
		const commentsSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.where('evidence', '!=', null)
			.orderBy('evidence')
			.orderBy('createdAt', 'desc')
			.limit(50)
			.get();

		const comments = commentsSnapshot.docs.map((doc) => doc.data() as Statement);

		// 4. Build synthesis prompt
		const prompt = buildSynthesisPrompt(
			statement.statement,
			getParagraphsText(statement.paragraphs),
			comments,
			language,
		);

		// 5. Call Gemini
		try {
			const model = getGeminiModel();

			const result = await model.generateContent({
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				generationConfig: {
					temperature: 0.4, // Lower temperature for more consistent improvements
					responseMimeType: 'application/json',
				},
			});

			const response = result.response;
			const text = response.text();

			let aiResponse: {
				improvedTitle: string;
				improvedDescription: string;
				improvementSummary: string;
				changesHighlight: string[];
				confidence: number;
			};

			try {
				aiResponse = JSON.parse(text);
			} catch {
				console.error('Failed to parse AI response:', text);
				throw new HttpsError('internal', 'Failed to parse AI response');
			}

			// Validate response structure
			if (
				!aiResponse.improvedTitle ||
				!aiResponse.improvedDescription ||
				!aiResponse.improvementSummary
			) {
				console.error('Invalid AI response structure:', aiResponse);
				throw new HttpsError('internal', 'Invalid AI response structure');
			}

			return {
				originalTitle: statement.statement,
				originalDescription: getParagraphsText(statement.paragraphs),
				improvedTitle: aiResponse.improvedTitle,
				improvedDescription: aiResponse.improvedDescription,
				improvementSummary: aiResponse.improvementSummary,
				changesHighlight: aiResponse.changesHighlight || [],
				evidenceConsidered: comments.length,
				confidence: aiResponse.confidence || 0.5,
			};
		} catch (error) {
			if (error instanceof HttpsError) {
				throw error;
			}
			console.error('Error generating improved proposal:', error);
			throw new HttpsError('internal', 'Failed to generate improved proposal');
		}
	},
);

/**
 * Build the synthesis prompt for Gemini AI
 */
function buildSynthesisPrompt(
	proposalTitle: string,
	proposalDescription: string,
	comments: Statement[],
	language: string,
): string {
	const languageName = LANGUAGE_NAMES[language] || 'English';

	// Categorize comments by support level
	const supporting = comments
		.filter((c) => (c.evidence?.support ?? 0) > 0.2)
		.map((c) => ({
			text: c.statement,
			support: c.evidence?.support ?? 0,
			type: c.evidence?.evidenceType || 'argument',
		}));

	const challenging = comments
		.filter((c) => (c.evidence?.support ?? 0) < -0.2)
		.map((c) => ({
			text: c.statement,
			support: c.evidence?.support ?? 0,
			type: c.evidence?.evidenceType || 'argument',
		}));

	const neutral = comments
		.filter((c) => Math.abs(c.evidence?.support ?? 0) <= 0.2)
		.map((c) => ({
			text: c.statement,
			type: c.evidence?.evidenceType || 'argument',
		}));

	const supportingSection =
		supporting.length > 0
			? supporting
					.map((s) => `- ${s.text} (support: ${s.support.toFixed(1)}, type: ${s.type})`)
					.join('\n')
			: 'None';

	const challengingSection =
		challenging.length > 0
			? challenging
					.map((c) => `- ${c.text} (challenge: ${Math.abs(c.support).toFixed(1)}, type: ${c.type})`)
					.join('\n')
			: 'None';

	const neutralSection =
		neutral.length > 0 ? neutral.map((n) => `- ${n.text} (type: ${n.type})`).join('\n') : 'None';

	const descriptionSection = proposalDescription
		? `\n## Original Description\n"${proposalDescription}"`
		: '';

	return `You are an expert deliberative facilitator. Your role is to evolve proposals toward genuine consensus by integrating feedback from the community discussion.

IMPORTANT: Respond entirely in ${languageName}. All text in the response must be in ${languageName}.

## Original Title
"${proposalTitle}"${descriptionSection}

## Supporting Comments (${supporting.length} items):
${supportingSection}

## Challenging Comments (${challenging.length} items):
${challengingSection}

## Neutral/Clarifying Comments (${neutral.length} items):
${neutralSection}

## Your Task
Create an improved version with a clear TITLE and detailed DESCRIPTION:

**Title Guidelines:**
- Do NOT truncate or shorten - preserve the full meaning
- Capture the complete essence of the solution
- Be clear and understandable

**Description Guidelines:**
- Provide detailed explanation of the proposal
- Address valid criticisms and concerns from challenging comments
- Incorporate helpful suggestions from supporting comments
- Clarify ambiguous parts mentioned in neutral comments
- Be comprehensive but focused

CRITICAL Rules:
- Do NOT introduce ideas not grounded in the discussion
- Do NOT change the fundamental purpose of the proposal
- Focus on refinement, not replacement
- Be concrete and specific in improvements
- ${comments.length === 0 ? 'Since there are no comments yet, focus on making the proposal clearer and more specific.' : ''}

## Response Format (JSON)
{
  "improvedTitle": "A clear, concise title that captures the essence of the solution in ${languageName}",
  "improvedDescription": "Detailed description that explains the proposal, addresses feedback, and provides context in ${languageName}",
  "improvementSummary": "Brief explanation of what was changed and why (2-3 sentences) in ${languageName}",
  "changesHighlight": ["Key change 1 in ${languageName}", "Key change 2 in ${languageName}", "..."],
  "confidence": 0.85
}

The confidence score (0-1) should reflect:
- Higher (0.8-1.0): Clear feedback, obvious improvements
- Medium (0.5-0.7): Mixed feedback, balanced improvements
- Lower (0.3-0.5): Limited feedback or conflicting views`;
}
