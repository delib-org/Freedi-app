/**
 * Shared Gemini AI utilities
 *
 * Extracted from fn_versionAI.ts for reuse across multiple Firebase Functions.
 */

import { logError } from '../utils/errorHandling';
import { GEMINI_MODEL as DEFAULT_GEMINI_MODEL, getGenAI } from '../config/gemini';

const GEMINI_MODEL = DEFAULT_GEMINI_MODEL;
const MAX_TOKENS = 8192;
const TEMPERATURE = 0.3;

/**
 * Extract and parse JSON from AI response.
 * Handles markdown code blocks, truncated output, and partial recovery.
 */
export function extractJSON<T>(response: string, fallback?: T): T {
	let cleanedResponse = response.trim();

	// Remove markdown code blocks
	const codeBlockMatch = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (codeBlockMatch) {
		cleanedResponse = codeBlockMatch[1].trim();
	}

	// Try to find JSON object or array
	const jsonMatch = cleanedResponse.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
	if (jsonMatch) {
		cleanedResponse = jsonMatch[1];
	}

	try {
		return JSON.parse(cleanedResponse);
	} catch (parseError) {
		if (fallback !== undefined) {
			return fallback;
		}

		// Try to fix truncation
		let fixedResponse = cleanedResponse;
		const openBraces = (fixedResponse.match(/\{/g) || []).length;
		const closeBraces = (fixedResponse.match(/\}/g) || []).length;
		const openBrackets = (fixedResponse.match(/\[/g) || []).length;
		const closeBrackets = (fixedResponse.match(/\]/g) || []).length;

		for (let i = 0; i < openBrackets - closeBrackets; i++) {
			fixedResponse += ']';
		}
		for (let i = 0; i < openBraces - closeBraces; i++) {
			fixedResponse += '}';
		}

		try {
			return JSON.parse(fixedResponse);
		} catch {
			// Try to extract partial content
			const proposedContentMatch = cleanedResponse.match(
				/"proposedContent"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/,
			);
			if (proposedContentMatch) {
				return {
					proposedContent: proposedContentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
					reasoning: 'Response was truncated - partial recovery',
					confidence: 0.7,
				} as T;
			}
			throw parseError;
		}
	}
}

/**
 * Call Gemini API with the given prompts.
 */
export async function callGemini(
	systemPrompt: string,
	userPrompt: string,
	options?: {
		model?: string;
		maxTokens?: number;
		temperature?: number;
	},
): Promise<string> {
	const modelName = options?.model || GEMINI_MODEL;
	const maxTokens = options?.maxTokens || MAX_TOKENS;
	const temperature = options?.temperature ?? TEMPERATURE;

	const model = getGenAI().getGenerativeModel({
		model: modelName,
		generationConfig: {
			temperature,
			maxOutputTokens: maxTokens,
			responseMimeType: 'application/json',
		},
	});

	try {
		const result = await model.generateContent({
			contents: [
				{
					role: 'user',
					parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
				},
			],
		});
		const text = result.response.text();

		if (!text) {
			const finishReason = result.response.candidates?.[0]?.finishReason;
			console.error(
				`[callGemini] Empty response from Gemini. Candidates: ${JSON.stringify(result.response.candidates?.length)}, finishReason: ${finishReason}`,
			);
		}

		return text;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error(`[callGemini] API error: ${message.substring(0, 500)}`);
		logError(error instanceof Error ? error : new Error(message), {
			operation: 'ai.callGemini',
			metadata: { model: modelName },
		});
		throw error;
	}
}

export { GEMINI_MODEL };
