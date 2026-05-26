import {
	VertexAI,
	type ModelParams,
	type GenerateContentRequest,
	type GenerateContentResponse,
} from '@google-cloud/vertexai';

// Centralized model name - update here when Google releases new versions
// Current: gemini-2.5-flash (stable)
// Check for updates: https://ai.google.dev/gemini-api/docs/models/gemini
export const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Vertex AI region. Default to me-west1 (Tel Aviv) to co-locate with the
// functions runtime; fall back to us-central1 automatically if the configured
// region rejects the request (e.g. model not yet available in that region).
const PRIMARY_LOCATION = process.env.VERTEX_LOCATION || 'me-west1';
const FALLBACK_LOCATION = 'us-central1';

let currentLocation = PRIMARY_LOCATION;
let triedFallback = false;
let cachedClient: VertexAI | null = null;

function getProjectId(): string {
	const explicit = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
	if (explicit) return explicit;
	const firebaseConfig = process.env.FIREBASE_CONFIG;
	if (firebaseConfig) {
		try {
			const parsed = JSON.parse(firebaseConfig);
			if (parsed.projectId) return parsed.projectId;
		} catch {
			// fall through
		}
	}
	throw new Error(
		'Unable to determine GCP project for Vertex AI (set GCLOUD_PROJECT or FIREBASE_CONFIG)',
	);
}

function getClient(): VertexAI {
	if (cachedClient) return cachedClient;
	cachedClient = new VertexAI({
		project: getProjectId(),
		location: currentLocation,
	});

	return cachedClient;
}

function shouldFallback(error: unknown): boolean {
	if (triedFallback) return false;
	if (currentLocation === FALLBACK_LOCATION) return false;
	const message = (error instanceof Error ? error.message : String(error)).toLowerCase();

	return (
		message.includes('not found') ||
		message.includes('not supported') ||
		message.includes('unavailable') ||
		message.includes('publisher model') ||
		message.includes('does not exist') ||
		message.includes('404')
	);
}

async function callWithRegionFallback<T>(fn: (client: VertexAI) => Promise<T>): Promise<T> {
	try {
		return await fn(getClient());
	} catch (error) {
		if (shouldFallback(error)) {
			triedFallback = true;
			currentLocation = FALLBACK_LOCATION;
			cachedClient = null;
			console.info(
				`[gemini] Vertex AI region ${PRIMARY_LOCATION} unavailable, falling back to ${FALLBACK_LOCATION}`,
			);

			return await fn(getClient());
		}
		throw error;
	}
}

// Compat shapes that preserve the @google/generative-ai SDK's surface so
// existing callers (which use `result.response.text()`) keep working.
export interface CompatGenerateContentResponse {
	text(): string;
	candidates?: GenerateContentResponse['candidates'];
	promptFeedback?: GenerateContentResponse['promptFeedback'];
	usageMetadata?: GenerateContentResponse['usageMetadata'];
}

export interface CompatGenerateContentResult {
	response: CompatGenerateContentResponse;
}

export interface CompatGenerativeModel {
	generateContent(
		request: GenerateContentRequest | string,
	): Promise<CompatGenerateContentResult>;
}

export interface CompatGenAI {
	getGenerativeModel(params: ModelParams): CompatGenerativeModel;
}

function wrapResponse(raw: GenerateContentResponse): CompatGenerateContentResponse {
	return {
		candidates: raw.candidates,
		promptFeedback: raw.promptFeedback,
		usageMetadata: raw.usageMetadata,
		text(): string {
			const parts = raw.candidates?.[0]?.content?.parts;
			if (!parts) return '';

			return parts
				.map((part) => (typeof part.text === 'string' ? part.text : ''))
				.join('');
		},
	};
}

function makeModel(params: ModelParams): CompatGenerativeModel {
	return {
		async generateContent(
			request: GenerateContentRequest | string,
		): Promise<CompatGenerateContentResult> {
			return callWithRegionFallback(async (client) => {
				const model = client.getGenerativeModel(params);
				const normalizedRequest: GenerateContentRequest =
					typeof request === 'string'
						? { contents: [{ role: 'user', parts: [{ text: request }] }] }
						: request;
				const result = await model.generateContent(normalizedRequest);

				return { response: wrapResponse(result.response) };
			});
		},
	};
}

// Initialize Gemini AI (default model, no extra config)
export function getGeminiModel(): CompatGenerativeModel {
	return makeModel({ model: GEMINI_MODEL });
}

// Helper for files that need to pass custom generationConfig per call
export function getGenAI(): CompatGenAI {
	return {
		getGenerativeModel(params: ModelParams): CompatGenerativeModel {
			return makeModel(params);
		},
	};
}
