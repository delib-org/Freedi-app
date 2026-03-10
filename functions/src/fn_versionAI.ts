/**
 * Firebase Function for Document Version AI Processing
 *
 * Processes document paragraphs through Gemini AI to generate proposed changes
 * based on community feedback. Has 540s timeout vs Vercel's 30s limit.
 */

import { Request, Response } from 'firebase-functions/v1';
import { getFirestore } from 'firebase-admin/firestore';
import { logError } from './utils/errorHandling';

const db = getFirestore();

// ============================================================================
// TYPES (from @freedi/shared-types - defined inline for Firebase Functions)
// ============================================================================

// Collection names
const SignCollections = {
	documentVersions: 'documentVersions',
	versionChanges: 'versionChanges',
	coherenceRecords: 'coherenceRecords',
} as const;

// Enums
enum VersionStatus {
	draft = 'draft',
	published = 'published',
	archived = 'archived',
}

enum ChangeType {
	modified = 'modified',
	added = 'added',
	removed = 'removed',
	unchanged = 'unchanged',
}

enum ChangeSourceType {
	suggestion = 'suggestion',
	comment = 'comment',
	rejectionReason = 'rejectionReason',
}

enum RevisionStrategy {
	amendParagraphs = 'amendParagraphs',
	fullRevision = 'fullRevision',
}

enum ParagraphType {
	h1 = 'h1',
	h2 = 'h2',
	h3 = 'h3',
	h4 = 'h4',
	h5 = 'h5',
	h6 = 'h6',
	paragraph = 'paragraph',
	li = 'li',
	table = 'table',
	image = 'image',
}

// Interfaces
interface ChangeSource {
	type: ChangeSourceType;
	sourceId: string;
	content: string;
	impact: number;
	supporters: number;
	objectors: number;
	creatorId: string;
	creatorDisplayName: string;
	consensus?: number;
}

interface Paragraph {
	paragraphId: string;
	type: ParagraphType;
	content: string;
	order: number;
	listType?: 'ul' | 'ol';
	sourceStatementId?: string;
	imageUrl?: string;
	imageAlt?: string;
	imageCaption?: string;
}

interface VersionChange {
	changeId: string;
	versionId: string;
	paragraphId: string;
	originalContent: string;
	proposedContent: string;
	finalContent?: string;
	changeType: ChangeType;
	sources: ChangeSource[];
	aiReasoning: string;
	combinedImpact: number;
	approvalRate?: number;
	approvalVoters?: number;
}

interface DocumentFeedbackSummary {
	totalSignatures: number;
	signedCount: number;
	rejectedCount: number;
	viewedCount: number;
	rejectionRate: number;
	rejectionReasons: { reason: string }[];
	overallApprovalRate: number;
	revisionStrategy: RevisionStrategy;
	strategyReasoning: string;
}

interface DocumentVersion {
	versionId: string;
	documentId: string;
	versionNumber: number;
	paragraphs: Paragraph[];
	status: VersionStatus;
	createdAt: number;
	publishedAt?: number;
	createdBy: string;
	publishedBy?: string;
	aiGenerated: boolean;
	aiModel?: string;
	summary?: string;
	documentFeedbackSummary?: DocumentFeedbackSummary;
	revisionStrategy?: RevisionStrategy;
}

// ============================================================================
// AI CONFIGURATION
// ============================================================================

const GEMINI_MODEL = 'gemini-2.5-pro';
const MAX_TOKENS = 8192;
const TEMPERATURE = 0.3;

interface ParagraphAnalysisOutput {
	proposedContent: string;
	reasoning: string;
	confidence: number;
}

interface HolisticAnalysisOutput {
	paragraphActions: Array<{
		paragraphId: string;
		action: 'modify' | 'add' | 'remove' | 'keep';
		proposedContent: string;
		reasoning: string;
		confidence: number;
		insertAfterParagraphId?: string; // For 'add' actions
	}>;
	overallReasoning: string;
}

/**
 * Extract and parse JSON from AI response
 */
