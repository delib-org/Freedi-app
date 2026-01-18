/**
 * AI-powered document version generation service
 *
 * Supports multiple AI providers (Gemini, OpenAI, Claude) for generating
 * document revisions based on public feedback.
 *
 * Uses the smartest available AI models for high-quality analysis:
 * - Gemini 3.0 Flash (default) - Excellent for nuanced document analysis
 * - GPT-4o - Strong alternative
 * - Claude 3.5 Sonnet - Excellent for detailed reasoning
 */

import {
	VersionChange,
	ChangeSource,
	Paragraph,
	ChangeType,
} from '@freedi/shared-types';
import {
	logError,
	withRetry,
	NetworkError,
} from '@/lib/utils/errorHandling';

// ============================================================================
// TYPES
// ============================================================================

export type AIProvider = 'gemini' | 'openai' | 'claude';

export interface AIConfig {
	provider: AIProvider;
	apiKey: string;
	model?: string;
	maxTokens?: number;
	temperature?: number;
}

export interface ParagraphAnalysisInput {
	paragraph: Paragraph;
	sources: ChangeSource[];
	approvalRate?: number;
}

export interface ParagraphAnalysisOutput {
	proposedContent: string;
	reasoning: string;
	confidence: number;
}

export interface DocumentSynthesisInput {
	originalParagraphs: Paragraph[];
	proposedChanges: Array<{
		paragraphId: string;
		originalContent: string;
		proposedContent: string;
	}>;
	documentTitle?: string;
}

