import firebaseConfig from '@/controllers/db/configKey';
import { functionConfig } from '@freedi/shared-types';
import { logError, NetworkError } from '@/utils/errorHandling';

export interface StatementTypeDetectionResult {
	detectedType: 'question' | 'option' | 'statement';
	confidence: number;
}

// --- Question word patterns by language ---
// Note: \b doesn't work with Hebrew/Arabic chars in JS regex, so we use (\s|$) instead
const QUESTION_PATTERNS = [
	// Universal: ends with ?
	/\?\s*$/,
	// Hebrew question words (use \s|$ instead of \b for non-Latin scripts)
	/^(מה|למה|איך|מתי|איפה|מי|האם|כמה|אילו|מדוע|לאן|מאיפה|מהו|מהי|מהם|מהן|מאין|כיצד|הייתכן|האמנם|מאי)(\s|$)/,
	// English question words
	/^(what|why|how|when|where|who|which|whom|whose|can|could|do|does|did|is|are|was|were|should|would|will|shall|have|has|had|isn't|aren't|won't|wouldn't|shouldn't|couldn't|doesn't|didn't)\b/i,
	// Arabic question words
	/^(ما|ماذا|لماذا|كيف|متى|أين|من|هل|أي|كم)(\s|$)/,
	// Spanish question words
	/^(qué|por qué|cómo|cuándo|dónde|quién|cuál|cuánto)\b/i,
	// German question words
	/^(was|warum|wie|wann|wo|wer|welche|welcher|welches)\b/i,
];

// --- Solution/proposal patterns ---
const OPTION_PATTERNS = [
	// Hebrew proposal patterns
	/^(בואו|אני מציע|אני ממליץ|הצעה|צריך ל|כדאי ל|אפשר ל|נוכל ל|מוצע ל|הפתרון הוא|יש ל)/,
	// English proposal patterns
	/^(let's|i suggest|i propose|we should|we could|we need to|my suggestion|the solution is|i recommend|how about|what if we|i think we should)\b/i,
	// Arabic proposal patterns
	/^(أقترح|يجب أن|يمكننا|الحل هو|أوصي)(\s|$)/,
];

/**
 * Client-side heuristic to detect if text is a question or solution.
 * Fast, no network required. Returns null if uncertain.
 */
export function detectStatementTypeHeuristic(text: string): StatementTypeDetectionResult | null {
	const trimmed = text.trim();

	// Check question patterns
	for (const pattern of QUESTION_PATTERNS) {
		if (pattern.test(trimmed)) {
			// Higher confidence if has question mark, lower if just starts with question word
			const hasQuestionMark = /\?\s*$/.test(trimmed);

			return {
				detectedType: 'question',
				confidence: hasQuestionMark ? 0.95 : 0.8,
			};
		}
	}

	// Check solution/option patterns
	for (const pattern of OPTION_PATTERNS) {
		if (pattern.test(trimmed)) {
			return {
				detectedType: 'option',
				confidence: 0.8,
			};
		}
	}

	// Uncertain - return null to indicate AI should be consulted
	return null;
}

// --- AI-based detection (cloud function) ---

const getDetectStatementTypeEndpoint = (): string => {
	if (location.hostname === 'localhost') {
		return `http://localhost:5001/${firebaseConfig.projectId}/${functionConfig.region}/detectStatementType`;
	}

	return `https://${functionConfig.region}-${firebaseConfig.projectId}.cloudfunctions.net/detectStatementType`;
};

/**
 * Detect statement type via AI cloud function
 */
export async function detectStatementTypeFromAI(
	statementText: string,
	parentStatementId: string,
): Promise<StatementTypeDetectionResult> {
	const endpoint = getDetectStatementTypeEndpoint();

	try {
		const response = await fetch(endpoint, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				statementText,
				parentStatementId,
			}),
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
			throw new NetworkError(errorData.error || 'Failed to detect statement type', {
				status: response.status,
			});
		}

		const data: StatementTypeDetectionResult = await response.json();

		return data;
	} catch (error) {
		logError(error, {
			operation: 'statementTypeDetection.detectStatementTypeFromAI',
			metadata: { textLength: statementText.length },
		});

		return {
			detectedType: 'statement',
			confidence: 0,
		};
	}
}

/**
 * Detect statement type: tries fast client-side heuristic first,
 * falls back to AI cloud function for ambiguous cases.
 */
export async function detectStatementTypeWithTimeout(
	statementText: string,
	parentStatementId: string,
	timeoutMs: number = 10000,
): Promise<StatementTypeDetectionResult> {
	// 1. Try fast heuristic first
	const heuristicResult = detectStatementTypeHeuristic(statementText);
	if (heuristicResult) {
		return heuristicResult;
	}

	// 2. Fall back to AI for ambiguous text
	return Promise.race([
		detectStatementTypeFromAI(statementText, parentStatementId),
		new Promise<StatementTypeDetectionResult>((_, reject) =>
			setTimeout(() => reject(new Error('Statement type detection timed out')), timeoutMs),
		),
	]).catch(() => ({
		detectedType: 'statement' as const,
		confidence: 0,
	}));
}
