import { GoogleGenerativeAI } from '@google/generative-ai';

// Centralized model name - update here when Google releases new versions
// Current: gemini-2.5-flash (stable)
// Check for updates: https://ai.google.dev/gemini-api/docs/models/gemini
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Embedding model configuration
// See: https://ai.google.dev/gemini-api/docs/embeddings
export const EMBEDDING_MODEL = 'text-embedding-004';
export const EMBEDDING_DIMENSIONS = 768;

// Initialize Gemini AI
export function getGeminiModel() {
	const apiKey = process.env.GEMINI_API_KEY;

	if (!apiKey) {
		throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in .env');
	}

	const genAI = new GoogleGenerativeAI(apiKey);

	return genAI.getGenerativeModel({
		model: GEMINI_MODEL
	});
}

// Get embedding model for vector generation
export function getEmbeddingModel() {
	const apiKey = process.env.GEMINI_API_KEY;

	if (!apiKey) {
		throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in .env');
	}

	const genAI = new GoogleGenerativeAI(apiKey);

	return genAI.getGenerativeModel({
		model: EMBEDDING_MODEL
	});
}

// Helper for files that create their own GenAI instance
export function getGenAI() {
	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error('Gemini API key not configured. Please set GEMINI_API_KEY in .env');
	}
	
return new GoogleGenerativeAI(apiKey);
}
