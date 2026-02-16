import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { Collections, StatementType } from '@freedi/shared-types';
import { logError } from '@/lib/utils/errorHandling';
import { COMMENT } from '@/constants/common';

/**
 * POST /api/comments/submit
 * Submit a comment on a suggestion using Firebase Admin SDK.
 * Works for both authenticated and anonymous users.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      commentText,
      suggestionId,
      topParentId,
      userId,
      userName,
      reasoning,
    } = await request.json();

    // Validate
    const trimmedText = (commentText || '').trim();

    if (trimmedText.length < COMMENT.MIN_LENGTH) {
      return NextResponse.json(
        { error: `Comment must be at least ${COMMENT.MIN_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (trimmedText.length > COMMENT.MAX_LENGTH) {
      return NextResponse.json(
        { error: `Comment must be at most ${COMMENT.MAX_LENGTH} characters` },
        { status: 400 }
      );
    }

    if (!suggestionId || !userId) {
      return NextResponse.json(
        { error: 'suggestionId and userId are required' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();
    const statementId = `comment_${userId}_${Date.now()}`;
    const createdAt = Date.now();

    const comment = {
      statementId,
      statement: trimmedText,
      statementType: StatementType.comment,
      parentId: suggestionId,
      topParentId: topParentId || suggestionId,
      creatorId: userId,
      creator: {
        displayName: userName || 'Anonymous',
        uid: userId,
      },
      createdAt,
      lastUpdate: createdAt,
      lastChildUpdate: createdAt,
      ...(reasoning && reasoning !== trimmedText ? { reasoning } : {}),
    };

    await db.collection(Collections.statements).doc(statementId).set(comment);

    console.info('[POST /api/comments/submit] Comment saved:', {
      statementId,
      parentId: suggestionId,
      userId,
    });

    return NextResponse.json({ statementId });
  } catch (error) {
    logError(error, {
      operation: 'api.submitComment',
      metadata: { url: request.url },
    });

    return NextResponse.json(
      { error: 'Failed to submit comment' },
      { status: 500 }
    );
  }
}