function extractJSON<T>(response: string, fallback?: T): T {
	let cleanedResponse = response.trim();

	// Remove markdown code blocks
	const codeBlockMatch = cleanedResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
	if (codeBlockMatch) {
		cleanedResponse = codeBlockMatch[1].trim();
	}

	// Try to find JSON object or array
	const jsonMatch = cleanedResponse.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
	if (jsonMatch) {
		cleanedResponse = jsonMatch[1];
	}

	try {
		return JSON.parse(cleanedResponse);
	} catch (parseError) {
		if (fallback !== undefined) {
			return fallback;
		}

		// Try to fix truncation
		let fixedResponse = cleanedResponse;
		const openBraces = (fixedResponse.match(/\{/g) || []).length;
		const closeBraces = (fixedResponse.match(/\}/g) || []).length;
		const openBrackets = (fixedResponse.match(/\[/g) || []).length;
		const closeBrackets = (fixedResponse.match(/\]/g) || []).length;

		for (let i = 0; i < openBrackets - closeBrackets; i++) {
			fixedResponse += ']';
		}
		for (let i = 0; i < openBraces - closeBraces; i++) {
			fixedResponse += '}';
		}

		try {
			return JSON.parse(fixedResponse);
		} catch {
			// Try to extract partial content
			const proposedContentMatch = cleanedResponse.match(
				/"proposedContent"\s*:\s*"([^"]*(?:\\.[^"]*)*)"/,
			);
			if (proposedContentMatch) {
				return {
					proposedContent: proposedContentMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
					reasoning: 'Response was truncated - partial recovery',
					confidence: 0.7,
				} as T;
			}
			throw parseError;
		}
	}
}

/**
 * Call Gemini API
 */
async function callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
	const apiKey = process.env.GOOGLE_API_KEY;
	if (!apiKey) {
		throw new Error('GOOGLE_API_KEY not configured');
	}

	const response = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
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
					temperature: TEMPERATURE,
					maxOutputTokens: MAX_TOKENS,
					responseMimeType: 'application/json',
				},
			}),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		logError(new Error(`Gemini API error: ${response.status}`), {
			operation: 'versionAI.callGemini',
			metadata: { status: response.status, errorText },
		});
		throw new Error(`Gemini API error: ${response.status}`);
	}

	const data = await response.json();

	return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

/**
 * Format feedback sources for the AI prompt (enhanced with consensus scores)
 */
function formatFeedback(sources: ChangeSource[]): string {
	if (sources.length === 0) {
		return 'No feedback received for this paragraph.';
	}

	return sources
		.map((source, index) => {
			let type: string;
			switch (source.type) {
				case ChangeSourceType.suggestion:
					type = 'Suggestion';
					break;
				case ChangeSourceType.comment:
					type = 'Comment';
					break;
				case ChangeSourceType.rejectionReason:
					type = 'Document Rejection Reason';
					break;
				default:
					type = 'Feedback';
			}

			const consensusStr = source.consensus !== undefined
				? `Consensus: ${source.consensus.toFixed(2)}, `
				: '';
			const support =
				source.supporters > 0 || source.objectors > 0
					? `, ${source.supporters} supporters, ${source.objectors} objectors`
					: '';

			return `${index + 1}. [${type}] (${consensusStr}Impact: ${source.impact.toFixed(2)}${support})
   "${source.content}"
   - By: ${source.creatorDisplayName}`;
		})
		.join('\n\n');
}

/**
 * Format document-level context for AI prompt
 */
function formatDocumentContext(summary: DocumentFeedbackSummary): string {
	const lines = [
		'**Document-Level Feedback:**',
		`- Signatures: ${summary.signedCount} signed, ${summary.rejectedCount} rejected, ${summary.viewedCount} viewed`,
		`- Rejection Rate: ${(summary.rejectionRate * 100).toFixed(0)}%`,
		`- Overall Paragraph Approval Rate: ${(summary.overallApprovalRate * 100).toFixed(0)}%`,
		`- Revision Strategy: ${summary.revisionStrategy}`,
	];

	if (summary.rejectionReasons.length > 0) {
		lines.push('', '**Key Rejection Reasons:**');
		for (const [i, r] of summary.rejectionReasons.entries()) {
			if (i >= 5) {
				lines.push(`  ... and ${summary.rejectionReasons.length - 5} more`);
				break;
			}
			lines.push(`  ${i + 1}. "${r.reason}"`);
		}
	}

	return lines.join('\n');
}