export interface DocumentSynthesisOutput {
	paragraphs: Paragraph[];
	summary: string;
	changesSummary: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Extract and parse JSON from AI response
 * Handles common cases like markdown code blocks, extra text before/after JSON
 */
function extractJSON<T>(response: string, fallback?: T): T {
	let cleanedResponse = response.trim();

	// Log the raw response for debugging (first 500 chars)
	console.info('[extractJSON] Raw response (first 500 chars):', cleanedResponse.substring(0, 500));

	// Remove markdown code blocks (```json ... ``` or ``` ... ```)
	const codeBlockMatch = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (codeBlockMatch) {
		cleanedResponse = codeBlockMatch[1].trim();
	}

	// Try to find JSON object or array in the response
	const jsonMatch = cleanedResponse.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
	if (jsonMatch) {
		cleanedResponse = jsonMatch[1];
	}

	try {
		// Parse the cleaned JSON
		return JSON.parse(cleanedResponse);
	} catch (parseError) {
		console.error('[extractJSON] Parse error:', parseError);
		console.error('[extractJSON] Cleaned response:', cleanedResponse.substring(0, 1000));

		// If we have a fallback, return it
		if (fallback !== undefined) {
			return fallback;
		}

		// Try to fix common truncation issues
		// Add missing closing braces/brackets
		let fixedResponse = cleanedResponse;
		const openBraces = (fixedResponse.match(/\{/g) || []).length;
		const closeBraces = (fixedResponse.match(/\}/g) || []).length;
		const openBrackets = (fixedResponse.match(/\[/g) || []).length;
		const closeBrackets = (fixedResponse.match(/\]/g) || []).length;

		// Add missing closing brackets/braces
		for (let i = 0; i < openBrackets - closeBrackets; i++) {
			fixedResponse += ']';
		}
		for (let i = 0; i < openBraces - closeBraces; i++) {
			fixedResponse += '}';
		}

		try {
			console.info('[extractJSON] Attempting fixed response');
			return JSON.parse(fixedResponse);
		} catch {
			// Try to extract partial content for paragraph analysis responses
			// This handles truncated JSON by extracting what we can
			const proposedContentMatch = cleanedResponse.match(/"proposedContent"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/);
			if (proposedContentMatch) {
				console.info('[extractJSON] Recovered proposedContent from truncated response');
				return {
					proposedContent: proposedContentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
					reasoning: 'Response was truncated - partial recovery',
					confidence: 0.7,
				} as T;
			}

			// Re-throw original error
			throw parseError;
		}
	}
}

// ============================================================================
// PROMPTS
// ============================================================================

const PARAGRAPH_ANALYSIS_SYSTEM_PROMPT = `You are an expert document editor helping to revise documents based on democratic public feedback.

Your role is to:
1. Carefully analyze the original paragraph and all feedback (suggestions and comments)
2. Understand what changes the community is requesting through their feedback
3. Propose a revised version that incorporates the most impactful and supported feedback
4. Maintain the document's original intent, tone, and professional quality
5. Make targeted, meaningful changes - neither too conservative nor too aggressive

Guidelines:
- PRIORITIZE feedback with higher impact scores (these represent community consensus)
- Preserve the original meaning unless feedback specifically requests changes
- Use clear, professional language appropriate to the document's context
- If feedback is contradictory, favor the higher-impact suggestions
- If no changes are warranted, return the original content unchanged

CRITICAL - Your reasoning MUST:
- Explicitly reference which feedback items you incorporated and why
- Explain why you chose to address certain feedback over others
- If you made no changes, explain why the existing text is already adequate
- Be specific about what words/phrases you changed and the rationale

LANGUAGE REQUIREMENT:
- ALWAYS respond in the SAME LANGUAGE as the original document content
- If the document is in Hebrew, your reasoning and all text must be in Hebrew
- If the document is in English, respond in English
- Match the document's language exactly`;

const PARAGRAPH_ANALYSIS_USER_PROMPT = `
Analyze this paragraph and the public feedback, then propose a revision.

**Original Paragraph:**
{originalContent}

**Public Feedback (sorted by impact score - higher means more community support):**
{feedbackList}

**Paragraph Approval Rate:** {approvalRate}%

Respond in JSON format:
{
  "proposedContent": "Your revised paragraph text (or original if no changes needed)",
  "reasoning": "Detailed explanation including: 1) Which feedback items you incorporated, 2) Why you prioritized certain feedback, 3) Specific changes made and why, 4) Why you rejected any feedback (if applicable)",
  "confidence": 0.85
}

IMPORTANT:
- The "reasoning" field is shown to administrators - make it clear and actionable
- Reference feedback items by their number (e.g., "Incorporated suggestion #1 because...")
- Explain trade-offs when feedback is contradictory
- Confidence should reflect how certain you are about the proposed changes (0.0-1.0)
- RESPOND IN THE SAME LANGUAGE AS THE ORIGINAL PARAGRAPH - if it's Hebrew, respond in Hebrew
`;

const DOCUMENT_SYNTHESIS_SYSTEM_PROMPT = `You are an expert document editor performing a final review of proposed document changes based on community feedback.

Your role is to:
1. Review all proposed changes for consistency and coherence
2. Ensure the document flows naturally after incorporating changes
3. Resolve any contradictions between paragraphs
4. Maintain consistent tone and style throughout
5. Generate a clear, detailed summary of all changes made

Guidelines:
- Preserve the original document structure
- Only make minimal adjustments for cross-paragraph consistency
- Keep all paragraph IDs intact
- Create summaries that administrators can use to understand the version at a glance

The summary you provide will be shown to administrators and should:
- Highlight the most significant changes
- Explain the overall direction of the revision
- Note how many paragraphs were modified and why

LANGUAGE REQUIREMENT:
- ALWAYS respond in the SAME LANGUAGE as the document content
- If the document is in Hebrew, your summary and all text must be in Hebrew
- If the document is in English, respond in English
- Match the document's language exactly`;

const DOCUMENT_SYNTHESIS_USER_PROMPT = `
Review these proposed document changes and ensure consistency across the entire document.

**Original Document:**
{originalDocument}

**Proposed Changes (based on community feedback):**
{proposedChanges}

Respond in JSON format:
{
  "changedParagraphs": [
    {"paragraphId": "id", "content": "final revised content"}
  ],
  "summary": "A 2-3 sentence executive summary of this version's changes",
  "changesSummary": ["Brief description of each change"]
}

IMPORTANT:
- ONLY include paragraphs in "changedParagraphs" that were actually modified
- Do NOT include unchanged paragraphs in the response
- Keep paragraph IDs exactly as provided
- Keep your response concise to avoid truncation
`;

// ============================================================================
// AI PROVIDER IMPLEMENTATIONS
// ============================================================================

// AI retry configuration
const AI_RETRY_OPTIONS = {
	maxRetries: 3,
	delayMs: 1000,
	exponentialBackoff: true,
};

async function callOpenAI(
	systemPrompt: string,
	userPrompt: string,
	config: AIConfig
): Promise<string> {
	// Use GPT-4o as default - a smart model for quality analysis
	const model = config.model || 'gpt-4o';
	const maxTokens = config.maxTokens || 8192;
	const temperature = config.temperature || 0.3;

	const response = await fetch('https://api.openai.com/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.apiKey}`,
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt },
			],
			max_tokens: maxTokens,
			temperature,
			response_format: { type: 'json_object' },
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new NetworkError(`OpenAI API error: ${response.status}`, {
			status: response.status,
			error: errorText,
			model,
		});
	}

	const data = await response.json();

	return data.choices[0]?.message?.content || '';
}

