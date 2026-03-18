/**
 * Shared Gemini AI utilities
 *
 * Extracted from fn_versionAI.ts for reuse across multiple Firebase Functions.
 */

import { logError } from '../utils/errorHandling';

const GEMINI_MODEL = 'gemini-2.5-flash';
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
	const model = options?.model || GEMINI_MODEL;
	const maxTokens = options?.maxTokens || MAX_TOKENS;
	const temperature = options?.temperature ?? TEMPERATURE;

	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		console.error('[callGemini] GEMINI_API_KEY is NOT configured in environment');
		throw new Error('GEMINI_API_KEY not configured');
	}

	const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.substring(0, 8)}...`;
	console.info(`[callGemini] Calling model: ${model}, URL pattern: ${url}`);

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				contents: [
					{
						role: 'user',
						parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
					},
				],
				generationConfig: {
					temperature,
					maxOutputTokens: maxTokens,
					responseMimeType: 'application/json',
				},
			}),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		console.error(
			`[callGemini] API error: status=${response.status}, body=${errorText.substring(0, 500)}`,
		);
		logError(new Error(`Gemini API error: ${response.status}`), {
			operation: 'ai.callGemini',
			metadata: { status: response.status, errorText: errorText.substring(0, 500), model },
		});
		throw new Error(`Gemini API error: ${response.status} - ${errorText.substring(0, 200)}`);
	}

	const data = await response.json();
	const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

	if (!text) {
		console.error(
			`[callGemini] Empty response from Gemini. Candidates: ${JSON.stringify(data.candidates?.length)}, finishReason: ${data.candidates?.[0]?.finishReason}`,
		);
	}

	return text;
}

export { GEMINI_MODEL };