const PARAGRAPH_ANALYSIS_SYSTEM_PROMPT = `You are an expert document editor helping to revise documents based on democratic public feedback.

Your role is to:
1. Carefully analyze the original paragraph and all feedback (suggestions and comments)
2. Understand what changes the community is requesting through their feedback
3. Propose a revised version that incorporates the most impactful and supported feedback
4. Maintain the document's original intent, tone, and professional quality
5. Make targeted, meaningful changes to address the feedback

IMPORTANT - YOU MUST MAKE CHANGES:
- When feedback exists with significant impact scores, you MUST propose changes to address it
- Comments that ask questions (like "what does X mean?") indicate the text needs CLARIFICATION - add clarifying text
- Comments that critique or challenge a statement indicate it needs REFINEMENT or NUANCING
- Suggestions should be incorporated directly when they improve the text
- Only return the original content unchanged if the feedback is completely irrelevant or contradictory with equal support

Guidelines for making changes:
- PRIORITIZE feedback with higher consensus scores - these represent stronger community agreement
- Feedback items with higher consensus scores represent stronger community agreement. A consensus of 0.8 with 20 evaluators is a much stronger signal than 0.8 with 2 evaluators.
- When a comment asks a question, ADD clarifying text to answer it within the paragraph
- When a comment critiques wording, REVISE the wording to address the concern
- When a comment points out ambiguity, CLARIFY the ambiguous part
- Document Rejection Reasons represent document-level concerns from signers who rejected the entire document - give these special weight
- Use clear, professional language appropriate to the document's context
- If feedback is contradictory, favor the higher-impact suggestions

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

**Paragraph Approval Rate:** {approvalRate}% ({approvalVoters} voters)

{documentContext}

TASK: You MUST revise the paragraph to address the feedback. Each feedback item with a high impact score represents community consensus that something needs to change.

Respond in JSON format:
{
  "proposedContent": "Your REVISED paragraph text that addresses the feedback",
  "reasoning": "Detailed explanation including: 1) Which feedback items you incorporated, 2) How you addressed each piece of feedback, 3) Specific changes made and why",
  "confidence": 0.85
}

IMPORTANT:
- You MUST make changes to address the feedback - do not return the original text unchanged
- If a comment asks a question, add text that answers or clarifies it
- If a comment critiques something, revise that part to address the concern
- RESPOND IN THE SAME LANGUAGE AS THE ORIGINAL PARAGRAPH - if it's Hebrew, respond in Hebrew
`;

const HOLISTIC_ANALYSIS_SYSTEM_PROMPT = `You are an expert document editor performing a comprehensive revision of a document based on democratic public feedback.

This document has received significant negative feedback (high rejection rate or low approval), requiring a holistic revision rather than just paragraph-by-paragraph amendments.

Your role is to:
1. Analyze the ENTIRE document as a whole along with ALL feedback
2. Propose a comprehensive revision plan: modify existing paragraphs, add new ones, or recommend removing others
3. Address document-level rejection reasons that indicate systemic issues
4. Maintain the document's core purpose while significantly improving it based on community input
5. Ensure the revised document flows coherently as a whole

You can propose:
- MODIFY: Change existing paragraph content
- ADD: Insert new paragraphs (specify where they should go)
- REMOVE: Remove paragraphs that are redundant or harmful
- KEEP: Leave unchanged if no feedback warrants changes

LANGUAGE REQUIREMENT:
- ALWAYS respond in the SAME LANGUAGE as the document content`;

const HOLISTIC_ANALYSIS_USER_PROMPT = `
Perform a comprehensive revision of this document based on the community feedback.

**Full Document:**
{documentContent}

**All Feedback by Paragraph:**
{allFeedback}

{documentContext}

Respond in JSON format:
{
  "paragraphActions": [
    {
      "paragraphId": "existing-id or new-unique-id",
      "action": "modify|add|remove|keep",
      "proposedContent": "Revised or new content",
      "reasoning": "Why this change is needed",
      "confidence": 0.85,
      "insertAfterParagraphId": "id (only for add actions)"
    }
  ],
  "overallReasoning": "Summary of the revision strategy and key changes"
}

IMPORTANT:
- Address the rejection reasons - they represent why people REJECTED the entire document
- For 'add' actions, include insertAfterParagraphId to specify placement
- For 'remove' actions, proposedContent should be empty string
- Consider document flow and coherence across all changes
- RESPOND IN THE SAME LANGUAGE AS THE DOCUMENT
`;

/**
 * Analyze a single paragraph (per-paragraph amendment strategy)
 */
