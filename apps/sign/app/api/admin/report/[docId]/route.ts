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
import { logger } from '@/lib/utils/logger';

/**
 * GET /api/admin/report/[docId]
 * Returns the Document Report record (JSON stats + cached AI narrative).
 *
 * Query params:
 * - fresh=1     rebuild the JSON stats (narrative is preserved)
 * - download=1  return the raw DocumentReport JSON as a file attachment
 *
 * Privacy: the report contains only anonymized ids (user_N) and k-anonymized
 * demographic segments — no real user identifiers.
 */
export async function GET(
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

		const forceFresh = request.nextUrl.searchParams.get('fresh') === '1';
		const download = request.nextUrl.searchParams.get('download') === '1';

		const reportRef = db.collection(Collections.documentReports).doc(docId);
		const cachedSnap = await reportRef.get();
		let record = cachedSnap.exists ? (cachedSnap.data() as DocumentReportRecord) : null;

		// A cache from an older schema version is treated as a miss so readers
		// never see stale shapes after a report-format upgrade.
		const outdated = record !== null && record.json?.reportVersion !== DOCUMENT_REPORT_VERSION;

		if (!record || forceFresh || outdated) {
			const docSnap = await db.collection(Collections.statements).doc(docId).get();

			if (!docSnap.exists) {
				return NextResponse.json({ error: 'Document not found' }, { status: 404 });
			}

			const document = docSnap.data() as StatementWithParagraphs;
			const report = await buildDocumentReport(document);

			record = {
				docId,
				json: report,
				narrative: record?.narrative ?? null,
				generatedAt: report.metadata.generatedAt,
				generatedBy: userId,
				reportVersion: DOCUMENT_REPORT_VERSION,
			};

			await reportRef.set(record);
			console.info(
				`[Report API] Built report for ${docId}: ${report.metadata.paragraphCount} paragraphs, ${report.funnel.uniqueVisitors} visitors`
			);
		}

		if (download) {
			const filename = `document-report-${docId}.json`;

			return new NextResponse(JSON.stringify(record.json, null, 2), {
				status: 200,
				headers: {
					'Content-Type': 'application/json; charset=utf-8',
					'Content-Disposition': `attachment; filename="${filename}"`,
				},
			});
		}

		return NextResponse.json(record);
	} catch (error) {
		logger.error('[Report API] GET error:', error);

		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
