import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { Collections } from '@freedi/shared-types';
import { getDemographicQuestions } from '@/lib/firebase/demographicQueries';
import {
  DemographicMode,
  IdentityDisplayMode,
  resolveIdentityDisplayMode,
} from '@/types/demographics';
import { logger } from '@/lib/utils/logger';

const MAX_NAME_LENGTH = 60;

export interface DemographicNamesResponse {
  mode: IdentityDisplayMode;
  names: Record<string, string>;
}

/**
 * GET /api/demographics/names/[docId]
 * Returns a userId → form-collected-name map for identity display.
 * Privacy gate: returns an empty map unless the document's identity
 * display mode is 'form' — name answers are never exposed otherwise.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
  try {
    const { docId } = await params;
    const { db } = getFirebaseAdmin();

    const docSnap = await db.collection(Collections.statements).doc(docId).get();

    if (!docSnap.exists) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }

    const document = docSnap.data();
    const signSettings = document?.signSettings ?? {};
    const mode = resolveIdentityDisplayMode(signSettings);

    const emptyResponse: DemographicNamesResponse = { mode, names: {} };
    const noStoreHeaders = { 'Cache-Control': 'no-store' };

    if (mode !== 'form') {
      return NextResponse.json(emptyResponse, { headers: noStoreHeaders });
    }

    const demographicMode: DemographicMode = signSettings.demographicMode || 'disabled';
    const topParentId = document?.topParentId || docId;
    const questions = await getDemographicQuestions(docId, demographicMode, topParentId);
    const nameQuestion = questions.find((q) => q.presetKey === 'name');

    if (!nameQuestion?.userQuestionId) {
      return NextResponse.json(emptyResponse, { headers: noStoreHeaders });
    }

    const answersSnapshot = await db
      .collection(Collections.usersData)
      .where('userQuestionId', '==', nameQuestion.userQuestionId)
      .get();

    const names: Record<string, string> = {};
    answersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const userId = data.odlUserId;
      const answer = typeof data.answer === 'string' ? data.answer.trim() : '';
      if (typeof userId === 'string' && userId && answer) {
        names[userId] = answer.slice(0, MAX_NAME_LENGTH);
      }
    });

    const response: DemographicNamesResponse = { mode, names };

    return NextResponse.json(response, { headers: noStoreHeaders });
  } catch (error) {
    logger.error('[API] Demographics names GET failed:', error);

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
