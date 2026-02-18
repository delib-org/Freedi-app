import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getGeminiModel } from './config/gemini';
import { functionConfig } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';

interface RefinementMessage {
	messageId: string;
	role: 'user' | 'ai-guide';
	content: string;
	timestamp: number;
	messageType: 'question' | 'answer' | 'clarification' | 'suggestion';
}

interface RefineIdeaRequest {
	sessionId: string;
	userResponse: string;
	conversationHistory: RefinementMessage[];
	originalIdea: string;
	currentRefinedIdea?: string;
	language?: string;
}

interface RefineIdeaResponse {
	aiMessage: string;
	refinedIdea?: string;
	isComplete: boolean;
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

export const refineIdea = onCall<RefineIdeaRequest>(
	{ region: functionConfig.region },
	async (request): Promise<RefineIdeaResponse> => {
		const {
			userResponse,
			conversationHistory,
			originalIdea,
			currentRefinedIdea,
			language = 'en',
		} = request.data;

		const conversationContext = conversationHistory
			.map((msg) => `${msg.role}: ${msg.content}`)
			.join('\n');

		const languageName = LANGUAGE_NAMES[language] || 'English';
		const languageInstruction =
			language !== 'en'
				? `\n\nIMPORTANT: All your responses (aiMessage, refinedIdea, etc.) must be in ${languageName}. Conduct the entire dialogue in ${languageName}.`
				: '';

		const prompt = `You are helping make answers clear and specific.${languageInstruction}

Your task:
1. Read the original question/topic
2. Read the proposed answer
3. Decide: Is this answer clear enough for someone to understand what's being proposed?

If YES - the answer is clear:
- Say "מושלם!" / "Perfect!"
- Provide the refined version

If NO - the answer needs clarity:
- Ask ONE simple question about the most important missing detail
- Focus on: which, what type, when, where, who
- Be natural and conversational
- Keep it very short (one sentence)
- Maximum 2-3 questions total

Your decision should be based on:
- Can others understand exactly what's being proposed?
- Does it have enough practical details?
- Is it relevant to the original question?

Examples of clarifying questions:
- "איזו מסעדה?" / "Which restaurant?"
- "מתי?" / "When?"
- "איפה?" / "Where?"

Be helpful and warm. Acknowledge responses: "מצוין!" / "Great!"

CRITICAL Guidelines:
- CHECK RELEVANCE FIRST: Does this proposal actually answer the original question? If someone asks "where to eat?" and proposes "go swimming", that's not relevant!
- BE EFFICIENT: Max 2-3 questions for simple social activities, 3-4 for complex proposals
- FOCUS ON SPECIFICS: Ask "Which restaurant?" "What time?" "Where exactly?" not "How will we measure success?"
- STOP EARLY: Once you know WHAT they want with enough detail for others to understand, you're done!
- RECOGNIZE CLARITY: If the user provides specific details (like "at Mario's Italian Restaurant downtown"), STOP asking - that's clear enough!
- DON'T OVER-REFINE: Get the key details that matter, then stop
- Use "Simple Folks" language - no jargon
- Be encouraging: "Great!" "That helps!" "Perfect!"
- Focus on clarity and understanding, not testing or measurement

What makes an idea "clear enough":
- It's relevant to the original question/topic
- Others can understand exactly what's being proposed
- Key practical details are specified (which place, what type, when)
- For social activities: specific enough that people know what they're choosing
- For policy/complex ideas: enough implementation details to understand what would happen
- Example: "at a restaurant" is vague → "at Mario's Italian Restaurant on Main Street" is clear

Original idea: "${originalIdea}"
${currentRefinedIdea ? `Current refined version: "${currentRefinedIdea}"` : ''}

Conversation so far:
${conversationContext}

User's latest response: "${userResponse}"

DECISION: Look at the conversation.
1. Is the proposal relevant to the original question/topic?
2. Do you have enough specific details for others to clearly understand what's being proposed?
If BOTH YES, mark isComplete: true. If NO to either, ask ONE more focused question.

Response format (JSON):

If asking a question:
{
  "aiMessage": "Your natural, conversational question here",
  "isComplete": false
}

If the idea is now clear and complete:
{
  "aiMessage": "מושלם!" (or "Perfect!" in English),
  "refinedIdea": "The clear, specific version with all practical details",
  "isComplete": true
}

Think independently and ask what YOU think is most important to clarify.`;

		try {
			const model = getGeminiModel();

			// Configure generation settings
			const generationConfig = {
				temperature: 0.7, // More flexibility for natural conversation
				responseMimeType: 'application/json', // Force JSON output
			};

			const result = await model.generateContent({
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				generationConfig,
			});

			const response = await result.response;
			const text = response.text();

			// Parse JSON response directly (responseMimeType ensures valid JSON)
			let refinementResult: RefineIdeaResponse;
			try {
				refinementResult = JSON.parse(text);
			} catch (parseError) {
				logError(parseError, {
					operation: 'popperHebbian.refineIdea.parseJSON',
					metadata: { responseLength: text.length },
				});
				throw new Error('Invalid JSON response from AI');
			}

			return refinementResult;
		} catch (error) {
			logError(error, { operation: 'popperHebbian.refineIdea' });
			throw new HttpsError('internal', 'Failed to refine idea');
		}
	},
);