async function callClaude(
	systemPrompt: string,
	userPrompt: string,
	config: AIConfig
): Promise<string> {
	// Use Claude 3.5 Sonnet as default - excellent for nuanced document analysis
	const model = config.model || 'claude-3-5-sonnet-20241022';
	const maxTokens = config.maxTokens || 8192;
	const temperature = config.temperature || 0.3;

	const response = await fetch('https://api.anthropic.com/v1/messages', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'x-api-key': config.apiKey,
			'anthropic-version': '2023-06-01',
		},
		body: JSON.stringify({
			model,
			max_tokens: maxTokens,
			system: systemPrompt,
			messages: [{ role: 'user', content: userPrompt }],
			temperature,
		}),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new NetworkError(`Claude API error: ${response.status}`, {
			status: response.status,
			error: errorText,
			model,
		});
	}

	const data = await response.json();

	return data.content[0]?.text || '';
}

async function callGemini(
	systemPrompt: string,
	userPrompt: string,
	config: AIConfig
): Promise<string> {
	// Use Gemini 3.0 Flash as default - excellent for document analysis
	const model = config.model || 'gemini-3.0-flash';
	const maxTokens = config.maxTokens || 8192;
	const temperature = config.temperature || 0.3;

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${config.apiKey}`,
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				contents: [
					{
						role: 'user',
						parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
					},
				],
				generationConfig: {
					temperature,
					maxOutputTokens: maxTokens,
					responseMimeType: 'application/json',
				},
			}),
		}
	);

	if (!response.ok) {
		const errorText = await response.text();
		console.error(`[Gemini API] Error ${response.status} for model ${model}:`, errorText);
		throw new NetworkError(`Gemini API error: ${response.status}`, {
			status: response.status,
			error: errorText,
			model,
		});
	}

	const data = await response.json();

	return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

async function callAIRaw(
	systemPrompt: string,
	userPrompt: string,
	config: AIConfig
): Promise<string> {
	switch (config.provider) {
		case 'gemini':
			return callGemini(systemPrompt, userPrompt, config);
		case 'openai':
			return callOpenAI(systemPrompt, userPrompt, config);
		case 'claude':
			return callClaude(systemPrompt, userPrompt, config);
		default:
			throw new Error(`Unsupported AI provider: ${config.provider}`);
	}
}

/**
 * Call AI with retry logic for transient failures
 */
async function callAI(
	systemPrompt: string,
	userPrompt: string,
	config: AIConfig,
	operation: string
): Promise<string> {
	return withRetry(
		() => callAIRaw(systemPrompt, userPrompt, config),
		AI_RETRY_OPTIONS,
		{ operation, metadata: { provider: config.provider, model: config.model } }
	);
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Get the default AI configuration from environment variables
 * Priority: Gemini (smartest) > OpenAI > Claude
 */
export function getDefaultAIConfig(): AIConfig {
	const provider = (process.env.AI_PROVIDER as AIProvider) || 'gemini';

	let apiKey = '';
	switch (provider) {
		case 'gemini':
			apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || '';
			break;
		case 'openai':
			apiKey = process.env.OPENAI_API_KEY || '';
			break;
		case 'claude':
			apiKey = process.env.ANTHROPIC_API_KEY || '';
			break;
	}

	return {
		provider,
		apiKey,
	};
}

/**
 * Check if AI is configured and available
 */
export function isAIConfigured(): boolean {
	const config = getDefaultAIConfig();

	return !!config.apiKey;
}

/**
 * Format feedback sources for the AI prompt
 */
function formatFeedback(sources: ChangeSource[]): string {
	if (sources.length === 0) {
		return 'No feedback received for this paragraph.';
	}

	return sources
		.map((source, index) => {
			const type = source.type === 'suggestion' ? 'Suggestion' : 'Comment';
			const support =
				source.supporters > 0 || source.objectors > 0
					? ` (${source.supporters} supporters, ${source.objectors} objectors)`
					: '';

			return `${index + 1}. [${type}] (Impact: ${source.impact.toFixed(2)}${support})
   "${source.content}"
   - By: ${source.creatorDisplayName}`;
		})
		.join('\n\n');
}

/**
 * Analyze a single paragraph and generate a proposed revision
 */
export async function analyzeParagraph(
	input: ParagraphAnalysisInput,
	config?: AIConfig
): Promise<ParagraphAnalysisOutput> {
	const aiConfig = config || getDefaultAIConfig();

	if (!aiConfig.apiKey) {
		throw new Error('AI API key not configured');
	}

	// If no sources with significant impact, return original
	if (input.sources.length === 0) {
		return {
			proposedContent: input.paragraph.content || '',
			reasoning: 'No significant feedback to address.',
			confidence: 1.0,
		};
	}

	const userPrompt = PARAGRAPH_ANALYSIS_USER_PROMPT.replace(
		'{originalContent}',
		input.paragraph.content || ''
	)
		.replace('{feedbackList}', formatFeedback(input.sources))
		.replace(
			'{approvalRate}',
			input.approvalRate !== undefined ? input.approvalRate.toFixed(0) : 'N/A'
		);

	try {
		const response = await callAI(
			PARAGRAPH_ANALYSIS_SYSTEM_PROMPT,
			userPrompt,
			aiConfig,
			'ai.analyzeParagraph'
		);

		const parsed = extractJSON<{
			proposedContent?: string;
			reasoning?: string;
			confidence?: number;
		}>(response);

		return {
			proposedContent: parsed.proposedContent || input.paragraph.content || '',
			reasoning: parsed.reasoning || 'AI analysis completed.',
			confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
		};
	} catch (error) {
		logError(error, {
			operation: 'ai.analyzeParagraph',
			paragraphId: input.paragraph.paragraphId,
			metadata: {
				sourcesCount: input.sources.length,
				provider: config?.provider || 'default',
			},
		});

		// Return original on error with clear explanation
		return {
			proposedContent: input.paragraph.content || '',
			reasoning: 'AI analysis encountered an error. The original content has been preserved. An administrator should review this paragraph manually.',
			confidence: 0.0,
		};
	}
}

/**
 * Synthesize all changes and ensure document consistency
 */
export async function synthesizeDocument(
	input: DocumentSynthesisInput,
	config?: AIConfig
): Promise<DocumentSynthesisOutput> {
	const aiConfig = config || getDefaultAIConfig();

	if (!aiConfig.apiKey) {
		throw new Error('AI API key not configured');
	}

	// Format original document
	const originalDocument = input.originalParagraphs
		.map(
			(p, i) =>
				`[${i + 1}] (ID: ${p.paragraphId}, Type: ${p.type})
${p.content || '(empty)'}`
		)
		.join('\n\n');

	// Format proposed changes
	const proposedChanges = input.proposedChanges
		.map(
			(change) =>
				`Paragraph ID: ${change.paragraphId}
Original: "${change.originalContent}"
Proposed: "${change.proposedContent}"`
		)
		.join('\n\n---\n\n');

	const userPrompt = DOCUMENT_SYNTHESIS_USER_PROMPT.replace(
		'{originalDocument}',
		originalDocument
	).replace('{proposedChanges}', proposedChanges);

	try {
		const response = await callAI(
			DOCUMENT_SYNTHESIS_SYSTEM_PROMPT,
			userPrompt,
			aiConfig,
			'ai.synthesizeDocument'
		);

		const parsed = extractJSON<{
			changedParagraphs?: Array<{ paragraphId: string; content?: string }>;
			paragraphs?: Array<{ paragraphId: string; content?: string }>; // backwards compat
			summary?: string;
			changesSummary?: string[];
		}>(response);

		// Use changedParagraphs (new) or paragraphs (old format) for backwards compatibility
		const aiChangedParagraphs = parsed.changedParagraphs || parsed.paragraphs || [];

		// Merge AI output with original paragraph structure
		const paragraphs = input.originalParagraphs.map((original) => {
			const aiParagraph = aiChangedParagraphs.find(
				(p: { paragraphId: string }) => p.paragraphId === original.paragraphId
			);

			if (aiParagraph) {
				return {
					...original,
					content: aiParagraph.content || original.content,
				};
			}

			return original;
		});

		return {
			paragraphs,
			summary: parsed.summary || 'Document revision completed based on community feedback.',
			changesSummary: parsed.changesSummary || [],
		};
	} catch (error) {
		logError(error, {
			operation: 'ai.synthesizeDocument',
			metadata: {
				paragraphCount: input.originalParagraphs.length,
				changesCount: input.proposedChanges.length,
				provider: config?.provider || 'default',
			},
		});

		// Return original with proposed changes applied (graceful degradation)
		const paragraphs = input.originalParagraphs.map((original) => {
			const change = input.proposedChanges.find(
				(c) => c.paragraphId === original.paragraphId
			);

			if (change) {
				return {
					...original,
					content: change.proposedContent,
				};
			}

			return original;
		});

		return {
			paragraphs,
			summary: `Document revision completed with ${input.proposedChanges.length} changes. Note: Cross-paragraph consistency check was skipped due to an error.`,
			changesSummary: input.proposedChanges.map(
				(c) => `Paragraph ${c.paragraphId}: Updated based on community feedback`
			),
		};
	}
}

/**
 * Process all changes for a version
 * This is the main entry point for AI-based version generation
 */
export async function processVersionChanges(
	changes: VersionChange[],
	paragraphs: Paragraph[],
	config?: AIConfig
): Promise<{
	updatedChanges: VersionChange[];
	updatedParagraphs: Paragraph[];
	summary: string;
}> {
	const aiConfig = config || getDefaultAIConfig();

	// Step 1: Analyze each paragraph with feedback
	const changesNeedingAI = changes.filter(
		(c) => c.changeType !== ChangeType.unchanged && c.sources.length > 0
	);

	const analysisResults: Array<{
		changeId: string;
		paragraphId: string;
		result: ParagraphAnalysisOutput;
	}> = [];

	for (const change of changesNeedingAI) {
		const paragraph = paragraphs.find((p) => p.paragraphId === change.paragraphId);

		if (!paragraph) continue;

		const result = await analyzeParagraph(
			{
				paragraph,
				sources: change.sources,
			},
			aiConfig
		);

		analysisResults.push({
			changeId: change.changeId,
			paragraphId: change.paragraphId,
			result,
		});
	}

	// Step 2: Update changes with AI proposals
	const updatedChanges = changes.map((change) => {
		const analysis = analysisResults.find((a) => a.changeId === change.changeId);

		if (analysis) {
			return {
				...change,
				proposedContent: analysis.result.proposedContent,
				aiReasoning: analysis.result.reasoning,
			};
		}

		return change;
	});

	// Step 3: Synthesize document (optional - for consistency check)
	const proposedChanges = analysisResults
		.filter((a) => a.result.proposedContent !== paragraphs.find((p) => p.paragraphId === a.paragraphId)?.content)
		.map((a) => {
			const original = paragraphs.find((p) => p.paragraphId === a.paragraphId);

			return {
				paragraphId: a.paragraphId,
				originalContent: original?.content || '',
				proposedContent: a.result.proposedContent,
			};
		});

	let summary = 'Version generated based on public feedback.';
	let updatedParagraphs = paragraphs;

	if (proposedChanges.length > 0) {
		try {
			const synthesis = await synthesizeDocument(
				{
					originalParagraphs: paragraphs,
					proposedChanges,
				},
				aiConfig
			);

			updatedParagraphs = synthesis.paragraphs;
			summary = synthesis.summary;
		} catch (error) {
			logError(error, {
				operation: 'ai.processVersionChanges.synthesis',
				metadata: {
					changesCount: proposedChanges.length,
					provider: aiConfig.provider,
				},
			});

			// Apply changes without synthesis (graceful degradation)
			updatedParagraphs = paragraphs.map((p) => {
				const change = proposedChanges.find((c) => c.paragraphId === p.paragraphId);

				if (change) {
					return { ...p, content: change.proposedContent };
				}

				return p;
			});

			summary = `Version generated with ${proposedChanges.length} changes based on community feedback. Individual paragraphs were analyzed but cross-document consistency check was skipped.`;
		}
	}

	return {
		updatedChanges,
		updatedParagraphs,
		summary,
	};
}
