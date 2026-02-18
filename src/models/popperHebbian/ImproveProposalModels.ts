import { InferOutput, object, string, number, array, picklist, optional } from 'valibot';

/**
 * Request schema for AI proposal improvement
 */
export const ImproveProposalRequestSchema = object({
	statementId: string(),
	language: optional(string()),
});

export type ImproveProposalRequest = InferOutput<typeof ImproveProposalRequestSchema>;

/**
 * Response schema from AI proposal improvement
 */
export const ImproveProposalResponseSchema = object({
	originalTitle: string(),
	originalDescription: optional(string()),
	improvedTitle: string(),
	improvedDescription: string(),
	improvementSummary: string(),
	changesHighlight: array(string()),
	evidenceConsidered: number(),
	confidence: number(),
});

export type ImproveProposalResponse = InferOutput<typeof ImproveProposalResponseSchema>;

/**
 * Statement version for version control
 */
export const StatementVersionSchema = object({
	version: number(),
	title: string(),
	description: optional(string()),
	timestamp: number(),
	changedBy: string(),
	changeType: picklist(['manual', 'ai-improved']),
	improvementSummary: optional(string()),
});

export type StatementVersion = InferOutput<typeof StatementVersionSchema>;

/**
 * Modal state for the improve proposal modal
 */
export type ImproveProposalModalState =
	| { status: 'idle' }
	| { status: 'loading'; message: string }
	| { status: 'error'; error: string }
	| { status: 'preview'; data: ImproveProposalResponse }
	| { status: 'applying' }
	| { status: 'success' };

/**
 * Loading messages for the modal (rotated during AI processing)
 */
export const LOADING_MESSAGES = {
	en: [
		'Analyzing discussion contributions...',
		'Reviewing supporting evidence...',
		'Considering challenges raised...',
		'Synthesizing community feedback...',
		'Crafting improved proposal...',
	],
	he: [
		'מנתח את התרומות לדיון...',
		'סוקר ראיות תומכות...',
		'שוקל אתגרים שהועלו...',
		'מסנתז משוב מהקהילה...',
		'יוצר הצעה משופרת...',
	],
	ar: [
		'تحليل مساهمات النقاش...',
		'مراجعة الأدلة الداعمة...',
		'النظر في التحديات المطروحة...',
		'تجميع ملاحظات المجتمع...',
		'صياغة اقتراح محسّن...',
	],
} as const;

/**
 * Get loading messages for a specific language
 */
export function getLoadingMessages(language: string): readonly string[] {
	const lang = language as keyof typeof LOADING_MESSAGES;

	return LOADING_MESSAGES[lang] || LOADING_MESSAGES.en;
}
