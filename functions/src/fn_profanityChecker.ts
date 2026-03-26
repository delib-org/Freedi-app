import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from './config/gemini';
import { functionConfig } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';

function getGenAI(): GoogleGenerativeAI {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		logError(new Error('GEMINI_API_KEY missing (waiting for secret setup)'), {
			operation: 'profanityChecker.getGenAI',
		});
		throw new Error('Missing GEMINI_API_KEY');
	}

	return new GoogleGenerativeAI(apiKey);
}

// Gemini-based profanity detection
async function containsBadLanguage(text: string): Promise<boolean> {
	try {
		const model = getGenAI().getGenerativeModel({ model: GEMINI_MODEL });

		const prompt = `
      You are a content moderator for a collaborative discussion platform.
      You must moderate content in ALL languages including Hebrew, Arabic, English, Spanish, German, and Dutch.

      Flag the text as inappropriate ONLY if it contains ANY of these:
      - Profanity, curse words, or vulgar language (in any language)
      - Direct slurs or derogatory terms targeting individuals
      - Direct personal attacks, insults, name-calling, or belittling language — even indirect. Examples in multiple languages:
        English: "idiots", "fools", "stupid people", "moron", "shut up"
        Hebrew: "טיפשים", "מטומטם", "אידיוט", "תפסיק להיות אידיוט", "טמבל", "דביל"
        Arabic: "أغبياء", "غبي", "حمار"
      - Sexually explicit or suggestive content
      - Direct threats of violence or incitement to harm specific people

      Political opinions, policy positions, and controversial viewpoints are ALWAYS ALLOWED, even if unpopular or provocative.
      Opinions about territorial policy, immigration, ethnic relations, security, or any political topic are ALLOWED.
      Genuine opinions and disagreements are ALLOWED. Insults disguised as opinions are NOT.
      Everyday language describing real-world problems is ALLOWED, even if it mentions bodily functions, waste, mess, etc.
      Only flag content that is clearly and intentionally offensive, hateful, or abusive. When in doubt, ALWAYS allow the content.

      Return only true or false. Text: "${text}"
    `;

		const result = await model.generateContent(prompt);
		const response = result.response;

		// Check if Gemini's safety filters blocked the content
		if (!response.candidates || response.candidates.length === 0) {
			console.info('Content blocked by Gemini safety filters');

			return true;
		}

		const output = response.text().trim().toLowerCase();
		console.info('Gemini moderation response:', output);

		return output.includes('true');
	} catch (error: unknown) {
		// Any error (safety block, network, etc.) — treat as inappropriate
		const message = error instanceof Error ? error.message : String(error);
		if (message.includes('SAFETY') || message.includes('blocked') || message.includes('harm')) {
			console.info('Content blocked by Gemini safety filters (exception)', { message });
		} else {
			logError(error, { operation: 'profanityChecker.containsBadLanguage' });
		}

		return true; // fail-closed: block text if Gemini fails
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
