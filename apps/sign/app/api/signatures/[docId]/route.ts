import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { Collections } from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { logResearchAction } from '@/lib/utils/researchLogger';
import { ResearchAction } from '@freedi/shared-types';
import { checkSurveyCompletion } from '@/lib/firebase/demographicQueries';
import { DemographicMode } from '@/types/demographics';

interface SignatureInput {
  signed?: 'signed' | 'rejected' | 'viewed';
  levelOfSignature?: number;
  /** Satisfaction rating (-1 to 1 in 0.5 steps) for satisfaction footer mode */
  satisfaction?: number;
}

const VALID_SATISFACTION_SCORES = [-1, -0.5, 0, 0.5, 1];

/**
 * GET /api/signatures/[docId]
 * Get user's signature for a document
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const db = getFirestoreAdmin();
    const signatureId = `${userId}--${docId}`;
    const doc = await db.collection(Collections.signatures).doc(signatureId).get();

    if (!doc.exists) {
      return NextResponse.json({ signature: null });
    }

    return NextResponse.json({ signature: doc.data() });
  } catch (error) {
    logger.error('[Signatures API] GET error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/signatures/[docId]
 * Create or update user's signature for a document
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  try {
    const { docId } = await params;
    const userId = getUserIdFromCookie(request.headers.get('cookie'));

    if (!userId) {
      return NextResponse.json(
        { error: 'User not authenticated' },
        { status: 401 }
      );
    }

    const body: SignatureInput = await request.json();
    const { signed, levelOfSignature, satisfaction } = body;

    // Validate satisfaction value if provided (satisfaction footer mode)
    if (satisfaction !== undefined && !VALID_SATISFACTION_SCORES.includes(satisfaction)) {
      return NextResponse.json(
        { error: 'Invalid satisfaction score' },
        { status: 400 }
      );
    }

    // Validate signed value (optional when submitting a satisfaction rating)
    if (signed === undefined && satisfaction === undefined) {
      return NextResponse.json(
        { error: 'Invalid signature status' },
        { status: 400 }
      );
    }

    if (signed !== undefined && !['signed', 'rejected', 'viewed'].includes(signed)) {
      return NextResponse.json(
        { error: 'Invalid signature status' },
        { status: 400 }
      );
    }

    const db = getFirestoreAdmin();
    const signatureId = `${userId}--${docId}`;

    // Get existing signature to check if upgrading from 'viewed'
    const existingDoc = await db.collection(Collections.signatures).doc(signatureId).get();
    const existingSignature = existingDoc.exists ? existingDoc.data() : null;

    // Don't downgrade from signed/rejected to viewed
    if (
      signed === 'viewed' &&
      satisfaction === undefined &&
      existingSignature &&
      (existingSignature.signed === 'signed' || existingSignature.signed === 'rejected')
    ) {
      return NextResponse.json({ signature: existingSignature });
    }

    // A satisfaction-only submission keeps the existing signed status (or 'viewed')
    const effectiveSigned = signed ?? existingSignature?.signed ?? 'viewed';

    // Get document info for topParentId and parentId
    const docRef = await db.collection(Collections.statements).doc(docId).get();
    const document = docRef.exists ? docRef.data() : null;

    // For actual signatures and satisfaction ratings (not just 'viewed'),
    // verify demographic survey completion
    if (effectiveSigned !== 'viewed' || satisfaction !== undefined) {
      const signSettings = document?.signSettings || {};
      const mode: DemographicMode = signSettings.demographicMode || 'disabled';
      const demographicRequired = signSettings.demographicRequired || false;
      const topParentId = document?.topParentId || docId;

      if (mode !== 'disabled' && demographicRequired) {
        const surveyStatus = await checkSurveyCompletion(
          docId,
          userId,
          mode,
          topParentId,
          demographicRequired
        );

        if (!surveyStatus.isComplete) {
          logger.info(`[Signatures API] Blocked signature - incomplete survey: ${userId} on ${docId}`);

          return NextResponse.json(
            {
              error: 'Survey incomplete',
              message: 'Please complete the required survey before signing',
              surveyStatus,
            },
            { status: 400 }
          );
        }
      }
    }

    const signature = {
      signatureId,
      documentId: docId,
      topParentId: document?.topParentId || docId,
      parentId: document?.parentId || docId,
      userId,
      signed: effectiveSigned,
      date: Date.now(),
      levelOfSignature: levelOfSignature ?? 0,
      ...(satisfaction !== undefined && { satisfaction }),
    };

    await db.collection(Collections.signatures).doc(signatureId).set(signature, { merge: true });

    // Research logging
    const researchEnabled = document?.statementSettings?.enableResearchLogging === true;
    logResearchAction(userId, ResearchAction.VOTE, researchEnabled, {
      statementId: docId,
      topParentId: document?.topParentId || docId,
      newValue: satisfaction !== undefined ? `satisfaction:${satisfaction}` : effectiveSigned,
    });

    logger.info(`[Signatures API] Created/updated signature: ${signatureId} - ${effectiveSigned}${satisfaction !== undefined ? ` (satisfaction: ${satisfaction})` : ''}`);

    return NextResponse.json({ success: true, signature });
  } catch (error) {
    logger.error('[Signatures API] POST error:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
