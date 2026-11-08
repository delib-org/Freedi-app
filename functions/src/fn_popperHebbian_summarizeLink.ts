import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getGeminiModel } from './config/gemini';
import { functionConfig } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';
import { fetchLinkText } from './agora/materialsExtract';
import { enforceCallableRateLimit } from './utils/rateLimit';
import { RATE_BUDGETS } from './config/rateBudgets';

interface SummarizeLinkRequest {
	url: string;
	language?: string; // User's interface language (e.g., 'en', 'he', 'es', 'ar')
}

interface SummarizeLinkResponse {
	url: string;
	title: string;
	summary: string;
	domain: string;
}

/** Page text passed to the model. Enough for a summary, and it bounds the prompt. */
const MAX_SOURCE_CHARS = 5000;
const UNTITLED = 'Untitled';

/**
 * Fetch a webpage and extract its title and text through `fetchLinkText`, which
 * blocks private addresses, re-checks every redirect, and caps time and size.
 * The caller chooses this URL, so a plain fetch here would reach internal hosts.
 */
async function fetchWebpage(
	url: string,
): Promise<{ title: string; content: string; domain: string }> {
	const fetched = await fetchLinkText(url, MAX_SOURCE_CHARS);
	if (!fetched.ok) {
		if (fetched.reason === 'link_invalid') {
			throw new HttpsError('invalid-argument', 'Invalid URL format');
		}
		logError(new Error(`Link not fetched: ${fetched.reason}`), {
			operation: 'popperHebbian.summarizeLink.fetchWebpage',
			metadata: { url, reason: fetched.reason },
		});
		throw new HttpsError('internal', 'Failed to fetch webpage');
	}

	return {
		title: fetched.value.title?.trim() || UNTITLED,
		content: fetched.value.text,
		domain: new URL(url).hostname,
	};
}

/**
 * Get language name for AI prompt
 */
function getLanguageName(code: string): string {
	const languages: Record<string, string> = {
		en: 'English',
		he: 'Hebrew',
		es: 'Spanish',
		ar: 'Arabic',
		fr: 'French',
		de: 'German',
		it: 'Italian',
		pt: 'Portuguese',
		ru: 'Russian',
		zh: 'Chinese',
		ja: 'Japanese',
		ko: 'Korean',
		nl: 'Dutch',
	};

	return languages[code] || 'English';
}

/**
 * Use AI to summarize webpage content in the user's language
 */
async function summarizeContent(
	title: string,
	content: string,
	language: string = 'en',
): Promise<string> {
	try {
		const model = getGeminiModel();
		const languageName = getLanguageName(language);

		const prompt = `Summarize the main points of this webpage in 2-3 concise sentences IN ${languageName}. Focus on the key information that would be relevant for someone evaluating evidence in a discussion.

IMPORTANT: Your response must be written entirely in ${languageName}, even if the source content is in a different language.

Title: ${title}

Content: ${content}

Provide a clear, objective summary in ${languageName}:`;

		const result = await model.generateContent(prompt);
		const summary = result.response.text().trim();

		return summary;
	} catch (error) {
		logError(error, { operation: 'popperHebbian.summarizeLink.summarizeContent' });
		// Return a basic fallback if AI fails

		return `Article from this webpage. Click to read more.`;
	}
}

/**
 * Callable function to fetch and summarize a link
 */
export const summarizeLink = onCall<SummarizeLinkRequest>(
	{
		region: functionConfig.region,
	},
	async (request): Promise<SummarizeLinkResponse> => {
		// Require authentication
		if (!request.auth) {
			throw new HttpsError('unauthenticated', 'User must be authenticated');
		}

		const { url, language = 'en' } = request.data;

		console.info('[summarizeLink] Request received:', { url, language, userId: request.auth.uid });

		if (!url) {
			throw new HttpsError('invalid-argument', 'URL is required');
		}

		// Validate URL
		try {
			new URL(url);
		} catch {
			throw new HttpsError('invalid-argument', 'Invalid URL format');
		}

		await enforceCallableRateLimit(request, RATE_BUDGETS.summarizeLink, request.auth.uid);

		try {
			// 1. Fetch webpage
			const { title, content, domain } = await fetchWebpage(url);
			console.info('[summarizeLink] Webpage fetched:', { title, domain });

			// 2. Summarize with AI in user's language
			const summary = await summarizeContent(title, content, language);
			console.info(
				'[summarizeLink] Summary generated in language:',
				language,
				'Summary length:',
				summary.length,
			);

			return {
				url,
				title,
				summary,
				domain,
			};
		} catch (error) {
			if (error instanceof HttpsError) throw error;
			logError(error, {
				operation: 'popperHebbian.summarizeLink',
				userId: request.auth?.uid,
				metadata: { url },
			});
			throw new HttpsError('internal', 'Failed to process link');
		}
	},
);