async function analyzeParagraph(
	paragraph: Paragraph,
	sources: ChangeSource[],
	approvalRate?: number,
	approvalVoters?: number,
	documentContext?: string,
): Promise<ParagraphAnalysisOutput> {
	if (sources.length === 0) {
		return {
			proposedContent: paragraph.content || '',
			reasoning: 'No significant feedback to address.',
			confidence: 1.0,
		};
	}

	const userPrompt = PARAGRAPH_ANALYSIS_USER_PROMPT
		.replace('{originalContent}', paragraph.content || '')
		.replace('{feedbackList}', formatFeedback(sources))
		.replace('{approvalRate}', approvalRate !== undefined ? approvalRate.toFixed(0) : 'N/A')
		.replace('{approvalVoters}', approvalVoters !== undefined ? String(approvalVoters) : 'N/A')
		.replace('{documentContext}', documentContext || '');

	try {
		console.info(
			`[analyzeParagraph] Calling Gemini for paragraph ${paragraph.paragraphId} with ${sources.length} sources`,
		);

		const response = await callGemini(PARAGRAPH_ANALYSIS_SYSTEM_PROMPT, userPrompt);

		console.info(`[analyzeParagraph] Gemini response length: ${response.length}`);

		const parsed = extractJSON<{
			proposedContent?: string;
			reasoning?: string;
			confidence?: number;
		}>(response);

		const originalContent = paragraph.content || '';
		const proposedContent = parsed.proposedContent || originalContent;
		const isChanged = proposedContent !== originalContent;

		console.info(
			`[analyzeParagraph] Paragraph ${paragraph.paragraphId}: changed=${isChanged}, confidence=${parsed.confidence}`,
		);
		if (isChanged) {
			console.info(
				`[analyzeParagraph] Original (first 100 chars): ${originalContent.substring(0, 100)}...`,
			);
			console.info(
				`[analyzeParagraph] Proposed (first 100 chars): ${proposedContent.substring(0, 100)}...`,
			);
		}

		return {
			proposedContent,
			reasoning: parsed.reasoning || 'AI analysis completed.',
			confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
		};
	} catch (error) {
		logError(error, {
			operation: 'versionAI.analyzeParagraph',
			metadata: { paragraphId: paragraph.paragraphId, sourcesCount: sources.length },
		});

		return {
			proposedContent: paragraph.content || '',
			reasoning: 'AI analysis encountered an error. The original content has been preserved.',
			confidence: 0.0,
		};
	}
}

/**
 * Analyze the full document holistically (for fullRevision strategy).
 * Can propose adding, removing, or modifying paragraphs.
 */
async function analyzeDocumentHolistically(
	paragraphs: Paragraph[],
	changes: VersionChange[],
	documentContext: string,
): Promise<HolisticAnalysisOutput> {
	const documentContent = paragraphs
		.map((p, i) => `[Paragraph ${i + 1}] (ID: ${p.paragraphId}, Type: ${p.type})\n${p.content || '(empty)'}`)
		.join('\n\n---\n\n');

	const allFeedback = changes
		.filter(c => c.sources.length > 0)
		.map(c => {
			const para = paragraphs.find(p => p.paragraphId === c.paragraphId);
			const paraLabel = para ? `Paragraph "${(para.content || '').substring(0, 60)}..."` : `Paragraph ${c.paragraphId}`;

			return `### ${paraLabel}\nApproval Rate: ${c.approvalRate !== undefined ? `${c.approvalRate.toFixed(0)}%` : 'N/A'}\n${formatFeedback(c.sources)}`;
		})
		.join('\n\n===\n\n');

	const userPrompt = HOLISTIC_ANALYSIS_USER_PROMPT
		.replace('{documentContent}', documentContent)
		.replace('{allFeedback}', allFeedback || 'No paragraph-level feedback.')
		.replace('{documentContext}', documentContext);

	try {
		console.info(`[analyzeDocumentHolistically] Starting holistic analysis for ${paragraphs.length} paragraphs`);

		const response = await callGemini(HOLISTIC_ANALYSIS_SYSTEM_PROMPT, userPrompt);

		const parsed = extractJSON<{
			paragraphActions?: Array<{
				paragraphId?: string;
				action?: string;
				proposedContent?: string;
				reasoning?: string;
				confidence?: number;
				insertAfterParagraphId?: string;
			}>;
			overallReasoning?: string;
		}>(response);

		const paragraphActions = (parsed.paragraphActions || [])
			.filter(a => a.paragraphId && a.action)
			.map(a => ({
				paragraphId: a.paragraphId!,
				action: (a.action as 'modify' | 'add' | 'remove' | 'keep') || 'keep',
				proposedContent: a.proposedContent || '',
				reasoning: a.reasoning || '',
				confidence: typeof a.confidence === 'number' ? a.confidence : 0.8,
				insertAfterParagraphId: a.insertAfterParagraphId,
			}));

		console.info(`[analyzeDocumentHolistically] Completed: ${paragraphActions.length} actions`);

		return {
			paragraphActions,
			overallReasoning: parsed.overallReasoning || 'Holistic document analysis completed.',
		};
	} catch (error) {
		logError(error, {
			operation: 'versionAI.analyzeDocumentHolistically',
			metadata: { paragraphCount: paragraphs.length },
		});

		return {
			paragraphActions: [],
			overallReasoning: 'Holistic analysis failed. Falling back to per-paragraph analysis.',
		};
	}
}

