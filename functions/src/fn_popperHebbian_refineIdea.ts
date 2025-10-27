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

		const prompt = `You are helping refine vague ideas into clear proposals.${languageInstruction}

STRICT INSTRUCTION: Your aiMessage must ONLY be ONE of these templates. Do not add any other text:

TEMPLATE 1 - First question (when you need clarity on the main term):
"כש[אתה/את] אומר '[המונח המעורפל]', למה בדיוק [אתה/את] מתכוון?"
English: "When you say '[vague term]', what exactly do you mean?"

TEMPLATE 2 - Specific detail question:
"איזה [פרט ספציפי] בדיוק?"
English: "Which [specific detail] exactly?"

TEMPLATE 3 - Time/location question:
"מתי / איפה בדיוק?"
English: "When / Where exactly?"

TEMPLATE 4 - Acknowledgment + follow-up:
"מצוין! [שאלת המשך קצרה]?"
English: "Great! [short follow-up question]?"

TEMPLATE 5 - Completion:
"מושלם!"
English: "Perfect!"

RULES:
- Use ONLY these templates
- Maximum 2-3 questions total
- Each aiMessage = ONLY the question, no explanations
- Check: Is this relevant to the parent question?
- Focus: which place, what type, when, where - NOT success criteria

Your goals:
1. Verify relevance to original question
2. Get specific details (which, what type, when, where)
3. Keep it SHORT

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

MANDATORY: Use ONLY the templates above. Your aiMessage must match one of the 5 templates EXACTLY.

Examples in Hebrew:
{
  "aiMessage": "כשאתה אומר 'מסעדה', למה בדיוק אתה מתכוון?",
  "isComplete": false
}

{
  "aiMessage": "איזו מסעדה בדיוק?",
  "isComplete": false
}

{
  "aiMessage": "מצוין! מתי בדיוק?",
  "isComplete": false
}

{
  "aiMessage": "מושלם!",
  "refinedIdea": "The clear, specific version with all practical details",
  "isComplete": true
}`;

		try {
			const model = getGeminiModel();

			// Configure generation settings
			const generationConfig = {
				temperature: 0.5,  // Balanced between creativity and consistency
				responseMimeType: "application/json",  // Force JSON output
			};

			const result = await model.generateContent({
				contents: [{ role: "user", parts: [{ text: prompt }] }],
				generationConfig
			});

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
