import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	DOCUMENT_REPORT_VERSION,
} from '@freedi/shared-types';
import type { DocumentReportRecord } from '@freedi/shared-types';
import { StatementWithParagraphs } from '@/types';
import { buildDocumentReport } from '@/lib/firebase/reportQueries';
import { getFirebaseFunctionUrl } from '@/lib/utils/firebaseFunctions';
import { logger } from '@/lib/utils/logger';

// Next.js segment config — Vercel honors this over vercel.json globs.
// The route waits on the generateDocumentReportAI Cloud Function (gpt-4o),
// which takes ~30s on large documents; the platform default of 30s cuts it off.
export const maxDuration = 60;

/**
 * POST /api/admin/report/[docId]/narrative
 * Rebuilds the JSON report, then delegates AI narrative generation to the
 * generateDocumentReportAI Firebase Function (540s timeout vs Vercel's 30s).
 * The narrative is written in the document's language.
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string }> }
): Promise<NextResponse> {
	try {
		const { docId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}

		const { db } = getFirebaseAdmin();

		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		const docSnap = await db.collection(Collections.statements).doc(docId).get();

		if (!docSnap.exists) {
			return NextResponse.json({ error: 'Document not found' }, { status: 404 });
		}

		const document = docSnap.data() as StatementWithParagraphs;

		// Build a fresh JSON report so the narrative reflects current data
		const report = await buildDocumentReport(document);

		const reportRef = db.collection(Collections.documentReports).doc(docId);
		const cachedSnap = await reportRef.get();
		const existing = cachedSnap.exists ? (cachedSnap.data() as DocumentReportRecord) : null;

		const record: DocumentReportRecord = {
			docId,
			json: report,
			narrative: existing?.narrative ?? null,
			generatedAt: report.metadata.generatedAt,
			generatedBy: userId,
			reportVersion: DOCUMENT_REPORT_VERSION,
		};
		await reportRef.set(record);

		logger.info(`[Report Narrative] Delegating narrative generation for ${docId}`);

		const functionUrl = `${getFirebaseFunctionUrl()}/generateDocumentReportAI`;

		const response = await fetch(functionUrl, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				docId,
				report,
				language: report.metadata.language,
				userId,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			let errorData: { error?: string } = { error: 'Narrative generation failed' };
			try {
				errorData = JSON.parse(errorText);
			} catch {
				errorData = { error: errorText || 'Narrative generation failed' };
			}
			logger.error(`[Report Narrative] Function error: ${response.status}`, errorData);

			return NextResponse.json(
				{ error: errorData.error || 'Narrative generation failed' },
				{ status: response.status }
			);
		}

		const result = await response.json();

		logger.info(`[Report Narrative] Narrative generated for ${docId}`);

		return NextResponse.json({ success: true, narrative: result.narrative });
	} catch (error) {
		logger.error('[Report Narrative] POST error:', error);

		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
