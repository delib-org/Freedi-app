import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie, getUserDisplayNameFromCookie, getAnonymousDisplayName } from '@/lib/utils/user';
import { Collections, StatementType, Statement } from '@freedi/shared-types';
import { createSuggestionStatement } from '@freedi/shared-types';
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
 * Get suggestions for a paragraph (as Statement objects)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ paragraphId: string }> }
) {
  try {
    const { paragraphId } = await params;

    const db = getFirestoreAdmin();

    // Query from statements collection (new system)
    const snapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', paragraphId)
      .where('statementType', '==', StatementType.option)
      .orderBy('consensus', 'desc')
      .limit(QUERY_LIMITS.SUGGESTIONS)
      .get();

    const statements = snapshot.docs.map((doc) => doc.data() as Statement);

    // Convert Statement[] to legacy format for backward compatibility
    const suggestions = statements.map((stmt) => ({
      suggestionId: stmt.statementId,
      paragraphId: paragraphId,
      documentId: stmt.topParentId,
      suggestedContent: stmt.statement,
      reasoning: '', // TODO: Add reasoning field to Statement if needed
      creatorId: stmt.creatorId,
      creatorName: stmt.creator?.displayName || 'Anonymous',
      createdAt: stmt.createdAt,
      votes: stmt.evaluation || 0,
      consensus: stmt.consensus || 0,
    }));

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

    // Check if user already has a suggestion on this paragraph (check statements collection)
    const existingSuggestionSnapshot = await db
      .collection(Collections.statements)
      .where('parentId', '==', paragraphId)
      .where('statementType', '==', StatementType.option)
      .where('creatorId', '==', userId)
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

    // Create user object
    const creator = {
      uid: userId,
      displayName: displayName,
      email: '', // Not available from cookie
      photoURL: '',
      isAnonymous: false,
    };

    // Create Statement object using utility function
    const suggestionStatement = createSuggestionStatement(
      suggestedContent.trim(),
      paragraphId, // officialParagraphId
      documentId,
      creator
    );

    if (!suggestionStatement) {
      return NextResponse.json(
        { error: 'Failed to create suggestion statement' },
        { status: 500 }
      );
    }

    // Write to statements collection (new system)
    await db.collection(Collections.statements).doc(suggestionStatement.statementId).set(suggestionStatement);

    logger.info(`[Suggestions API] Created suggestion statement: ${suggestionStatement.statementId}`);

    // Return in legacy format for backward compatibility
    const legacySuggestion = {
      suggestionId: suggestionStatement.statementId,
      paragraphId,
      documentId,
      suggestedContent: suggestedContent.trim(),
      reasoning: reasoning?.trim() || '',
      creatorId: userId,
      creatorDisplayName: displayName,
      createdAt: suggestionStatement.createdAt,
      lastUpdate: suggestionStatement.lastUpdate,
      consensus: suggestionStatement.consensus || 0,
    };

    return NextResponse.json({ success: true, suggestion: legacySuggestion });
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

    // Verify ownership (check statements collection)
    const suggestionRef = await db.collection(Collections.statements).doc(suggestionId).get();
    if (!suggestionRef.exists) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    const statement = suggestionRef.data() as Statement;
    if (statement?.creatorId !== userId) {
      return NextResponse.json(
        { error: 'Not authorized to edit this suggestion' },
        { status: 403 }
      );
    }

    // Update the suggestion statement
    await db.collection(Collections.statements).doc(suggestionId).update({
      statement: suggestedContent.trim(),
      lastUpdate: Date.now(),
    });

    logger.info(`[Suggestions API] Updated suggestion statement: ${suggestionId}`);

    // Return in legacy format for backward compatibility
    const updatedSuggestion = {
      suggestionId: statement.statementId,
      paragraphId: statement.parentId,
      documentId: statement.topParentId,
      suggestedContent: suggestedContent.trim(),
      reasoning: reasoning?.trim() || '',
      creatorId: statement.creatorId,
      creatorDisplayName: statement.creator?.displayName || 'Anonymous',
      createdAt: statement.createdAt,
      lastUpdate: Date.now(),
      consensus: statement.consensus || 0,
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

    // Verify ownership (check statements collection)
    const suggestionRef = await db.collection(Collections.statements).doc(suggestionId).get();
    if (!suggestionRef.exists) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    const statement = suggestionRef.data() as Statement;
    if (statement?.creatorId !== userId) {
      return NextResponse.json(
        { error: 'Not authorized to delete this suggestion' },
        { status: 403 }
      );
    }

    // Soft delete by setting hide flag
    await db.collection(Collections.statements).doc(suggestionId).update({
      hide: true,
      lastUpdate: Date.now(),
    });

    logger.info(`[Suggestions API] Deleted suggestion statement: ${suggestionId}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('[Suggestions API] DELETE error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
