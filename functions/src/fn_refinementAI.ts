/**
 * Firebase Function for Suggestion Refinement AI
 *
 * Two operations:
 * 1. Synthesize: Combine top suggestions into a single AI-generated suggestion
 * 2. Improve: Improve a suggestion based on community comments
 */

import { Request, Response } from 'firebase-functions/v1';
import { logError } from './utils/errorHandling';
import { callGemini, extractJSON, GEMINI_MODEL } from './ai/callGemini';

// ============================================================================
// TYPES
// ============================================================================

interface SuggestionInput {
	suggestionId: string;
	suggestedContent: string;
	consensus: number;
	creatorDisplayName: string;
}

interface CommentInput {
	commentId: string;
	content: string;
	consensus: number;
	creatorDisplayName: string;
}

interface SynthesizeRequest {
	operation: 'synthesize';
	paragraphId: string;
	originalContent: string;
	suggestions: SuggestionInput[];
}

interface ImproveRequest {
	operation: 'improve';
	suggestionId: string;
	suggestionContent: string;
	comments: CommentInput[];
	originalParagraphContent: string;
}

interface SynthesizeOutput {
	synthesizedText: string;
	reasoning: string;
	sourceSuggestionIds: string[];
}

interface ImproveOutput {
	improvedText: string;
	changes: Array<{ description: string; fromComment?: string }>;
}

// ============================================================================
// PROMPTS
// ============================================================================

const SYNTHESIZE_SYSTEM_PROMPT = `You are helping a group of people reach consensus on improving a paragraph in a document.

Your role is to:
1. Analyze the community suggestions for improving the paragraph
2. Create a NEW suggestion that combines the strongest ideas from the highest-consensus alternatives
3. Preserve the original intent of the paragraph while incorporating the most supported changes
4. Be concise and clear

IMPORTANT:
- Higher consensus scores mean more community agreement
- Prioritize ideas from high-consensus suggestions
- The result should read naturally as a single coherent paragraph
- RESPOND IN THE SAME LANGUAGE as the original paragraph text`;

const SYNTHESIZE_USER_PROMPT = `Analyze these community suggestions for improving a paragraph and create a synthesis.

**Original Paragraph:**
{originalContent}

**Community Suggestions (sorted by consensus, highest first):**
{suggestionsList}

Respond in JSON format:
{
  "synthesizedText": "Your synthesized paragraph that combines the best ideas",
  "reasoning": "Explanation of which ideas you incorporated and why",
  "sourceSuggestionIds": ["id1", "id2"]
}

IMPORTANT: Respond in the same language as the original paragraph.`;

const IMPROVE_SYSTEM_PROMPT = `You are helping improve a suggestion based on community feedback comments.

Your role is to:
1. Read the current suggestion text and all comments on it
2. Incorporate the most valuable feedback from comments
3. Higher-consensus comments should have more influence
4. List specific changes you made and which comments influenced them

IMPORTANT:
- Only make changes that are supported by the comments
- Preserve the suggestion's core idea while refining it
- RESPOND IN THE SAME LANGUAGE as the suggestion text`;

const IMPROVE_USER_PROMPT = `Improve this suggestion based on the community comments below.

**Original Paragraph:**
{originalParagraphContent}

**Current Suggestion:**
{suggestionContent}

**Community Comments (sorted by consensus, highest first):**
{commentsList}

Respond in JSON format:
{
  "improvedText": "The improved suggestion text",
  "changes": [
    { "description": "What you changed and why", "fromComment": "Brief quote from the comment that inspired this change" }
  ]
}

IMPORTANT: Respond in the same language as the suggestion text.`;

// ============================================================================
// HANDLER
// ============================================================================

/**
 * HTTP handler for refinement AI operations
 */