// ============================================================================
// COHERENCE ANALYSIS
// ============================================================================

enum IncoherenceType {
	contradiction = 'contradiction',
	redundancy = 'redundancy',
	gap = 'gap',
	scopeDrift = 'scopeDrift',
}

enum IncoherenceSeverity {
	high = 'high',
	medium = 'medium',
	low = 'low',
}

enum ParagraphAction {
	kept = 'kept',
	modified = 'modified',
	removed = 'removed',
	added = 'added',
}

enum ChangeDecision {
	pending = 'pending',
	approved = 'approved',
	rejected = 'rejected',
	modified = 'modified',
}

interface IncoherenceRecord {
	recordId: string;
	versionId: string;
	documentId: string;
	affectedParagraphIds: string[];
	primaryParagraphId: string;
	type: IncoherenceType;
	severity: IncoherenceSeverity;
	description: string;
	suggestedFix: string;
	aiReasoning: string;
	adminDecision: ChangeDecision;
	adminNote?: string;
	adminReviewedAt?: number;
	adminReviewedBy?: string;
	createdAt: number;
}

interface ParagraphReasoningPath {
	paragraphId: string;
	action: ParagraphAction;
	feedbackAddressed: Array<{
		sourceId: string;
		sourceType: ChangeSourceType;
		summary: string;
		impact: number;
	}>;
	coherenceIssuesResolved: string[];
	coherenceIssuesCreated: string[];
	aiDecisionSummary: string;
	previousContent?: string;
	newContent?: string;
}

const COHERENCE_SYSTEM_PROMPT = `You are an expert document coherence analyst. Your task is to cross-check an entire document for internal consistency after proposed changes have been applied.

You detect four types of incoherence:
1. **Contradiction**: Two paragraphs make conflicting claims or statements
2. **Redundancy**: Two or more paragraphs say essentially the same thing
3. **Gap**: A logical connection is missing between paragraphs
4. **Scope Drift**: A paragraph's content doesn't align with the document's overall topic

Guidelines:
- Be CONSERVATIVE - only flag genuine issues, not stylistic preferences
- Each issue must reference specific paragraphs by their ID
- For each issue, identify ONE primary paragraph where the fix should be applied
- Suggest a concrete fix (revised content for the primary paragraph)
- Rate severity: high (must fix), medium (should fix), low (minor)

LANGUAGE REQUIREMENT:
- ALWAYS respond in the SAME LANGUAGE as the document content`;

const COHERENCE_USER_PROMPT = `Analyze this document for internal coherence issues.

**Full Document (with proposed changes applied):**
{documentContent}

**Changes that were made:**
{changesSummary}

Respond in JSON format:
{
  "incoherences": [
    {
      "type": "contradiction|redundancy|gap|scopeDrift",
      "severity": "high|medium|low",
      "affectedParagraphIds": ["id1", "id2"],
      "primaryParagraphId": "id1",
      "description": "Clear explanation of the issue",
      "suggestedFix": "Revised content for the primary paragraph",
      "aiReasoning": "Why this fix resolves the issue"
    }
  ],
  "coherenceScore": 0.85,
  "summary": "Overall coherence assessment"
}

IMPORTANT:
- If the document is coherent, return empty incoherences array with high score
- coherenceScore: 1.0 = perfectly coherent, 0.0 = severely incoherent
- Only flag real issues
- RESPOND IN THE SAME LANGUAGE AS THE DOCUMENT`;

/**
 * Run coherence analysis on the full document
 * Non-blocking: if this fails, version processing still succeeds
 */
