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

CRITICAL Guidelines:
- BE EFFICIENT: Max 2-3 questions for simple social activities, 3-4 for complex proposals
- STOP EARLY: Once you have WHO, WHAT, and HOW TO MEASURE SUCCESS, you're done!
- RECOGNIZE CLARITY: If the user provides specific success criteria (like "80% will say they enjoyed it"), STOP asking questions - that's clear enough!
- DON'T OVER-REFINE: Simple ideas like "go to the pool" don't need extensive interrogation about timing, location details, etc.
- Use "Simple Folks" language - no jargon
- Be encouraging: "Great!" "That helps!" "Perfect!"
- Focus on clarity, not criticism

What makes an idea "clear enough":
- We know what they want to do
- We know how they'll measure if it worked
- For social activities: knowing the activity + success criteria is sufficient
- For policy/complex ideas: need specifics on implementation + measurement

Original idea: "${originalIdea}"
${currentRefinedIdea ? `Current refined version: "${currentRefinedIdea}"` : ''}

Conversation so far:
${conversationContext}

User's latest response: "${userResponse}"

DECISION: Look at the conversation. Do you now know (1) what they want to do and (2) how they'll know if it worked? If YES, mark isComplete: true. If NO, ask ONE more focused question.

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
