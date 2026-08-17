import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { logError } from '@/lib/utils/errorHandling';
import { checkRateLimit, RATE_LIMITS } from '@/lib/utils/rateLimit';

/**
 * POST /api/ai/rewrite-comment
 * Rewrites a comment to be positive and constructive using OpenAI
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
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ rewrittenText: originalText });
    }

    const prompt = `Rewrite this comment to be positive and constructive while preserving the core feedback. Write in the same language as the original. Return ONLY the rewritten text, nothing else.

${questionText ? `Question: "${questionText}"` : ''}
${suggestionText ? `Suggestion: "${suggestionText}"` : ''}
Comment: "${originalText}"`;

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_FAST_MODEL || 'gpt-5.6-luna';
    const completion = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      // GPT-5-family models require max_completion_tokens (max_tokens is rejected)
      ...(model.startsWith('gpt-5')
        ? { max_completion_tokens: 500 }
        : { max_tokens: 500 }),
    });
    const rewrittenText = (completion.choices[0]?.message?.content || originalText).trim();

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