async function runCoherenceAnalysis(
	paragraphs: Paragraph[],
	changes: VersionChange[],
	versionId: string,
	documentId: string,
): Promise<{
	incoherences: IncoherenceRecord[];
	coherenceScore: number;
	reasoningPaths: ParagraphReasoningPath[];
	summary: string;
} | null> {
	try {
		const documentContent = paragraphs
			.map(
				(p, i) =>
					`[Paragraph ${i + 1}] (ID: ${p.paragraphId}, Type: ${p.type})
${p.content || '(empty)'}`,
			)
			.join('\n\n---\n\n');

		const changesSummary = changes
			.filter((c) => c.changeType !== ChangeType.unchanged)
			.map(
				(c) =>
					`Paragraph ${c.paragraphId}: ${c.changeType} - "${c.originalContent?.substring(0, 80)}..."`,
			)
			.join('\n');

		const userPrompt = COHERENCE_USER_PROMPT
			.replace('{documentContent}', documentContent)
			.replace('{changesSummary}', changesSummary || 'No changes were made.');

		console.info(`[coherenceAnalysis] Starting analysis for version ${versionId} with ${paragraphs.length} paragraphs`);

		const response = await callGemini(COHERENCE_SYSTEM_PROMPT, userPrompt);

		const parsed = extractJSON<{
			incoherences?: Array<{
				type?: string;
				severity?: string;
				affectedParagraphIds?: string[];
				primaryParagraphId?: string;
				description?: string;
				suggestedFix?: string;
				aiReasoning?: string;
			}>;
			coherenceScore?: number;
			summary?: string;
		}>(response);

		const typeMap: Record<string, IncoherenceType> = {
			contradiction: IncoherenceType.contradiction,
			redundancy: IncoherenceType.redundancy,
			gap: IncoherenceType.gap,
			scopedrift: IncoherenceType.scopeDrift,
			scopeDrift: IncoherenceType.scopeDrift,
		};

		const severityMap: Record<string, IncoherenceSeverity> = {
			high: IncoherenceSeverity.high,
			medium: IncoherenceSeverity.medium,
			low: IncoherenceSeverity.low,
		};

		const incoherences: IncoherenceRecord[] = (parsed.incoherences || [])
			.filter(
				(item) =>
					item.type && item.affectedParagraphIds?.length && item.primaryParagraphId && item.description,
			)
			.map((item, index) => ({
				recordId: `${versionId}--coh--${index}`,
				versionId,
				documentId,
				affectedParagraphIds: item.affectedParagraphIds || [],
				primaryParagraphId: item.primaryParagraphId || '',
				type: typeMap[item.type?.toLowerCase() || ''] || IncoherenceType.gap,
				severity: severityMap[item.severity?.toLowerCase() || ''] || IncoherenceSeverity.medium,
				description: item.description || '',
				suggestedFix: item.suggestedFix || '',
				aiReasoning: item.aiReasoning || '',
				adminDecision: ChangeDecision.pending,
				createdAt: Date.now(),
			}));

		const coherenceScore =
			typeof parsed.coherenceScore === 'number'
				? Math.max(0, Math.min(1, parsed.coherenceScore))
				: 1.0;

		// Build reasoning paths
		const reasoningPaths: ParagraphReasoningPath[] = paragraphs.map((paragraph) => {
			const change = changes.find((c) => c.paragraphId === paragraph.paragraphId);
			const relatedIssues = incoherences.filter((inc) =>
				inc.affectedParagraphIds.includes(paragraph.paragraphId),
			);

			let action = ParagraphAction.kept;
			if (change) {
				switch (change.changeType) {
					case ChangeType.modified: action = ParagraphAction.modified; break;
					case ChangeType.added: action = ParagraphAction.added; break;
					case ChangeType.removed: action = ParagraphAction.removed; break;
					default: action = ParagraphAction.kept;
				}
			}

			return {
				paragraphId: paragraph.paragraphId,
				action,
				feedbackAddressed: change
					? change.sources.map((source) => ({
						sourceId: source.sourceId,
						sourceType: source.type,
						summary: source.content.substring(0, 100),
						impact: source.impact,
					}))
					: [],
				coherenceIssuesResolved: [],
				coherenceIssuesCreated: relatedIssues.map((inc) => inc.recordId),
				aiDecisionSummary: change?.aiReasoning || 'No changes needed.',
				previousContent: action !== ParagraphAction.kept ? change?.originalContent : undefined,
				newContent: action !== ParagraphAction.kept ? change?.proposedContent : undefined,
			};
		});

		console.info(
			`[coherenceAnalysis] Completed: score=${coherenceScore}, issues=${incoherences.length}`,
		);

		return {
			incoherences,
			coherenceScore,
			reasoningPaths,
			summary: parsed.summary || 'Coherence analysis completed.',
		};
	} catch (error) {
		logError(error, {
			operation: 'versionAI.runCoherenceAnalysis',
			metadata: { versionId, documentId, paragraphCount: paragraphs.length },
		});

		// Non-blocking - return null so the version is still usable
		return null;
	}
}

