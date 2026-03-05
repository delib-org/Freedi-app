/**
 * Document Coherence Analyzer
 *
 * Cross-checks the entire document to detect incoherences:
 * contradictions, redundancies, gaps, and scope drift.
 *
 * Runs as step 3c of the version generation pipeline,
 * after per-paragraph analysis and document synthesis.
 */

import {
	Paragraph,
	VersionChange,
	IncoherenceRecord,
	ParagraphReasoningPath,
	CoherenceAnalysisResult,
	IncoherenceType,
	IncoherenceSeverity,
	ParagraphAction,
	ChangeDecision,
	ChangeType,
	getCoherenceRecordId,
} from '@freedi/shared-types';
import { callAI, extractJSON, getDefaultAIConfig, AIConfig } from './versionGenerator';
import { logError } from '@/lib/utils/errorHandling';

// ============================================================================
// PROMPTS
// ============================================================================

const COHERENCE_ANALYSIS_SYSTEM_PROMPT = `You are an expert document coherence analyst. Your task is to cross-check an entire document for internal consistency after proposed changes have been applied.

You detect four types of incoherence:
1. **Contradiction**: Two paragraphs make conflicting claims or statements
2. **Redundancy**: Two or more paragraphs say essentially the same thing
3. **Gap**: A logical connection is missing between paragraphs (e.g., a term is used but never defined, or a conclusion doesn't follow from previous content)
4. **Scope Drift**: A paragraph's content doesn't align with the document's overall topic or purpose

Guidelines:
- Be CONSERVATIVE - only flag genuine issues, not stylistic preferences
- Each issue must reference specific paragraphs by their ID
- For each issue, identify ONE primary paragraph where the fix should be applied
- Suggest a concrete fix (revised content for the primary paragraph)
- Rate severity: high (must fix), medium (should fix), low (minor)
- Consider the document as a whole - some repetition may be intentional for emphasis

LANGUAGE REQUIREMENT:
- ALWAYS respond in the SAME LANGUAGE as the document content
- If the document is in Hebrew, respond in Hebrew
- If the document is in English, respond in English`;

const COHERENCE_ANALYSIS_USER_PROMPT = `Analyze this document for internal coherence issues.

**Full Document (with proposed changes applied):**
{documentContent}

**Changes that were made in this version:**
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
- If the document is coherent, return an empty incoherences array with a high score
- coherenceScore: 1.0 = perfectly coherent, 0.0 = severely incoherent
- Only flag real issues, not style preferences
- RESPOND IN THE SAME LANGUAGE AS THE DOCUMENT`;

// ============================================================================
// MAIN FUNCTION
// ============================================================================

/**
 * Analyze document coherence after changes have been applied
 *
 * @param paragraphs - All paragraphs with proposed changes applied
 * @param changes - Version changes that were made
 * @param versionId - The version being analyzed
 * @param documentId - The document being analyzed
 * @param config - Optional AI configuration
 * @returns CoherenceAnalysisResult with incoherences, score, and reasoning paths
 */
