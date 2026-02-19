import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { getGeminiModel } from './config/gemini';
import { functionConfig } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';

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

/**
 * Extract title from HTML using regex
 */
function extractTitle(html: string): string {
	// Try <title> tag
	const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
	if (titleMatch && titleMatch[1]) {
		return titleMatch[1].trim();
	}

	// Try og:title meta tag
	const ogTitleMatch = html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i);
	if (ogTitleMatch && ogTitleMatch[1]) {
		return ogTitleMatch[1].trim();
	}

	// Try first h1
	const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
	if (h1Match && h1Match[1]) {
		return h1Match[1].trim();
	}

	return 'Untitled';
}

/**
 * Extract main content from HTML
 */
function extractContent(html: string): string {
	// Remove script and style tags
	let content = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
	content = content.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

	// Remove HTML tags
	content = content.replace(/<[^>]+>/g, ' ');

	// Decode HTML entities
	content = content.replace(/&nbsp;/g, ' ');
	content = content.replace(/&amp;/g, '&');
	content = content.replace(/&lt;/g, '<');
	content = content.replace(/&gt;/g, '>');
	content = content.replace(/&quot;/g, '"');

	// Clean up whitespace
	content = content.replace(/\s+/g, ' ').trim();

	// Limit content length for AI processing
	if (content.length > 5000) {
		content = content.substring(0, 5000);
	}

	return content;
}

/**
 * Fetch webpage and extract title and content
 */
async function fetchWebpage(
	url: string,
): Promise<{ title: string; content: string; domain: string }> {
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (compatible; Freedi/1.0; +https://freedi.tech)',
			},
		});

		if (!response.ok) {
			throw new Error(`Failed to fetch webpage: ${response.statusText}`);
		}

		const html = await response.text();

		// Extract title
		const title = extractTitle(html);

		// Extract content
		const content = extractContent(html);

		// Extract domain
		const urlObj = new URL(url);
		const domain = urlObj.hostname;

		return { title, content, domain };
	} catch (error) {
		logError(error, {
			operation: 'popperHebbian.summarizeLink.fetchWebpage',
			metadata: { url },
		});
		throw new HttpsError('internal', 'Failed to fetch webpage');
	}
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
			logError(error, {
				operation: 'popperHebbian.summarizeLink',
				userId: request.auth?.uid,
				metadata: { url },
			});
			throw new HttpsError('internal', 'Failed to process link');
		}
	},
);
