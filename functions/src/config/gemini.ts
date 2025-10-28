import { GoogleGenerativeAI } from '@google/generative-ai';
import { defineSecret } from 'firebase-functions/params';

// Define the Gemini API key as a secret parameter
export const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Initialize Gemini AI
export function getGeminiModel() {
	const apiKey = geminiApiKey.value();

	if (!apiKey) {
		throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY secret.');
	}

	const genAI = new GoogleGenerativeAI(apiKey);

	// Use Gemini 2.0 Flash for fast, cost-effective responses
	return genAI.getGenerativeModel({
		model: 'gemini-2.0-flash-exp'
	});
}
