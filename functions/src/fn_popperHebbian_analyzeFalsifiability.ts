import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getGeminiModel } from './config/gemini';
import { functionConfig } from '@freedi/shared-types';

interface AnalyzeFalsifiabilityRequest {
	ideaText: string;
	context?: string;
	language?: string;
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

const LANGUAGE_NAMES: Record<string, string> = {
	he: 'Hebrew',
	ar: 'Arabic',
	en: 'English',
	es: 'Spanish',
	fr: 'French',
	de: 'German',
	nl: 'Dutch',
};

export const analyzeFalsifiability = onCall<AnalyzeFalsifiabilityRequest>(
	{ region: functionConfig.region },
	async (request): Promise<AnalyzeFalsifiabilityResponse> => {
		const { ideaText, context, language = 'en' } = request.data;

		if (!ideaText) {
			throw new HttpsError('invalid-argument', 'Idea text is required');
		}

		const languageName = LANGUAGE_NAMES[language] || 'English';
		const languageInstruction =
			language !== 'en'
				? `\n\nIMPORTANT: Your initial message to the user must be in ${languageName}. The JSON analysis can be in English, but all conversational text must be in ${languageName}.`
				: '';

		const prompt = `You are the AI Guide for a collaborative thinking platform. Your job is to analyze ideas for testability and clarity.${languageInstruction}

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

			// Configure generation settings
			const generationConfig = {
				temperature: 0.5, // Balanced between creativity and consistency
				responseMimeType: 'application/json', // Force JSON output
			};

			// Call Gemini API with strict configuration
			const result = await model.generateContent({
				contents: [{ role: 'user', parts: [{ text: prompt }] }],
				generationConfig,
			});

			const response = await result.response;
			const text = response.text();

			// Parse JSON response directly (responseMimeType ensures valid JSON)
			let analysis: FalsifiabilityAnalysis;
			try {
				const parsed = JSON.parse(text);
				console.info('Parsed response:', JSON.stringify(parsed));

				// Handle case where AI returns an array instead of a single object
				if (Array.isArray(parsed)) {
					// Find the object that has the analysis structure (with isTestable field)
					const analysisObj = parsed.find(
						(item: unknown) => item && typeof item === 'object' && 'isTestable' in item,
					);
					if (!analysisObj) {
						console.error('No valid analysis found in array:', parsed);
						throw new Error('AI returned array without analysis object');
					}
					analysis = analysisObj as FalsifiabilityAnalysis;
				} else {
					analysis = parsed;
				}

				console.info('Extracted analysis:', JSON.stringify(analysis));

				// Validate the analysis structure
				if (!analysis || typeof analysis !== 'object') {
					console.error('Invalid analysis structure:', analysis);
					throw new Error('AI returned invalid analysis structure');
				}

				// Ensure vagueTerms is an array
				if (!analysis.vagueTerms || !Array.isArray(analysis.vagueTerms)) {
					console.error('Missing or invalid vagueTerms in analysis:', analysis);
					analysis.vagueTerms = [];
				}
			} catch (parseError) {
				const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';
				console.error('Failed to parse JSON response:', text, errorMessage);
				throw new Error('Invalid JSON response from AI');
			}

			// Generate initial AI message based on analysis and language
			let initialMessage: string;

			if (language === 'he') {
				// Hebrew messages
				if (analysis.isTestable) {
					initialMessage = `${analysis.vagueTerms.length > 0 ? `כשאתה אומר "${analysis.vagueTerms[0]}", למה בדיוק אתה מתכוון?` : 'איזה פרטים נוספים תוכל לספק?'}`;
				} else {
					initialMessage = `${analysis.vagueTerms.length > 0 ? `כשאתה אומר "${analysis.vagueTerms[0]}", למה בדיוק אתה מתכוון?` : 'איזה פרטים נוספים תוכל לספק?'}`;
				}
			} else {
				// English messages (default)
				if (analysis.isTestable) {
					initialMessage = `${analysis.vagueTerms.length > 0 ? `When you say "${analysis.vagueTerms[0]}", what exactly do you mean?` : 'What additional details can you provide?'}`;
				} else {
					initialMessage = `${analysis.vagueTerms.length > 0 ? `When you say "${analysis.vagueTerms[0]}", what exactly do you mean?` : 'What additional details can you provide?'}`;
				}
			}

			return {
				analysis,
				initialMessage,
			};
		} catch (error) {
			console.error('Error analyzing falsifiability:', error);
			throw new HttpsError('internal', 'Failed to analyze idea');
		}
	},
);
