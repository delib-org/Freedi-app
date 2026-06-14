import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import {
  getQuestionFromFirebase,
  getUserSolutions,
  getAllSolutionsSorted,
} from '@/lib/firebase/queries';
import { logError } from '@/lib/utils/errorHandling';
import { getParagraphsText } from '@/lib/utils/paragraphUtils';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';

/**
 * POST /api/ai/feedback
 * Generate personalized AI feedback for user's solutions
 * Uses OpenAI to analyze top-performing solutions
 */
export async function POST(request: NextRequest) {
  // Rate limit check - strict for expensive AI operations
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.SENSITIVE);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  try {
    const { questionId, userId } = await request.json();

    if (!questionId || !userId) {
      return NextResponse.json(
        { error: 'questionId and userId are required' },
        { status: 400 }
      );
    }

    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: 'AI feedback is not configured' },
        { status: 503 }
      );
    }

    // Parallel fetch
    const [question, userSolutions, topSolutions] = await Promise.all([
      getQuestionFromFirebase(questionId),
      getUserSolutions(questionId, userId),
      getAllSolutionsSorted(questionId, 5),
    ]);

    // Validate user has solutions
    if (userSolutions.length === 0) {
      return NextResponse.json(
        { error: 'You need to submit solutions first to get feedback' },
        { status: 400 }
      );
    }

    // Build prompt
    const prompt = `
You are an expert facilitator helping people improve their solutions to community questions.

Question: "${question.statement}"
${getParagraphsText(question.paragraphs) ? `Context: "${getParagraphsText(question.paragraphs)}"` : ''}

The user submitted these solutions:
${userSolutions
  .map(
    (s, i) =>
      `${i + 1}. "${s.statement}" (Community score: ${(s.consensus || 0).toFixed(2)})`
  )
  .join('\n')}

Here are the top-performing solutions from the community:
${topSolutions
  .map(
    (s, i) =>
      `${i + 1}. "${s.statement}" (Community score: ${(s.consensus || 0).toFixed(2)})`
  )
  .join('\n')}

Provide a concise, constructive feedback summary (max 3 paragraphs) with 2-3 actionable tips for improving their solutions. Focus on:
1. What makes the top solutions successful (patterns, language, approach)
2. Specific ways the user can improve their solutions
3. Concrete examples of better phrasing or framing

Be encouraging and specific. Avoid generic advice.
`;

    // Call OpenAI API
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_FAST_MODEL || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
    });
    const feedback = completion.choices[0]?.message?.content || '';

    return NextResponse.json({ feedback });
  } catch (error) {
    logError(error, {
      operation: 'api.aiFeedback',
      metadata: { questionId: request.url },
    });

    return NextResponse.json(
      {
        error: 'Failed to generate feedback',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