/**
 * HTTP handler for processing version AI
 */
export async function processVersionAI(req: Request, res: Response): Promise<void> {
	try {
		if (req.method !== 'POST') {
			res.status(405).json({ error: 'Method not allowed' });

			return;
		}

		const { versionId, documentId } = req.body;

		if (!versionId || !documentId) {
			res.status(400).json({ error: 'versionId and documentId are required' });

			return;
		}

		console.info(`[processVersionAI] Starting for version ${versionId}`);

		// Get the version
		const versionRef = db.collection(SignCollections.documentVersions).doc(versionId);
		const versionSnap = await versionRef.get();

		if (!versionSnap.exists) {
			res.status(404).json({ error: 'Version not found' });

			return;
		}

		const version = versionSnap.data() as DocumentVersion;

		if (version.documentId !== documentId) {
			res.status(400).json({ error: 'Version does not belong to this document' });

			return;
		}

		if (version.status !== VersionStatus.draft) {
			res.status(400).json({ error: 'Only draft versions can be processed' });

			return;
		}

		// Get changes
		const changesSnapshot = await db
			.collection(SignCollections.versionChanges)
			.where('versionId', '==', versionId)
			.get();

		const changes = changesSnapshot.docs.map((doc) => doc.data() as VersionChange);

		if (changes.length === 0) {
			res.status(400).json({ error: 'No changes found for this version' });

			return;
		}

		const paragraphs: Paragraph[] = version.paragraphs || [];

		if (paragraphs.length === 0) {
			res.status(400).json({ error: 'Version has no paragraphs' });

			return;
		}

		// Read document feedback summary and revision strategy
		const feedbackSummary = version.documentFeedbackSummary;
		const revisionStrategy = version.revisionStrategy || RevisionStrategy.amendParagraphs;
		const documentContext = feedbackSummary ? formatDocumentContext(feedbackSummary) : '';

		console.info(`[processVersionAI] Strategy: ${revisionStrategy}, Total changes: ${changes.length}`);

		let analysisResults: Array<{ changeId: string; paragraphId: string; result: ParagraphAnalysisOutput }>;
		let newParagraphChanges: VersionChange[] = [];

		if (revisionStrategy === RevisionStrategy.fullRevision) {
			// Holistic document analysis
			console.info(`[processVersionAI] Running holistic document analysis`);

			const holisticResult = await analyzeDocumentHolistically(paragraphs, changes, documentContext);

			if (holisticResult.paragraphActions.length === 0) {
				// Fallback to per-paragraph if holistic fails
				console.info(`[processVersionAI] Holistic analysis returned no actions, falling back to per-paragraph`);
				analysisResults = await runPerParagraphAnalysis(changes, paragraphs, documentContext);
			} else {
				// Process holistic results
				analysisResults = [];

				for (const action of holisticResult.paragraphActions) {
					if (action.action === 'modify' || action.action === 'keep') {
						const existingChange = changes.find(c => c.paragraphId === action.paragraphId);
						if (existingChange) {
							analysisResults.push({
								changeId: existingChange.changeId,
								paragraphId: action.paragraphId,
								result: {
									proposedContent: action.action === 'keep'
										? (existingChange.originalContent || '')
										: action.proposedContent,
									reasoning: action.reasoning || holisticResult.overallReasoning,
									confidence: action.confidence,
								},
							});
						}
					} else if (action.action === 'add') {
						// Create new VersionChange for added paragraphs
						const newChangeId = `${versionId}--new--${action.paragraphId}`;
						newParagraphChanges.push({
							changeId: newChangeId,
							versionId,
							paragraphId: action.paragraphId,
							originalContent: '',
							proposedContent: action.proposedContent,
							changeType: ChangeType.added,
							sources: [],
							aiReasoning: action.reasoning,
							combinedImpact: 0,
						});
					} else if (action.action === 'remove') {
						const existingChange = changes.find(c => c.paragraphId === action.paragraphId);
						if (existingChange) {
							analysisResults.push({
								changeId: existingChange.changeId,
								paragraphId: action.paragraphId,
								result: {
									proposedContent: '',
									reasoning: action.reasoning,
									confidence: action.confidence,
								},
							});
							// Mark as removed
							const changeRef = db.collection(SignCollections.versionChanges).doc(existingChange.changeId);
							await changeRef.update({ changeType: ChangeType.removed });
						}
					}
				}
			}
		} else {
			// Per-paragraph amendment strategy (enhanced with document context)
			analysisResults = await runPerParagraphAnalysis(changes, paragraphs, documentContext);
		}

		// Update changes in database
		const batch = db.batch();

		for (const analysis of analysisResults) {
			const changeRef = db.collection(SignCollections.versionChanges).doc(analysis.changeId);
			batch.update(changeRef, {
				proposedContent: analysis.result.proposedContent,
				aiReasoning: analysis.result.reasoning,
			});
		}

		// Save new paragraph changes (from holistic add actions)
		for (const newChange of newParagraphChanges) {
			const changeRef = db.collection(SignCollections.versionChanges).doc(newChange.changeId);
			batch.set(changeRef, {
				...newChange,
				adminDecision: ChangeDecision.pending,
			});
		}

		// Update version paragraphs
		const updatedParagraphs = paragraphs.map((p) => {
			const analysis = analysisResults.find((a) => a.paragraphId === p.paragraphId);
			if (analysis) {
				return { ...p, content: analysis.result.proposedContent };
			}

			return p;
		});

		batch.update(versionRef, {
			paragraphs: updatedParagraphs,
			summary: `Version generated with ${analysisResults.length} AI-processed changes.${newParagraphChanges.length > 0 ? ` ${newParagraphChanges.length} new paragraphs proposed.` : ''}`,
			aiModel: GEMINI_MODEL,
		});

		await batch.commit();

		// Step 2: Run coherence analysis (non-blocking on failure)
		let coherenceScore: number | undefined;
		let coherenceRecordCount = 0;

		const allChanges = [...changes, ...newParagraphChanges];
		const coherenceResult = await runCoherenceAnalysis(
			updatedParagraphs,
			allChanges,
			versionId,
			documentId,
		);

		if (coherenceResult) {
			coherenceScore = coherenceResult.coherenceScore;
			coherenceRecordCount = coherenceResult.incoherences.length;

			// Store coherence records
			if (coherenceResult.incoherences.length > 0) {
				const cohBatch = db.batch();
				for (const record of coherenceResult.incoherences) {
					const recordRef = db.collection(SignCollections.coherenceRecords).doc(record.recordId);
					cohBatch.set(recordRef, record);
				}
				await cohBatch.commit();
			}

			// Update version with coherence data
			await versionRef.update({
				coherenceScore: coherenceResult.coherenceScore,
				coherenceRecordCount: coherenceResult.incoherences.length,
				reasoningPaths: coherenceResult.reasoningPaths,
			});
		}

		console.info(`[processVersionAI] Completed for version ${versionId}`);

		res.json({
			success: true,
			processedChanges: analysisResults.length,
			newParagraphs: newParagraphChanges.length,
			totalChanges: changes.length,
			revisionStrategy,
			coherenceScore,
			coherenceRecordCount,
		});
	} catch (error) {
		logError(error, {
			operation: 'versionAI.processVersionAI',
			metadata: { versionId: req.body?.versionId, documentId: req.body?.documentId },
		});
		res.status(500).json({ error: 'Internal server error' });
	}
}

