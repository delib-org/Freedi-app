import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/admin/versions/[docId]/[versionId]/process-ai
 * Minimal test endpoint
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string; versionId: string }> }
): Promise<NextResponse> {
	const { docId, versionId } = await params;

	return NextResponse.json({
		success: true,
		message: 'Route works!',
		docId,
		versionId,
	});
}
