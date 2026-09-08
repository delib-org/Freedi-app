import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { extractBearerToken, isAdminOfStatement, verifyToken } from '@/lib/auth/verifyAdmin';
import { logError } from '@/lib/utils/errorHandling';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';
import {
	cleanSuggestedSolutions,
	SUGGESTED_SOLUTIONS_COUNT,
} from '@/lib/utils/solutionSuggestions';

/**
 * POST /api/ai/suggest-solutions
 *
 * Writes starting solutions for a question the admin is still drafting, so the
 * first participants have something to rate instead of an empty survey. The
 * question does not exist yet, so the caller is authorised against the parent
 * group they are creating it under. Nothing is written to Firestore — the
 * solutions are handed back for the admin to edit before the question is saved.
 */

const MAX_COUNT = 10;
const MAX_QUESTION_CHARS = 1000;
/** Budget for the visible JSON answer (six solutions of 8-30 words each). */
const ANSWER_TOKENS = 1200;
/**
 * GPT-5-family models spend `max_completion_tokens` on hidden reasoning BEFORE
 * emitting content, so a cap sized for the answer alone can be consumed
 * entirely by reasoning and return empty content. Same reserve the shared
 * functions client keeps (functions/src/config/openai-chat.ts).
 */
const REASONING_HEADROOM_TOKENS = 2000;

interface SuggestSolutionsRequest {
	/** The question text the admin typed in step 2 of the wizard. */
	question: string;
	/** Parent group's statementId — what the caller must be an admin of. */
	parentId: string;
	/** How many solutions to write (default 6, capped at 10). */
	count?: number;
	/** Solutions already in the textarea, so the model does not repeat them. */
	existing?: string[];
}

export async function POST(request: NextRequest) {
	const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.SENSITIVE);
	if (rateLimitResponse) {
		return rateLimitResponse;
	}

	let parentId = '';

	try {
		const token = extractBearerToken(request.headers.get('Authorization'));
		if (!token) {
			return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
		}

		const userId = await verifyToken(token);
		if (!userId) {
			return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
		}

		const body: SuggestSolutionsRequest = await request.json();
		const question = (body.question || '').trim().slice(0, MAX_QUESTION_CHARS);
		parentId = body.parentId || '';

		if (question.length < 3) {
			return NextResponse.json(
				{ error: 'Question text must be at least 3 characters' },
				{ status: 400 }
			);
		}

		if (!parentId) {
			return NextResponse.json({ error: 'Parent group ID is required' }, { status: 400 });
		}

		const isAdmin = await isAdminOfStatement(userId, parentId);
		if (!isAdmin) {
			return NextResponse.json(
				{ error: 'You must be an admin of the parent group to generate solutions' },
				{ status: 403 }
			);
		}

		if (!process.env.OPENAI_API_KEY) {
			return NextResponse.json(
				{ error: 'Solution generation is not configured on this server' },
				{ status: 503 }
			);
		}

		const count =
			typeof body.count === 'number' && body.count > 0
				? Math.min(MAX_COUNT, Math.round(body.count))
				: SUGGESTED_SOLUTIONS_COUNT;
		const existing = cleanSuggestedSolutions(body.existing, MAX_COUNT);

		const prompt = `You seed a public survey with its first suggested solutions so that early participants have something to rate.

Write ${count} solutions to the question below, each as a participant would write it: one concrete proposal per solution, 8-30 words, no numbering and no headings. Make them DIVERSE — different levers, different trade-offs, some modest and some bold — and neutral in tone, so that no side feels the survey is rigged. Write in the same language as the question.

Question: "${question}"
${
	existing.length > 0
		? `\nSolutions the administrator already wrote (do not repeat these):\n${existing.map((s) => `- ${s}`).join('\n')}\n`
		: ''
}
Return ONLY JSON in this shape: {"solutions": ["...", "..."]}`;

		const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
		const model = process.env.OPENAI_FAST_MODEL || 'gpt-5.6-luna';
		const completion = await openai.chat.completions.create({
			model,
			messages: [{ role: 'user', content: prompt }],
			response_format: { type: 'json_object' },
			// GPT-5-family models require max_completion_tokens (max_tokens is rejected)
			...(model.startsWith('gpt-5')
				? { max_completion_tokens: ANSWER_TOKENS + REASONING_HEADROOM_TOKENS }
				: { max_tokens: ANSWER_TOKENS }),
		});

		const raw = completion.choices[0]?.message?.content ?? '';
		const parsed: unknown = JSON.parse(raw);
		const list =
			typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { solutions?: unknown }).solutions)
				? ((parsed as { solutions: unknown[] }).solutions)
				: [];
		const solutions = cleanSuggestedSolutions(list, count, existing);

		if (solutions.length === 0) {
			return NextResponse.json(
				{ error: 'No solutions could be generated. Please try again.' },
				{ status: 502 }
			);
		}

		return NextResponse.json({ solutions });
	} catch (error) {
		logError(error, {
			operation: 'api.suggestSolutions',
			metadata: { parentId, url: request.url },
		});

		return NextResponse.json(
			{ error: 'No solutions could be generated. Please try again.' },
			{ status: 500 }
		);
	}
}
