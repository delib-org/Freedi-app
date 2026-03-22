import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from './config/gemini';
import { logError } from './utils/errorHandling';

function getGenAI(): GoogleGenerativeAI {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

	return new GoogleGenerativeAI(apiKey);
}

export async function containsBadLanguage(text: string): Promise<boolean> {
	try {
		const model = getGenAI().getGenerativeModel({ model: GEMINI_MODEL });

		const prompt = `
      Detect if the following text contains clearly offensive, hateful, or abusive language (direct slurs, personal attacks, direct threats of violence, sexually explicit content).
      Political opinions, policy positions, and controversial viewpoints are NOT offensive — even if unpopular or provocative.
      Everyday language describing real-world problems is NOT offensive, even if it mentions bodily functions, waste, mess, etc.
      Only return true for content that is clearly and intentionally harmful. When in doubt, return false.
      Return only true or false. Text: "${text}"
    `;

		const result = await model.generateContent(prompt);
		const output = (await result.response.text()).trim().toLowerCase();

		return output.includes('true');
	} catch (error) {
		logError(error, { operation: 'containsBadLanguage.detect' });

		return false; // fail-safe: allow text if error occurs
	}
}
