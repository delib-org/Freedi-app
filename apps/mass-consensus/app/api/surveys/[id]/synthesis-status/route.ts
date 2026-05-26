import { NextRequest, NextResponse } from 'next/server';
import { Collections, type Statement } from '@freedi/shared-types';
import { getFirestoreAdmin } from '@/lib/firebase/admin';
import { getSurveyById } from '@/lib/firebase/surveys/surveyCrud';
import { verifyToken, extractBearerToken } from '@/lib/auth/verifyAdmin';
import { logger } from '@/lib/utils/logger';

interface RouteContext {
	params: { id: string };
}

interface PerQuestionStatus {
	questionId: string;
	statement: string;
	liveSynthEffective: boolean;
	liveSynthExplicit: boolean | undefined;
	totalOptions: number;
	clusteredOptions: number;
}

export interface SynthesisStatusResponse {
	surveyId: string;
	surveyLiveSynthEnabled: boolean | undefined;
	surveyLiveSynthEffective: boolean;
	questions: PerQuestionStatus[];
	aggregate: {
		totalQuestions: number;
		liveCount: number;
		disabledCount: number;
		surveyOffCount: number;
		totalOptions: number;
		clusteredOptions: number;
	};
}

function readLiveSynth(settings: unknown): boolean | undefined {
	if (!settings || typeof settings !== 'object') return undefined;
	const raw = (settings as Record<string, unknown>)['liveSynthEnabled'];
	if (raw === true) return true;
	if (raw === false) return false;
	return undefined;
}

/**
 * GET /api/surveys/[id]/synthesis-status
 *
 * Returns per-question and aggregate synthesis activity for the survey's
 * questions. Used by the MC admin Status tab to show live indicators without
 * needing client-side Firestore subscriptions.
 */
export async function GET(request: NextRequest, context: RouteContext) {
	try {
		const token = extractBearerToken(request.headers.get('Authorization'));
		if (!token) {
			return NextResponse.json({ error: 'Authorization required' }, { status: 401 });
		}

		const userId = await verifyToken(token);
		if (!userId) {
			return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
		}

		const surveyId = context.params.id;
		const survey = await getSurveyById(surveyId);
		if (!survey) {
			return NextResponse.json({ error: 'Survey not found' }, { status: 404 });
		}
		if (survey.creatorId !== userId) {
			return NextResponse.json(
				{ error: 'You can only view status for your own surveys' },
				{ status: 403 }
			);
		}

		const db = getFirestoreAdmin();
		const surveyLiveSynthExplicit = readLiveSynth(survey.settings);
		const surveyLiveSynthEffective = surveyLiveSynthExplicit ?? true;

		const questionIds = [...new Set(survey.questionIds || [])];
		if (questionIds.length === 0) {
			const response: SynthesisStatusResponse = {
				surveyId,
				surveyLiveSynthEnabled: surveyLiveSynthExplicit,
				surveyLiveSynthEffective,
				questions: [],
				aggregate: {
					totalQuestions: 0,
					liveCount: 0,
					disabledCount: 0,
					surveyOffCount: 0,
					totalOptions: 0,
					clusteredOptions: 0,
				},
			};
			return NextResponse.json(response);
		}

		// Load all question Statements in parallel
		const questionDocs = await Promise.all(
			questionIds.map((qid) => db.collection(Collections.statements).doc(qid).get())
		);

		// For each question, count options and how many are clustered
		const perQuestion: PerQuestionStatus[] = await Promise.all(
			questionDocs.map(async (qDoc, idx) => {
				const questionId = questionIds[idx];
				const qData = qDoc.exists ? (qDoc.data() as Statement) : null;
				const statementText = qData?.statement || '';
				const liveSynthExplicit = readLiveSynth(qData?.statementSettings);

				const liveSynthEffective = surveyLiveSynthEffective
					? (liveSynthExplicit ?? true)
					: false;

				// Options under this question
				const optionsSnap = await db
					.collection(Collections.statements)
					.where('parentId', '==', questionId)
					.where('statementType', '==', 'option')
					.get();

				let clustered = 0;
				for (const optDoc of optionsSnap.docs) {
					const opt = optDoc.data() as Statement;
					if ((opt.integratedOptions ?? []).length > 0) clustered++;
				}

				return {
					questionId,
					statement: statementText,
					liveSynthEffective,
					liveSynthExplicit,
					totalOptions: optionsSnap.size,
					clusteredOptions: clustered,
				};
			})
		);

		let liveCount = 0;
		let disabledCount = 0;
		let surveyOffCount = 0;
		let totalOptions = 0;
		let clusteredOptions = 0;
		for (const q of perQuestion) {
			totalOptions += q.totalOptions;
			clusteredOptions += q.clusteredOptions;
			if (!surveyLiveSynthEffective) surveyOffCount++;
			else if (q.liveSynthEffective) liveCount++;
			else disabledCount++;
		}

		const response: SynthesisStatusResponse = {
			surveyId,
			surveyLiveSynthEnabled: surveyLiveSynthExplicit,
			surveyLiveSynthEffective,
			questions: perQuestion,
			aggregate: {
				totalQuestions: perQuestion.length,
				liveCount,
				disabledCount,
				surveyOffCount,
				totalOptions,
				clusteredOptions,
			},
		};

		return NextResponse.json(response);
	} catch (error) {
		logger.error('[GET /api/surveys/[id]/synthesis-status] Error:', error);
		return NextResponse.json(
			{ error: 'Failed to fetch synthesis status' },
			{ status: 500 }
		);
	}
}
