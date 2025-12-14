import { GoogleGenerativeAI } from '@google/generative-ai';
import { defineSecret } from 'firebase-functions/params';

// Define the Gemini API key as a secret parameter
export const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Centralized model name - update here when Google releases new versions
// Current: gemini-2.5-flash (as of Dec 2024)
// Check for updates: https://ai.google.dev/gemini-api/docs/models/gemini
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Initialize Gemini AI
export function getGeminiModel() {
	const apiKey = geminiApiKey.value();

	if (!apiKey) {
		throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY secret.');
	}

	const genAI = new GoogleGenerativeAI(apiKey);

	return genAI.getGenerativeModel({
		model: GEMINI_MODEL
	});
}

// Helper for files that create their own GenAI instance
export function getGenAI() {
	const apiKey = geminiApiKey.value();
	if (!apiKey) {
		throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY secret.');
	}
	return new GoogleGenerativeAI(apiKey);
}
