import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getGeminiModel, geminiApiKey } from './config/gemini';

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
	testabilityCriteria?: string[];
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

export const refineIdea = onCall<RefineIdeaRequest>(
	{ secrets: [geminiApiKey] },
	async (request): Promise<RefineIdeaResponse> => {
		const {
			userResponse,
			conversationHistory,
			originalIdea,
			currentRefinedIdea,
			language = 'en'
		} = request.data;

		const conversationContext = conversationHistory
			.map(msg => `${msg.role}: ${msg.content}`)
			.join('\n');

		const languageName = LANGUAGE_NAMES[language] || 'English';
		const languageInstruction = language !== 'en'
			? `\n\nIMPORTANT: All your responses (aiMessage, refinedIdea, etc.) must be in ${languageName}. Conduct the entire dialogue in ${languageName}.`
			: '';

		const prompt = `You are the AI Guide conducting a Socratic dialogue to refine vague ideas into testable propositions.${languageInstruction}

Your goals:
1. Ask clarifying questions about vague terms
2. Help the user define success/failure criteria
3. Ensure the idea is specific and measurable
4. Use encouraging, collaborative language
5. Keep questions short and focused (one at a time)
6. When the idea is clear, provide a refined version

Guidelines:
- Use "Simple Folks" language - no jargon
- Be encouraging: "Great!" "That helps!" "Perfect!"
- Focus on clarity, not criticism
- Ask: "What would we look for?" "How would we know if it worked?"
- Max 3-5 rounds of questions before proposing refined version

Original idea: "${originalIdea}"
${currentRefinedIdea ? `Current refined version: "${currentRefinedIdea}"` : ''}

Conversation so far:
${conversationContext}

User's latest response: "${userResponse}"

Continue the Socratic dialogue or provide the final refined idea if clear enough.

Response format (JSON):
If more refinement needed:
{
  "aiMessage": "Great! That helps. Now, when you say X, what exactly do you mean?",
  "isComplete": false
}

If ready:
{
  "aiMessage": "Perfect! This is super clear now.",
  "refinedIdea": "The clear, testable version of their idea",
  "isComplete": true,
  "testabilityCriteria": ["How we'd measure success", "What would prove it wrong"]
}`;

		try {
			const model = getGeminiModel();
			const result = await model.generateContent(prompt);
			const response = await result.response;
			const text = response.text();

			// Extract JSON from response
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				throw new Error('Invalid JSON response from AI');
			}

			const refinementResult: RefineIdeaResponse = JSON.parse(jsonMatch[0]);

			return refinementResult;

		} catch (error) {
			console.error('Error refining idea:', error);
			throw new HttpsError('internal', 'Failed to refine idea');
		}
	}
);
