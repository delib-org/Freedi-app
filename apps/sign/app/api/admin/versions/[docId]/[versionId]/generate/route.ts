import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseAdmin } from '@/lib/firebase/admin';
import { getUserIdFromCookie } from '@/lib/utils/user';
import { checkAdminAccess } from '@/lib/utils/adminAccess';
import {
	Collections,
	AdminPermissionLevel,
	DocumentVersion,
	VersionChange,
	VersionStatus,
	ChangeDecision,
	ChangeType,
	ChangeSource,
	ChangeSourceType,
	Paragraph,
	Suggestion,
	getChangeId,
	RevisionStrategy,
	DocumentFeedbackSummary,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { VERSIONING } from '@/constants/common';
import * as v from 'valibot';

interface CommentData {
	statementId: string;
	statement: string;
	creatorId: string;
	creatorDisplayName: string;
	parentId: string;
	consensus: number;
}

interface ApprovalData {
	statementId: string;
	userId: string;
	approval: boolean;
}

interface SignatureData {
	signed: 'signed' | 'rejected' | 'viewed';
	rejectionReason?: string;
}

/**
 * Valibot schema for generation input validation
 */
const GenerationInputSchema = v.object({
	k1: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(20))),
	k2: v.optional(v.pipe(v.number(), v.minValue(1), v.maxValue(20))),
	minImpactThreshold: v.optional(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
	includeComments: v.optional(v.boolean()),
	includeSuggestions: v.optional(v.boolean()),
	includeApprovals: v.optional(v.boolean()),
	includeSignatures: v.optional(v.boolean()),
});

type GenerationInput = v.InferOutput<typeof GenerationInputSchema>;

/**
 * Calculate impact using pre-computed consensus score.
 * consensus already encodes agreement strength via Mean-SEM.
 * We normalize by totalViewers to weight by engagement.
 */
function calculateConsensusImpact(
	consensus: number,
	totalViewers: number,
	k1: number
): number {
	if (totalViewers <= 0) return 0;

	const impact = (Math.abs(consensus) * k1) / totalViewers;

	return Math.max(0, impact);
}

/**
 * POST /api/admin/versions/[docId]/[versionId]/generate
 * Generate AI-based changes for a version based on public feedback
 */