export async function processRefinementAI(req: Request, res: Response): Promise<void> {
	try {
		if (req.method !== 'POST') {
			res.status(405).json({ error: 'Method not allowed' });
			return;
		}

		const { operation } = req.body;

		if (operation === 'synthesize') {
			await handleSynthesize(req, res);
		} else if (operation === 'improve') {
			await handleImprove(req, res);
		} else {
			res.status(400).json({ error: 'Invalid operation. Must be "synthesize" or "improve".' });
		}
	} catch (error) {
		logError(error, {
			operation: 'refinementAI.processRefinementAI',
			metadata: { requestOperation: req.body?.operation },
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

/**
 * Synthesize top suggestions into a single AI suggestion
 */
async function handleSynthesize(req: Request, res: Response): Promise<void> {
	const body = req.body as SynthesizeRequest;
	const { paragraphId, originalContent, suggestions } = body;

	if (!paragraphId || !originalContent || !suggestions?.length) {
		res.status(400).json({ error: 'paragraphId, originalContent, and suggestions are required' });
		return;
	}

	console.info(`[refinementAI.synthesize] Starting for paragraph ${paragraphId} with ${suggestions.length} suggestions`);

	// Format suggestions list
	const suggestionsList = suggestions
		.sort((a, b) => b.consensus - a.consensus)
		.map((s, i) => `${i + 1}. [Consensus: ${s.consensus.toFixed(2)}] (ID: ${s.suggestionId})\n   "${s.suggestedContent}"`)
		.join('\n\n');

	const userPrompt = SYNTHESIZE_USER_PROMPT
		.replace('{originalContent}', originalContent)
		.replace('{suggestionsList}', suggestionsList);

	const response = await callGemini(SYNTHESIZE_SYSTEM_PROMPT, userPrompt);

	const parsed = extractJSON<{
		synthesizedText?: string;
		reasoning?: string;
		sourceSuggestionIds?: string[];
	}>(response);

	const result: SynthesizeOutput = {
		synthesizedText: parsed.synthesizedText || '',
		reasoning: parsed.reasoning || 'AI synthesis completed.',
		sourceSuggestionIds: parsed.sourceSuggestionIds || suggestions.map(s => s.suggestionId),
	};

	console.info(`[refinementAI.synthesize] Completed for paragraph ${paragraphId}, output length: ${result.synthesizedText.length}`);

	res.json({
		success: true,
		result,
		model: GEMINI_MODEL,
	});
}

/**
 * Improve a suggestion based on community comments
 */
async function handleImprove(req: Request, res: Response): Promise<void> {
	const body = req.body as ImproveRequest;
	const { suggestionId, suggestionContent, comments, originalParagraphContent } = body;

	if (!suggestionId || !suggestionContent || !comments?.length) {
		res.status(400).json({ error: 'suggestionId, suggestionContent, and comments are required' });
		return;
	}

	console.info(`[refinementAI.improve] Starting for suggestion ${suggestionId} with ${comments.length} comments`);

	// Format comments list
	const commentsList = comments
		.sort((a, b) => b.consensus - a.consensus)
		.map((c, i) => `${i + 1}. [Consensus: ${c.consensus.toFixed(2)}]\n   "${c.content}"`)
		.join('\n\n');

	const userPrompt = IMPROVE_USER_PROMPT
		.replace('{originalParagraphContent}', originalParagraphContent || '')
		.replace('{suggestionContent}', suggestionContent)
		.replace('{commentsList}', commentsList);

	const response = await callGemini(IMPROVE_SYSTEM_PROMPT, userPrompt);

	const parsed = extractJSON<{
		improvedText?: string;
		changes?: Array<{ description?: string; fromComment?: string }>;
	}>(response);

	const result: ImproveOutput = {
		improvedText: parsed.improvedText || suggestionContent,
		changes: (parsed.changes || []).map(c => ({
			description: c.description || '',
			fromComment: c.fromComment,
		})),
	};

	console.info(`[refinementAI.improve] Completed for suggestion ${suggestionId}, ${result.changes.length} changes`);

	res.json({
		success: true,
		result,
		model: GEMINI_MODEL,
	});
}
