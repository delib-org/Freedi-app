import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getGeminiModel, geminiApiKey } from './config/gemini';

interface AnalyzeFalsifiabilityRequest {
	ideaText: string;
	context?: string;
}

interface FalsifiabilityAnalysis {
	isTestable: boolean;
	vagueTerms: string[];
	suggestions: string[];
	confidence: number;
	reasoning: string;
}

interface AnalyzeFalsifiabilityResponse {
	analysis: FalsifiabilityAnalysis;
	initialMessage: string;
}

export const analyzeFalsifiability = onCall<AnalyzeFalsifiabilityRequest>(
	{ secrets: [geminiApiKey] },
	async (request): Promise<AnalyzeFalsifiabilityResponse> => {
		const { ideaText, context } = request.data;

		if (!ideaText) {
			throw new HttpsError('invalid-argument', 'Idea text is required');
		}

		const prompt = `You are the AI Guide for a collaborative thinking platform. Your job is to analyze ideas for testability and clarity.

An idea is "testable" if:
1. It makes specific, measurable claims
2. We could identify evidence that would prove it wrong
3. Key terms are clearly defined
4. Success/failure criteria are identifiable

Analyze this idea: "${ideaText}"
${context ? `Context: ${context}` : ''}

Provide your analysis in JSON format:
{
  "isTestable": boolean,
  "vagueTerms": ["term1", "term2"],
  "suggestions": ["suggestion1", "suggestion2"],
  "confidence": 0.85,
  "reasoning": "brief explanation"
}

Use simple, encouraging language.`;

		try {
			const model = getGeminiModel();

			// Call Gemini API
			const result = await model.generateContent(prompt);
			const response = await result.response;
			const text = response.text();

			// Extract JSON from response (may be wrapped in markdown code blocks)
			const jsonMatch = text.match(/\{[\s\S]*\}/);
			if (!jsonMatch) {
				throw new Error('Invalid JSON response from AI');
			}

			const analysis: FalsifiabilityAnalysis = JSON.parse(jsonMatch[0]);

			// Generate initial AI message based on analysis
			let initialMessage: string;

			if (analysis.isTestable) {
				initialMessage = `Hey! That's an interesting idea, and it's already pretty clear!

However, I have a few questions to make it even stronger for discussion. This will help everyone understand exactly what you mean and how to evaluate it fairly.

Ready to sharpen it together?`;
			} else {
				initialMessage = `Hey! I'm the AI Guide. That's an interesting idea!

To help everyone discuss this fairly, **we need to make it crystal clear.** Right now, it's a bit vague.

${analysis.vagueTerms.length > 0 ? `For example, when you say **"${analysis.vagueTerms[0]}"**, what do you mean exactly?` : ''}

Let me ask you a few questions to help sharpen this idea. Sound good?`;
			}

			return {
				analysis,
				initialMessage
			};

		} catch (error) {
			console.error('Error analyzing falsifiability:', error);
			throw new HttpsError('internal', 'Failed to analyze idea');
		}
	}
);
