import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from './config/gemini';
import { functionConfig } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';

function getGenAI(): GoogleGenerativeAI {
	const apiKey = process.env.GOOGLE_API_KEY;
	if (!apiKey) {
		logError(new Error('GOOGLE_API_KEY missing (waiting for secret setup)'), {
			operation: 'profanityChecker.getGenAI',
		});
		throw new Error('Missing GOOGLE_API_KEY');
	}

	return new GoogleGenerativeAI(apiKey);
}

// Gemini-based profanity detection
async function containsBadLanguage(text: string): Promise<boolean> {
	try {
		const model = getGenAI().getGenerativeModel({ model: GEMINI_MODEL });

		const prompt = `
      Detect if the following text contains any offensive, hateful, or inappropriate language.
      Return only true or false. Text: "${text}"
    `;

		const result = await model.generateContent(prompt);
		const output = (await result.response.text()).trim().toLowerCase();

		console.info('🧠 Gemini response:', output);

		return output.includes('true');
	} catch (error) {
		logError(error, { operation: 'profanityChecker.containsBadLanguage' });

		return false; // fail-safe: allow text if Gemini fails
	}
}

interface CheckProfanityRequest {
	text: string;
}

interface CheckProfanityResponse {
	score: number | null;
	error?: string;
}

// Firebase Callable Function using Gemini (v2)
export const checkProfanity = onCall<CheckProfanityRequest>(
	{ region: functionConfig.region },
	async (request): Promise<CheckProfanityResponse> => {
		const { text } = request.data;

		if (!text) {
			throw new HttpsError('invalid-argument', 'Text is required');
		}

		try {
			const isBad = await containsBadLanguage(text);

			return { score: isBad ? 1 : 0 }; // mimic Perspective API style
		} catch (error) {
			logError(error, { operation: 'profanityChecker.checkProfanity' });

			return { score: null, error: 'AI call failed' };
		}
	},
);
