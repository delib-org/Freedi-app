import { Request, Response } from 'firebase-functions/v1';
import { logger } from 'firebase-functions';
import { getFirestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { logError } from './utils/errorHandling';

// Lazy import to avoid circular dependency with ai-service model init
async function getAIModel() {
	const { GoogleGenerativeAI } = await import('@google/generative-ai');
	const { GEMINI_MODEL } = await import('./config/gemini');

	const apiKey = process.env.GEMINI_API_KEY;
	if (!apiKey) throw new Error('Missing GEMINI_API_KEY');

	const genAI = new GoogleGenerativeAI(apiKey);

	return genAI.getGenerativeModel({
		model: GEMINI_MODEL,
		generationConfig: {
			responseMimeType: 'application/json',
			temperature: 0.1, // Low temperature for classification
		},
	});
}

export interface StatementTypeDetectionResult {
	detectedType: 'question' | 'option' | 'statement';
	confidence: number;
}

/**
 * Detects whether a statement text is a question, an answer/solution, or a general statement.
 * Uses Gemini AI for fast classification.
 */
export async function detectStatementType(req: Request, res: Response): Promise<void> {
	try {
		const { statementText, parentStatementId } = req.body;

		if (!statementText || typeof statementText !== 'string') {
			res.status(400).json({ error: 'statementText is required' });

			return;
		}

		// Get parent context if available
		let parentContext = '';
		if (parentStatementId) {
			try {
				const db = getFirestore();
				const parentDoc = await db.collection(Collections.statements).doc(parentStatementId).get();
				if (parentDoc.exists) {
					const parentData = parentDoc.data();
					parentContext = parentData?.statement || '';
				}
			} catch (error) {
				logger.warn('Could not fetch parent statement for context', { parentStatementId, error });
			}
		}

		// Detect language for better prompt handling
		const isHebrew = /[\u0590-\u05FF]/.test(statementText);
		const isArabic = /[\u0600-\u06FF]/.test(statementText);

		const prompt = isHebrew
			? `סווג את הטקסט הבא כ"question" (שאלה), "option" (הצעה/פתרון/תשובה), או "statement" (הצהרה כללית).

טקסט: "${statementText}"
${parentContext ? `הקשר (נושא הדיון): "${parentContext}"` : ''}

כללים:
- "question": הטקסט שואל שאלה, מבקש מידע, או מציע בעיה לדיון (מכיל סימן שאלה, מילות שאלה כמו "מה", "איך", "למה", "האם", או מנוסח כשאלה)
- "option": הטקסט מציע פתרון, רעיון, או תשובה לבעיה (מכיל הצעה קונקרטית, פתרון, או המלצה)
- "statement": הטקסט הוא תגובה כללית, הערה, או הודעה שאינה שאלה או הצעה

החזר JSON בלבד:
{ "detectedType": "question" | "option" | "statement", "confidence": 0.0-1.0 }`
			: isArabic
				? `صنف النص التالي كـ "question" (سؤال) أو "option" (اقتراح/حل/إجابة) أو "statement" (بيان عام).

النص: "${statementText}"
${parentContext ? `السياق (موضوع النقاش): "${parentContext}"` : ''}

القواعد:
- "question": النص يطرح سؤالاً أو يطلب معلومات أو يقترح مشكلة للنقاش
- "option": النص يقترح حلاً أو فكرة أو إجابة لمشكلة
- "statement": النص هو تعليق عام أو ملاحظة ليست سؤالاً أو اقتراحاً

أرجع JSON فقط:
{ "detectedType": "question" | "option" | "statement", "confidence": 0.0-1.0 }`
				: `Classify the following text as "question" (asking something), "option" (proposing a solution/answer/idea), or "statement" (general comment).

Text: "${statementText}"
${parentContext ? `Context (discussion topic): "${parentContext}"` : ''}

Rules:
- "question": The text asks a question, requests information, or poses a problem for discussion (contains question marks, question words like "what", "how", "why", "should", or is phrased as a question)
- "option": The text proposes a concrete solution, idea, suggestion, or answer to a problem (contains a proposal, recommendation, or actionable idea)
- "statement": The text is a general comment, observation, or message that is neither a question nor a proposal

Return JSON only:
{ "detectedType": "question" | "option" | "statement", "confidence": 0.0-1.0 }`;

		const model = await getAIModel();
		const result = await model.generateContent(prompt);
		let responseText = result.response.text();

		// Strip markdown code blocks if present
		responseText = responseText
			.replace(/```json\s*/gi, '')
			.replace(/```\s*/g, '')
			.trim();

		const parsed: StatementTypeDetectionResult = JSON.parse(responseText);

		// Validate response
		if (
			!['question', 'option', 'statement'].includes(parsed.detectedType) ||
			typeof parsed.confidence !== 'number'
		) {
			logger.warn('Invalid AI response for type detection', { responseText });
			res.json({ detectedType: 'statement', confidence: 0 });

			return;
		}

		logger.info('Statement type detected', {
			text: statementText.substring(0, 50),
			detectedType: parsed.detectedType,
			confidence: parsed.confidence,
		});

		res.json(parsed);
	} catch (error) {
		logError(error, {
			operation: 'detectStatementType',
			metadata: { text: req.body?.statementText?.substring(0, 50) },
		});
		// Return safe default on error
		res.json({ detectedType: 'statement', confidence: 0 });
	}
}