export async function analyzeDocumentCoherence(
	paragraphs: Paragraph[],
	changes: VersionChange[],
	versionId: string,
	documentId: string,
	config?: AIConfig,
): Promise<CoherenceAnalysisResult> {
	const aiConfig = config || getDefaultAIConfig();

	if (!aiConfig.apiKey) {
		throw new Error('AI API key not configured for coherence analysis');
	}

	// Build document content for analysis
	const documentContent = paragraphs
		.map(
			(p, i) =>
				`[Paragraph ${i + 1}] (ID: ${p.paragraphId}, Type: ${p.type})
${p.content || '(empty)'}`,
		)
		.join('\n\n---\n\n');

	// Build changes summary
	const changesSummary = changes
		.filter((c) => c.changeType !== ChangeType.unchanged)
		.map(
			(c) =>
				`Paragraph ${c.paragraphId}: ${c.changeType} - "${c.originalContent?.substring(0, 80)}..." -> "${c.proposedContent?.substring(0, 80)}..."`,
		)
		.join('\n');

	const userPrompt = COHERENCE_ANALYSIS_USER_PROMPT
		.replace('{documentContent}', documentContent)
		.replace('{changesSummary}', changesSummary || 'No changes were made.');

	try {
		const response = await callAI(
			COHERENCE_ANALYSIS_SYSTEM_PROMPT,
			userPrompt,
			aiConfig,
			'ai.analyzeDocumentCoherence',
		);

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

		// Transform AI response into typed IncoherenceRecords
		const incoherences: IncoherenceRecord[] = (parsed.incoherences || [])
			.filter(
				(item) =>
					item.type &&
					item.affectedParagraphIds?.length &&
					item.primaryParagraphId &&
					item.description,
			)
			.map((item, index) => ({
				recordId: getCoherenceRecordId(versionId, index),
				versionId,
				documentId,
				affectedParagraphIds: item.affectedParagraphIds || [],
				primaryParagraphId: item.primaryParagraphId || '',
				type: parseIncoherenceType(item.type || ''),
				severity: parseIncoherenceSeverity(item.severity || ''),
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

		// Build reasoning paths from changes
		const reasoningPaths = buildReasoningPaths(
			paragraphs,
			changes,
			incoherences,
		);

		return {
			incoherences,
			documentCoherenceScore: coherenceScore,
			reasoningPaths,
			summary: parsed.summary || 'Coherence analysis completed.',
		};
	} catch (error) {
		logError(error, {
			operation: 'ai.analyzeDocumentCoherence',
			metadata: {
				versionId,
				documentId,
				paragraphCount: paragraphs.length,
				changesCount: changes.length,
			},
		});

		// Graceful degradation - return clean result
		return {
			incoherences: [],
			documentCoherenceScore: -1, // -1 indicates analysis failed
			reasoningPaths: buildReasoningPaths(paragraphs, changes, []),
			summary: 'Coherence analysis was unavailable. Manual review recommended.',
		};
	}
}

// ============================================================================
// HELPERS
// ============================================================================

function parseIncoherenceType(type: string): IncoherenceType {
	const typeMap: Record<string, IncoherenceType> = {
		contradiction: IncoherenceType.contradiction,
		redundancy: IncoherenceType.redundancy,
		gap: IncoherenceType.gap,
		scopeDrift: IncoherenceType.scopeDrift,
		scopedrift: IncoherenceType.scopeDrift,
		scope_drift: IncoherenceType.scopeDrift,
	};

	return typeMap[type.toLowerCase()] || IncoherenceType.gap;
}

function parseIncoherenceSeverity(severity: string): IncoherenceSeverity {
	const severityMap: Record<string, IncoherenceSeverity> = {
		high: IncoherenceSeverity.high,
		medium: IncoherenceSeverity.medium,
		low: IncoherenceSeverity.low,
	};

	return severityMap[severity.toLowerCase()] || IncoherenceSeverity.medium;
}

/**
 * Build reasoning paths for all paragraphs based on changes and coherence analysis
 */
function buildReasoningPaths(
	paragraphs: Paragraph[],
	changes: VersionChange[],
	incoherences: IncoherenceRecord[],
): ParagraphReasoningPath[] {
	return paragraphs.map((paragraph) => {
		const change = changes.find(
			(c) => c.paragraphId === paragraph.paragraphId,
		);

		const relatedIssues = incoherences.filter((inc) =>
			inc.affectedParagraphIds.includes(paragraph.paragraphId),
		);

		const action = change
			? changeTypeToAction(change.changeType)
			: ParagraphAction.kept;

		const feedbackAddressed = change
			? change.sources.map((source) => ({
					sourceId: source.sourceId,
					sourceType: source.type,
					summary: source.content.substring(0, 100),
					impact: source.impact,
				}))
			: [];

		return {
			paragraphId: paragraph.paragraphId,
			action,
			feedbackAddressed,
			coherenceIssuesResolved: [],
			coherenceIssuesCreated: relatedIssues.map((inc) => inc.recordId),
			aiDecisionSummary: change?.aiReasoning || 'No changes needed.',
			previousContent:
				action !== ParagraphAction.kept
					? change?.originalContent
					: undefined,
			newContent:
				action !== ParagraphAction.kept
					? change?.proposedContent
					: undefined,
		};
	});
}

function changeTypeToAction(changeType: ChangeType): ParagraphAction {
	switch (changeType) {
		case ChangeType.modified:
			return ParagraphAction.modified;
		case ChangeType.added:
			return ParagraphAction.added;
		case ChangeType.removed:
			return ParagraphAction.removed;
		case ChangeType.unchanged:
		default:
			return ParagraphAction.kept;
	}
}
