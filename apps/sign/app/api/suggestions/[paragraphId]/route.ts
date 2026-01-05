import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { SUGGESTIONS, QUERY_LIMITS } from '@/constants/common';

interface SuggestionInput {
  suggestedContent: string;
  reasoning?: string;
  documentId: string;
  originalContent: string;
}

interface EditSuggestionInput {
  suggestionId: string;
  suggestedContent: string;
  reasoning?: string;
}

/**
 * GET /api/suggestions/[paragraphId]
 * Get suggestions for a paragraph
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;

    const db = getFirestoreAdmin();

    const snapshot = await db
      .collection(Collections.suggestions)
      .where('paragraphId', '==', paragraphId)
      .where('hide', '==', false)
      .orderBy('createdAt', 'desc')
      .limit(QUERY_LIMITS.SUGGESTIONS)
      .get();

    const suggestions = snapshot.docs.map((doc) => doc.data());

    return NextResponse.json({ suggestions });
  } catch (error) {
    logger.error('[Suggestions API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/suggestions/[paragraphId]
 * Create a new suggestion on a paragraph (one per user per paragraph)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body: SuggestionInput = await request.json();
    const { suggestedContent, reasoning, documentId, originalContent } = body;

    // Validate input
    if (!suggestedContent || suggestedContent.trim().length < SUGGESTIONS.MIN_LENGTH) {
      return NextResponse.json(
        { error: `Suggestion must be at least ${SUGGESTIONS.MIN_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (suggestedContent.trim().length > SUGGESTIONS.MAX_LENGTH) {
      return NextResponse.json(
        { error: `Suggestion must not exceed ${SUGGESTIONS.MAX_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (reasoning && reasoning.trim().length > SUGGESTIONS.MAX_REASONING_LENGTH) {
      return NextResponse.json(
        { error: `Reasoning must not exceed ${SUGGESTIONS.MAX_REASONING_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (!documentId) {
      return NextResponse.json(
        { error: 'documentId is required' },
        { status: 400 }
      );
    }

    if (!originalContent) {
      return NextResponse.json(
        { error: 'originalContent is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Check if user already has a suggestion on this paragraph
    const existingSuggestionSnapshot = await db
      .collection(Collections.suggestions)
      .where('paragraphId', '==', paragraphId)
      .where('creatorId', '==', userId)
      .where('hide', '==', false)
      .limit(1)
      .get();

    if (!existingSuggestionSnapshot.empty) {
      return NextResponse.json(
        { error: 'You already have a suggestion on this paragraph. Please edit your existing suggestion.' },
        { status: 409 }
      );
    }

    // Get display name
    const displayName = getUserDisplayNameFromCookie(cookieHeader) || getAnonymousDisplayName(userId);

    // Generate unique ID
    const suggestionId = `${userId}--${Date.now()}--${Math.random().toString(36).substring(2, 9)}`;

    const suggestion = {
      suggestionId,
      paragraphId,
      documentId,
      topParentId: documentId,
      originalContent: originalContent.trim(),
      suggestedContent: suggestedContent.trim(),
      reasoning: reasoning?.trim() || '',
      creatorId: userId,
      creatorDisplayName: displayName,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      consensus: 0,
      hide: false,
    };

    await db.collection(Collections.suggestions).doc(suggestionId).set(suggestion);

    logger.info(`[Suggestions API] Created suggestion: ${suggestionId}`);

    return NextResponse.json({ success: true, suggestion });
  } catch (error) {
    logger.error('[Suggestions API] POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/suggestions/[paragraphId]
 * Edit an existing suggestion
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    await params; // Consume params
    const cookieHeader = request.headers.get('cookie');
    const userId = getUserIdFromCookie(cookieHeader);

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body: EditSuggestionInput = await request.json();
    const { suggestionId, suggestedContent, reasoning } = body;

    // Validate input
    if (!suggestionId) {
      return NextResponse.json(
        { error: 'suggestionId is required' },
        { status: 400 }
      );
    }

    if (!suggestedContent || suggestedContent.trim().length < SUGGESTIONS.MIN_LENGTH) {
      return NextResponse.json(
        { error: `Suggestion must be at least ${SUGGESTIONS.MIN_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (suggestedContent.trim().length > SUGGESTIONS.MAX_LENGTH) {
      return NextResponse.json(
        { error: `Suggestion must not exceed ${SUGGESTIONS.MAX_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (reasoning && reasoning.trim().length > SUGGESTIONS.MAX_REASONING_LENGTH) {
      return NextResponse.json(
        { error: `Reasoning must not exceed ${SUGGESTIONS.MAX_REASONING_LENGTH} characters` },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Verify ownership
    const suggestionRef = await db.collection(Collections.suggestions).doc(suggestionId).get();
    if (!suggestionRef.exists) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    const suggestion = suggestionRef.data();
    if (suggestion?.creatorId !== userId) {
      return NextResponse.json(
        { error: 'Not authorized to edit this suggestion' },
        { status: 403 }
      );
    }

    // Update the suggestion
    await db.collection(Collections.suggestions).doc(suggestionId).update({
      suggestedContent: suggestedContent.trim(),
      reasoning: reasoning?.trim() || '',
      lastUpdate: Date.now(),
    });

    logger.info(`[Suggestions API] Updated suggestion: ${suggestionId}`);

    // Return updated suggestion
    const updatedSuggestion = {
      ...suggestion,
      suggestedContent: suggestedContent.trim(),
      reasoning: reasoning?.trim() || '',
      lastUpdate: Date.now(),
    };

    return NextResponse.json({ success: true, suggestion: updatedSuggestion });
  } catch (error) {
    logger.error('[Suggestions API] PUT error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/suggestions/[paragraphId]
 * Delete a suggestion (requires suggestion ID in body)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    await params; // Consume params even if not used
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { suggestionId } = body;

    if (!suggestionId) {
      return NextResponse.json(
        { error: 'suggestionId is required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();

    // Verify ownership
    const suggestionRef = await db.collection(Collections.suggestions).doc(suggestionId).get();
    if (!suggestionRef.exists) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    const suggestion = suggestionRef.data();
    if (suggestion?.creatorId !== userId) {
      return NextResponse.json(
        { error: 'Not authorized to delete this suggestion' },
        { status: 403 }
      );
    }

    // Soft delete by setting hide flag
    await db.collection(Collections.suggestions).doc(suggestionId).update({
      hide: true,
      lastUpdate: Date.now(),
    });

    logger.info(`[Suggestions API] Deleted suggestion: ${suggestionId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Suggestions API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
