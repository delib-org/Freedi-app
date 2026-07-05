/**
 * LLM access layer (OpenAI-backed).
 *
 * Historically this file wrapped Google Gemini / Vertex AI. The Gemini API key
 * was compromised and Google blocked access, so the implementation now delegates
 * to OpenAI via `callLLM()` (concurrency limiting + retry/backoff + JSON mode).
 *
 * The exported surface (`getGeminiModel`, `getGenAI`, `GEMINI_MODEL`, and the
 * `Compat*` types) is preserved so the ~18 existing callers keep working
 * unchanged. The `model` string callers pass is now an OpenAI model id.
 */
import { callLLM } from './openai-chat';

// Model tiers. Both overridable via env vars.
//   - gpt-4o      : heavy reasoning (version AI, integration/synthesis)
//   - gpt-4o-mini : high-volume tasks (moderation, classification, summarization)
export const LLM_MODEL_HEAVY = process.env.OPENAI_HEAVY_MODEL || 'gpt-4o';
export const LLM_MODEL_FAST = process.env.OPENAI_FAST_MODEL || 'gpt-4o-mini';

// Back-compat alias: existing callers pass `GEMINI_MODEL`; it now resolves to the
// fast OpenAI model. `GEMINI_MODEL` (or `OPENAI_FAST_MODEL`) env still overrides.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || LLM_MODEL_FAST;

// Gemini allowed large outputs by default; `callLLM` defaults to only 1024. Use a
// generous fallback when a caller doesn't set `maxOutputTokens`, so summaries and
// JSON responses are not silently truncated.
const DEFAULT_MAX_OUTPUT_TOKENS = 8192;

// ---------------------------------------------------------------------------
// Compat shapes that preserve the @google/generative-ai SDK surface so existing
// callers (which use `result.response.text()` and inspect `candidates`) work.
// ---------------------------------------------------------------------------

interface CompatPart {
	text?: string;
}

interface CompatContent {
	role?: string;
	parts: CompatPart[];
}

interface CompatGenerationConfig {
	temperature?: number;
	maxOutputTokens?: number;
	responseMimeType?: string;
}

export interface CompatModelParams {
	model: string;
	generationConfig?: CompatGenerationConfig;
	systemInstruction?: string | { parts?: CompatPart[] };
	// Accept-and-ignore any other legacy fields (e.g. safetySettings) so callers
	// that still pass them compile without changes.
	[key: string]: unknown;
}

interface CompatCandidate {
	finishReason: string;
	content: { parts: CompatPart[] };
}

export interface CompatGenerateContentResponse {
	text(): string;
	candidates?: CompatCandidate[];
}

export interface CompatGenerateContentResult {
	response: CompatGenerateContentResponse;
}

export interface CompatGenerateContentRequest {
	contents: CompatContent[];
	systemInstruction?: string | { parts?: CompatPart[] };
	generationConfig?: CompatGenerationConfig;
	// Accept-and-ignore any other legacy per-request fields (e.g. safetySettings).
	[key: string]: unknown;
}

export interface CompatGenerativeModel {
	generateContent(
		request: CompatGenerateContentRequest | string,
	): Promise<CompatGenerateContentResult>;
}

export interface CompatGenAI {
	getGenerativeModel(params: CompatModelParams): CompatGenerativeModel;
}

function partsToText(parts?: CompatPart[]): string {
	if (!parts) return '';

	return parts.map((part) => (typeof part.text === 'string' ? part.text : '')).join('');
}

function systemInstructionToText(
	instruction: CompatModelParams['systemInstruction'],
): string | undefined {
	if (!instruction) return undefined;
	if (typeof instruction === 'string') return instruction;

	return partsToText(instruction.parts);
}

function wrapText(text: string): CompatGenerateContentResult {
	return {
		response: {
			text: () => text,
			candidates: [
				{
					finishReason: 'STOP',
					content: { parts: [{ text }] },
				},
			],
		},
	};
}

function makeModel(params: CompatModelParams): CompatGenerativeModel {
	const model = params.model || GEMINI_MODEL;
	const generationConfig = params.generationConfig;
	const modelSystemInstruction = systemInstructionToText(params.systemInstruction);

	return {
		async generateContent(
			request: CompatGenerateContentRequest | string,
		): Promise<CompatGenerateContentResult> {
			let user: string;
			let requestSystem: string | undefined;
			let requestConfig: CompatGenerationConfig | undefined;

			if (typeof request === 'string') {
				user = request;
			} else {
				user = (request.contents || [])
					.map((content) => partsToText(content.parts))
					.filter(Boolean)
					.join('\n\n');
				requestSystem = systemInstructionToText(request.systemInstruction);
				requestConfig = request.generationConfig;
			}

			// Per-request generationConfig overrides the model-level config.
			const config: CompatGenerationConfig = { ...generationConfig, ...requestConfig };

			const text = await callLLM({
				model,
				system: requestSystem ?? modelSystemInstruction,
				user,
				temperature: config.temperature,
				maxTokens: config.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
				jsonMode: config.responseMimeType === 'application/json',
			});

			return wrapText(text);
		},
	};
}

// Default model (fast tier), no extra config.
export function getGeminiModel(): CompatGenerativeModel {
	return makeModel({ model: GEMINI_MODEL });
}

// Helper for callers that need to pass custom generationConfig / model per call.
export function getGenAI(): CompatGenAI {
	return {
		getGenerativeModel(params: CompatModelParams): CompatGenerativeModel {
			return makeModel(params);
		},
	};
}
