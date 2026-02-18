import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from './config/gemini';

function getGenAI(): GoogleGenerativeAI {
	const apiKey = process.env.GOOGLE_API_KEY;
	if (!apiKey) throw new Error('Missing GOOGLE_API_KEY');

	return new GoogleGenerativeAI(apiKey);
}

export async function containsBadLanguage(text: string): Promise<boolean> {
	try {
		const model = getGenAI().getGenerativeModel({ model: GEMINI_MODEL });

		const prompt = `
      Detect if the following text contains any offensive, hateful, or inappropriate language. 
      Return only true or false. Text: "${text}"
    `;

		const result = await model.generateContent(prompt);
		const output = (await result.response.text()).trim().toLowerCase();

		return output.includes('true');
	} catch (error) {
		console.error('Error detecting bad language', error);

		return false; // fail-safe: allow text if error occurs
	}
}