export async function POST(
	request: NextRequest,
	{ params }: { params: Promise<{ docId: string; versionId: string }> }
): Promise<NextResponse> {
	try {
		const { docId, versionId } = await params;
		const userId = getUserIdFromCookie(request.headers.get('cookie'));

		if (!userId) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		const { db } = getFirebaseAdmin();

		// Check admin access - must be admin or owner
		const accessResult = await checkAdminAccess(db, docId, userId);

		if (!accessResult.isAdmin || accessResult.permissionLevel === AdminPermissionLevel.viewer) {
			return NextResponse.json(
				{ error: 'Forbidden - Admin access required' },
				{ status: 403 }
			);
		}

		// Get the version
		const versionRef = db.collection(Collections.documentVersions).doc(versionId);
		const versionSnap = await versionRef.get();

		if (!versionSnap.exists) {
			return NextResponse.json(
				{ error: 'Version not found' },
				{ status: 404 }
			);
		}

		const version = versionSnap.data() as DocumentVersion;

		// Verify version belongs to document
		if (version.documentId !== docId) {
			return NextResponse.json(
				{ error: 'Version does not belong to this document' },
				{ status: 400 }
			);
		}

		// Only draft versions can have changes generated
		if (version.status !== VersionStatus.draft) {
			return NextResponse.json(
				{ error: 'Only draft versions can have changes generated' },
				{ status: 400 }
			);
		}

		// Parse and validate generation settings
		let body: GenerationInput;
		try {
			const rawBody = await request.json().catch(() => ({}));
			body = v.parse(GenerationInputSchema, rawBody);
		} catch (validationError) {
			const issues = validationError instanceof v.ValiError ? validationError.issues : [];
			return NextResponse.json(
				{
					error: 'Invalid request body',
					details: issues.map((issue: v.BaseIssue<unknown>) => ({
						path: issue.path?.map((p) => String(p.key)).join('.'),
						message: issue.message,
					})),
				},
				{ status: 400 }
			);
		}

		const k1 = body.k1 ?? VERSIONING.DEFAULT_K1;
		const k2 = body.k2 ?? VERSIONING.DEFAULT_K2;
		const minImpactThreshold = body.minImpactThreshold ?? VERSIONING.DEFAULT_MIN_IMPACT_THRESHOLD;
		const includeComments = body.includeComments ?? true;
		const includeSuggestions = body.includeSuggestions ?? true;
		const includeApprovals = body.includeApprovals ?? true;
		const includeSignatures = body.includeSignatures ?? true;

		// Get the document paragraphs from Statement documents (not the legacy array)
		const paragraphsSnapshot = await db
			.collection(Collections.statements)
			.where('parentId', '==', docId)
			.where('doc.isOfficialParagraph', '==', true)
			.orderBy('doc.order', 'asc')
			.get();

		const paragraphs: Paragraph[] = paragraphsSnapshot.docs
			.filter(doc => !doc.data().hide)
			.map(doc => {
				const data = doc.data();

				return {
					paragraphId: data.statementId,
					content: data.statement,
					order: data.doc?.order ?? 0,
					type: data.doc?.paragraphType,
				} as Paragraph;
			});

		if (paragraphs.length === 0) {
			return NextResponse.json(
				{ error: 'Document has no paragraphs' },
				{ status: 400 }
			);
		}

		logger.info(`[Versions API] Found ${paragraphs.length} official paragraph statements for document ${docId}`);

		// Get total viewers for the document (for impact calculation)
		const viewsSnapshot = await db
			.collection(Collections.statementViews)
			.where('statementId', '==', docId)
			.get();

		// Count unique visitors
		const uniqueVisitors = new Set(viewsSnapshot.docs.map(doc => doc.data().visitorId));
		const totalViewers = Math.max(uniqueVisitors.size, 1);

		logger.info(`[Versions API] Document ${docId}: ${totalViewers} unique viewers`);

		// Get suggestions for all paragraphs (with pre-computed consensus)
		let suggestions: Suggestion[] = [];
		if (includeSuggestions) {
			const suggestionsSnapshot = await db
				.collection(Collections.suggestions)
				.where('documentId', '==', docId)
				.where('hide', '==', false)
				.get();

			suggestions = suggestionsSnapshot.docs.map(doc => doc.data() as Suggestion);
			logger.info(`[Versions API] Found ${suggestions.length} suggestions for document ${docId}`);
		}

		// Get comments for all paragraphs (with pre-computed consensus)
		let comments: CommentData[] = [];
		if (includeComments) {
			const commentsSnapshot = await db
				.collection(Collections.statements)
				.where('topParentId', '==', docId)
				.where('statementType', '==', 'statement')
				.get();

			comments = commentsSnapshot.docs.map(doc => {
				const data = doc.data();

				return {
					statementId: data.statementId,
					statement: data.statement,
					creatorId: data.creatorId,
					creatorDisplayName: data.creatorDisplayName || 'Anonymous',
					parentId: data.parentId,
					consensus: data.consensus ?? 0,
				};
			});
			logger.info(`[Versions API] Found ${comments.length} comments for document ${docId}`);
		}

		// Fetch paragraph-level approvals
		const paragraphApprovals = new Map<string, { approved: number; total: number }>();
		if (includeApprovals) {
			const approvalsSnapshot = await db
				.collection(Collections.approval)
				.where('documentId', '==', docId)
				.get();

			for (const doc of approvalsSnapshot.docs) {
				const data = doc.data() as ApprovalData;
				const existing = paragraphApprovals.get(data.statementId) || { approved: 0, total: 0 };
				existing.total++;
				if (data.approval) {
					existing.approved++;
				}
				paragraphApprovals.set(data.statementId, existing);
			}

			logger.info(`[Versions API] Found approvals for ${paragraphApprovals.size} paragraphs`);
		}

		// Fetch document-level signatures with rejection reasons
		let signedCount = 0;
		let rejectedCount = 0;
		let viewedCount = 0;
		const rejectionReasons: { reason: string }[] = [];

		if (includeSignatures) {
			const signaturesSnapshot = await db
				.collection(Collections.signatures)
				.where('documentId', '==', docId)
				.get();

			for (const doc of signaturesSnapshot.docs) {
				const data = doc.data() as SignatureData;
				if (data.signed === 'signed') {
					signedCount++;
				} else if (data.signed === 'rejected') {
					rejectedCount++;
					if (data.rejectionReason && data.rejectionReason.trim()) {
						rejectionReasons.push({ reason: data.rejectionReason.trim() });
					}
				} else if (data.signed === 'viewed') {
					viewedCount++;
				}
			}

			logger.info(`[Versions API] Signatures: ${signedCount} signed, ${rejectedCount} rejected, ${viewedCount} viewed, ${rejectionReasons.length} with reasons`);
		}

		// Compute overall approval rate
		let overallApprovalRate = 0;
		if (paragraphApprovals.size > 0) {
			let totalApprovalRate = 0;
			for (const [, data] of paragraphApprovals) {
				totalApprovalRate += data.total > 0 ? (data.approved / data.total) : 0;
			}
			overallApprovalRate = totalApprovalRate / paragraphApprovals.size;
		}

		// Compute rejection rate
		const totalSignatures = signedCount + rejectedCount + viewedCount;
		const rejectionRate = (signedCount + rejectedCount) > 0
			? rejectedCount / (signedCount + rejectedCount)
			: 0;

		// Determine revision strategy
		let revisionStrategy = RevisionStrategy.amendParagraphs;
		let strategyReasoning = 'Default per-paragraph amendment strategy.';

		if (rejectionRate > VERSIONING.FULL_REVISION_REJECTION_THRESHOLD) {
			revisionStrategy = RevisionStrategy.fullRevision;
			strategyReasoning = `High rejection rate (${(rejectionRate * 100).toFixed(0)}%) exceeds ${(VERSIONING.FULL_REVISION_REJECTION_THRESHOLD * 100).toFixed(0)}% threshold. Full document revision recommended.`;
		} else if (overallApprovalRate < VERSIONING.FULL_REVISION_APPROVAL_THRESHOLD && paragraphApprovals.size > 0) {
			revisionStrategy = RevisionStrategy.fullRevision;
			strategyReasoning = `Low overall approval rate (${(overallApprovalRate * 100).toFixed(0)}%) below ${(VERSIONING.FULL_REVISION_APPROVAL_THRESHOLD * 100).toFixed(0)}% threshold. Full document revision recommended.`;
		}

		logger.info(`[Versions API] Strategy: ${revisionStrategy} - ${strategyReasoning}`);

		// Build document feedback summary
		const documentFeedbackSummary: DocumentFeedbackSummary = {
			totalSignatures,
			signedCount,
			rejectedCount,
			viewedCount,
			rejectionRate,
			rejectionReasons,
			overallApprovalRate,
			revisionStrategy,
			strategyReasoning,
		};

		// Build changes for each paragraph
		const changes: VersionChange[] = [];
		const batch = db.batch();

		for (const paragraph of paragraphs) {
			const paragraphId = paragraph.paragraphId;
			const sources: ChangeSource[] = [];

			// Process suggestions for this paragraph (using pre-computed consensus)
			const paragraphSuggestions = suggestions.filter(s => s.paragraphId === paragraphId);

			for (const suggestion of paragraphSuggestions) {
				const consensus = suggestion.consensus ?? 0;
				const impact = calculateConsensusImpact(consensus, totalViewers, k1);
				const supporters = suggestion.positiveEvaluations ?? 0;
				const objectors = suggestion.negativeEvaluations ?? 0;

				logger.info(`[Versions API] Suggestion ${suggestion.suggestionId}: consensus=${consensus.toFixed(3)}, impact=${impact.toFixed(3)}, threshold=${minImpactThreshold}`);

				if (impact >= minImpactThreshold) {
					sources.push({
						type: ChangeSourceType.suggestion,
						sourceId: suggestion.suggestionId,
						content: suggestion.suggestedContent,
						impact,
						supporters,
						objectors,
						creatorId: suggestion.creatorId,
						creatorDisplayName: suggestion.creatorDisplayName,
						consensus,
					});
				}
			}

			// Process comments for this paragraph (using pre-computed consensus)
			const paragraphComments = comments.filter(c => c.parentId === paragraphId);

			for (const comment of paragraphComments) {
				const consensus = comment.consensus ?? 0;
				const impact = calculateConsensusImpact(consensus, totalViewers, k1);

				logger.info(`[Versions API] Comment ${comment.statementId}: consensus=${consensus.toFixed(3)}, impact=${impact.toFixed(3)}, threshold=${minImpactThreshold}`);

				if (impact >= minImpactThreshold) {
					sources.push({
						type: ChangeSourceType.comment,
						sourceId: comment.statementId,
						content: comment.statement,
						impact,
						supporters: 0,
						objectors: 0,
						creatorId: comment.creatorId,
						creatorDisplayName: comment.creatorDisplayName,
						consensus,
					});
				}
			}

			// Add rejection reasons as sources (applied to all paragraphs with other feedback)
			if (rejectionReasons.length > 0 && sources.length > 0) {
				for (const rejection of rejectionReasons) {
					sources.push({
						type: ChangeSourceType.rejectionReason,
						sourceId: `rejection-${paragraphId}-${rejectionReasons.indexOf(rejection)}`,
						content: rejection.reason,
						impact: rejectionRate * k1,
						supporters: rejectedCount,
						objectors: signedCount,
						creatorId: 'document-rejection',
						creatorDisplayName: 'Document Rejection',
						consensus: -rejectionRate,
					});
				}
			}

			// Sort sources by impact (highest first)
			sources.sort((a, b) => b.impact - a.impact);

			// Calculate combined impact
			const combinedImpact = sources.reduce((sum, s) => sum + s.impact, 0);

			// Determine change type
			const changeType = sources.length > 0 ? ChangeType.modified : ChangeType.unchanged;

			const changeId = getChangeId(versionId, paragraphId);

			// Get per-paragraph approval data
			const approvalData = paragraphApprovals.get(paragraphId);

			const change: VersionChange = {
				changeId,
				versionId,
				paragraphId,
				originalContent: paragraph.content || '',
				proposedContent: paragraph.content || '', // Will be updated by AI
				changeType,
				adminDecision: ChangeDecision.pending,
				sources,
				aiReasoning: '', // Will be filled by AI
				combinedImpact,
				// Only set approval fields when data exists (Firestore rejects undefined)
				...(approvalData && approvalData.total > 0
					? {
						approvalRate: (approvalData.approved / approvalData.total) * 100,
						approvalVoters: approvalData.total,
					}
					: {}),
			};

			changes.push(change);

			// Save change to database
			const changeRef = db.collection(Collections.versionChanges).doc(changeId);
			batch.set(changeRef, change);
		}

		// Update version with generation metadata and feedback summary
		batch.update(versionRef, {
			aiGenerated: true,
			generationSettings: {
				k1,
				k2,
				minImpactThreshold,
				includeComments,
				includeSuggestions,
			},
			totalViewers,
			totalSuggestions: suggestions.length,
			totalComments: comments.length,
			changesCount: changes.filter(c => c.changeType !== ChangeType.unchanged).length,
			documentFeedbackSummary,
			revisionStrategy,
		});

		await batch.commit();

		const changesWithSources = changes.filter(c => c.sources.length > 0);
		logger.info(`[Versions API] Generated ${changes.length} total changes, ${changesWithSources.length} with sources for version ${versionId}`);

		// Return the changes that need AI processing
		const changesNeedingAI = changes.filter(c => c.changeType !== ChangeType.unchanged && c.sources.length > 0);

		return NextResponse.json({
			success: true,
			totalViewers,
			totalSuggestions: suggestions.length,
			totalComments: comments.length,
			totalChanges: changes.length,
			changesNeedingAI: changesNeedingAI.length,
			changes: changesNeedingAI,
			settings: { k1, k2, minImpactThreshold },
			revisionStrategy,
			rejectionRate,
			overallApprovalRate,
			documentFeedbackSummary,
		});
	} catch (error) {
		logger.error('[Versions API] Generate error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
