import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logError } from '@/lib/utils/errorHandling';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';

/**
 * POST /api/ai/rewrite-comment
 * Rewrites a comment to be positive and constructive using Gemini Flash
 */
export async function POST(request: NextRequest) {
  const rateLimitResponse = checkRateLimit(request, RATE_LIMITS.SENSITIVE);
  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  let originalText = '';

  try {
    const body = await request.json();
    originalText = body.originalText || '';
    const { suggestionText, questionText } = body;

    if (!originalText) {
      return NextResponse.json(
        { error: 'originalText is required' },
        { status: 400 }
      );
    }

    // If no API key, return original text as fallback
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ rewrittenText: originalText });
    }

    const prompt = `Rewrite this comment to be positive and constructive while preserving the core feedback. Write in the same language as the original. Return ONLY the rewritten text, nothing else.

${questionText ? `Question: "${questionText}"` : ''}
${suggestionText ? `Suggestion: "${suggestionText}"` : ''}
Comment: "${originalText}"`;

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const rewrittenText = response.text().trim();

    return NextResponse.json({ rewrittenText });
  } catch (error) {
    logError(error, {
      operation: 'api.rewriteComment',
      metadata: { url: request.url },
    });

    // On error, return original text as fallback
    return NextResponse.json({ rewrittenText: originalText });
  }
}