/**
 * Run per-paragraph analysis for the amendParagraphs strategy
 */
async function runPerParagraphAnalysis(
	changes: VersionChange[],
	paragraphs: Paragraph[],
	documentContext: string,
): Promise<Array<{ changeId: string; paragraphId: string; result: ParagraphAnalysisOutput }>> {
	const changesNeedingAI = changes.filter(
		(c) => c.changeType !== ChangeType.unchanged && c.sources.length > 0,
	);

	console.info(
		`[processVersionAI] Processing ${changesNeedingAI.length} paragraphs with AI (filtered from ${changes.length} total)`,
	);

	if (changesNeedingAI.length === 0) {
		return [];
	}

	const analysisPromises = changesNeedingAI.map(async (change) => {
		const paragraph = paragraphs.find((p) => p.paragraphId === change.paragraphId);

		if (!paragraph) return null;

		const result = await analyzeParagraph(
			paragraph,
			change.sources,
			change.approvalRate,
			change.approvalVoters,
			documentContext,
		);

		return {
			changeId: change.changeId,
			paragraphId: change.paragraphId,
			result,
		};
	});

	const analysisResultsWithNulls = await Promise.all(analysisPromises);

	return analysisResultsWithNulls.filter(
		(r): r is { changeId: string; paragraphId: string; result: ParagraphAnalysisOutput } =>
			r !== null,
	);
}
