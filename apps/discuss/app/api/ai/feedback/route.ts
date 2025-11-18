import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  getQuestionFromFirebase,
  getUserSolutions,
  getAllSolutionsSorted,
} from '@/lib/firebase/queries';

/**
 * POST /api/ai/feedback
 * Generate personalized AI feedback for user's solutions
 * Uses Gemini API to analyze top-performing solutions
 */
export async function POST(request: NextRequest) {
  try {
    const { questionId, userId } = await request.json();

    if (!questionId || !userId) {
      return NextResponse.json(
        { error: 'questionId and userId are required' },
        { status: 400 }
      );
    }

    // Check for API key
    if (!process.env.GEMINI_API_KEY) {
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
${question.description ? `Context: "${question.description}"` : ''}

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

    // Call Gemini API
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const feedback = response.text();

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error('[API] AI feedback error:', error);
    
return NextResponse.json(
      {
        error: 'Failed to generate feedback',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
