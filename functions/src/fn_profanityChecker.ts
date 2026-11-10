import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { GEMINI_MODEL, getGenAI } from './config/gemini';
import { functionConfig } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';
import { enforceCallableRateLimit } from './utils/rateLimit';
import { RATE_BUDGETS } from './config/rateBudgets';

// LLM-based profanity detection (see config/gemini.ts: OpenAI-backed today).
// Throws when the check cannot answer, so a caller can tell "clean" from "unknown".
export async function assessLanguage(text: string): Promise<boolean> {
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

	if (!response.candidates || response.candidates.length === 0) {
		throw new Error('Moderation returned no candidates');
	}

	const isFlagged = response.text().trim().toLowerCase().includes('true');
	console.info('Moderation verdict:', isFlagged);

	return isFlagged;
}

// Fail-open form, for the Agora language gate (agora/fn_agoraCheckLanguage.ts) and
// the callable below: an infrastructure error is our problem, not the author's.
export async function containsBadLanguage(text: string): Promise<boolean> {
	try {
		return await assessLanguage(text);
	} catch (error: unknown) {
		logError(error, { operation: 'profanityChecker.containsBadLanguage' });

		return false;
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
		if (!request.auth?.uid) {
			throw new HttpsError('unauthenticated', 'Sign in required');
		}
		const { text } = request.data;

		if (!text) {
			throw new HttpsError('invalid-argument', 'Text is required');
		}
		await enforceCallableRateLimit(request, RATE_BUDGETS.checkProfanity, request.auth.uid);

		try {
			const isBad = await containsBadLanguage(text);

			return { score: isBad ? 1 : 0 }; // mimic Perspective API style
		} catch (error) {
			logError(error, { operation: 'profanityChecker.checkProfanity' });

			return { score: null, error: 'AI call failed' };
		}
	},
);
