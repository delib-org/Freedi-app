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
	calculateImpact,
	getChangeId,
} from '@freedi/shared-types';
import { logger } from '@/lib/utils/logger';
import { VERSIONING, FIREBASE } from '@/constants/common';

interface CommentData {
	statementId: string;
	statement: string;
	creatorId: string;
	creatorDisplayName: string;
	parentId: string;
}

interface EvaluationData {
	statementId: string;
	evaluation: number;
}

interface GenerationInput {
	k1?: number;
	k2?: number;
	minImpactThreshold?: number;
	includeComments?: boolean;
	includeSuggestions?: boolean;
}

/**
 * Calculate impact for a suggestion or comment based on evaluations
 */
function calculateItemImpact(
	supporters: number,
	objectors: number,
	totalViewers: number,
	k1: number,
	k2: number
): number {
	return calculateImpact(supporters, objectors, totalViewers, k1, k2);
}

/**
 * Group evaluations by statement ID
 */
function groupEvaluationsByStatement(evaluations: EvaluationData[]): Map<string, { supporters: number; objectors: number }> {
	const grouped = new Map<string, { supporters: number; objectors: number }>();

	for (const evaluation of evaluations) {
		const existing = grouped.get(evaluation.statementId) || { supporters: 0, objectors: 0 };

		if (evaluation.evaluation > 0) {
			existing.supporters++;
		} else if (evaluation.evaluation < 0) {
			existing.objectors++;
		}

		grouped.set(evaluation.statementId, existing);
	}

	return grouped;
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

		// Parse generation settings
		const body: GenerationInput = await request.json().catch(() => ({}));
		const k1 = body.k1 ?? VERSIONING.DEFAULT_K1;
		const k2 = body.k2 ?? VERSIONING.DEFAULT_K2;
		const minImpactThreshold = body.minImpactThreshold ?? VERSIONING.DEFAULT_MIN_IMPACT_THRESHOLD;
		const includeComments = body.includeComments ?? true;
		const includeSuggestions = body.includeSuggestions ?? true;

		// Get the document paragraphs
		const docRef = db.collection(Collections.statements).doc(docId);
		const docSnap = await docRef.get();

		if (!docSnap.exists) {
			return NextResponse.json(
				{ error: 'Document not found' },
				{ status: 404 }
			);
		}

		const document = docSnap.data();
		const paragraphs: Paragraph[] = document?.paragraphs || [];

		if (paragraphs.length === 0) {
			return NextResponse.json(
				{ error: 'Document has no paragraphs' },
				{ status: 400 }
			);
		}

		// Get total viewers for the document (for impact calculation)
		const viewsSnapshot = await db
			.collection(Collections.statementViews)
			.where('statementId', '==', docId)
			.get();

		// Count unique visitors
		const uniqueVisitors = new Set(viewsSnapshot.docs.map(doc => doc.data().visitorId));
		const totalViewers = Math.max(uniqueVisitors.size, 1); // At least 1 to avoid division by zero

		// Get suggestions for all paragraphs
		let suggestions: Suggestion[] = [];
		if (includeSuggestions) {
			const suggestionsSnapshot = await db
				.collection(Collections.suggestions)
				.where('documentId', '==', docId)
				.where('hide', '==', false)
				.get();

			suggestions = suggestionsSnapshot.docs.map(doc => doc.data() as Suggestion);
		}

		// Get comments for all paragraphs
		let comments: CommentData[] = [];
		if (includeComments) {
			// Comments are stored as statements with parentId = paragraphId
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
				};
			});
		}

		// Get evaluations for suggestions
		const suggestionIds = suggestions.map(s => s.suggestionId);
		let suggestionEvaluations = new Map<string, { supporters: number; objectors: number }>();

		if (suggestionIds.length > 0) {
			// Firestore 'in' query limit
			const allEvaluations: EvaluationData[] = [];

			for (let i = 0; i < suggestionIds.length; i += FIREBASE.IN_QUERY_LIMIT) {
				const batch = suggestionIds.slice(i, i + FIREBASE.IN_QUERY_LIMIT);
				const evalSnapshot = await db
					.collection(Collections.evaluations)
					.where('statementId', 'in', batch)
					.get();

				evalSnapshot.docs.forEach(doc => {
					const data = doc.data();
					allEvaluations.push({
						statementId: data.statementId,
						evaluation: data.evaluation,
					});
				});
			}

			suggestionEvaluations = groupEvaluationsByStatement(allEvaluations);
		}

		// Get evaluations for comments (if any)
		const commentIds = comments.map(c => c.statementId);
		let commentEvaluations = new Map<string, { supporters: number; objectors: number }>();

		if (commentIds.length > 0) {
			const allEvaluations: EvaluationData[] = [];

			for (let i = 0; i < commentIds.length; i += FIREBASE.IN_QUERY_LIMIT) {
				const batch = commentIds.slice(i, i + FIREBASE.IN_QUERY_LIMIT);
				const evalSnapshot = await db
					.collection(Collections.evaluations)
					.where('statementId', 'in', batch)
					.get();

				evalSnapshot.docs.forEach(doc => {
					const data = doc.data();
					allEvaluations.push({
						statementId: data.statementId,
						evaluation: data.evaluation,
					});
				});
			}

			commentEvaluations = groupEvaluationsByStatement(allEvaluations);
		}

		// Build changes for each paragraph
		const changes: VersionChange[] = [];
		const batch = db.batch();

		for (const paragraph of paragraphs) {
			const paragraphId = paragraph.paragraphId;
			const sources: ChangeSource[] = [];

			// Process suggestions for this paragraph
			const paragraphSuggestions = suggestions.filter(s => s.paragraphId === paragraphId);

			for (const suggestion of paragraphSuggestions) {
				const evals = suggestionEvaluations.get(suggestion.suggestionId) || { supporters: 0, objectors: 0 };
				const impact = calculateItemImpact(evals.supporters, evals.objectors, totalViewers, k1, k2);

				if (impact >= minImpactThreshold) {
					sources.push({
						type: ChangeSourceType.suggestion,
						sourceId: suggestion.suggestionId,
						content: suggestion.suggestedContent,
						impact,
						supporters: evals.supporters,
						objectors: evals.objectors,
						creatorId: suggestion.creatorId,
						creatorDisplayName: suggestion.creatorDisplayName,
					});
				}
			}

			// Process comments for this paragraph
			const paragraphComments = comments.filter(c => c.parentId === paragraphId);

			for (const comment of paragraphComments) {
				const evals = commentEvaluations.get(comment.statementId) || { supporters: 0, objectors: 0 };
				const impact = calculateItemImpact(evals.supporters, evals.objectors, totalViewers, k1, k2);

				if (impact >= minImpactThreshold) {
					sources.push({
						type: ChangeSourceType.comment,
						sourceId: comment.statementId,
						content: comment.statement,
						impact,
						supporters: evals.supporters,
						objectors: evals.objectors,
						creatorId: comment.creatorId,
						creatorDisplayName: comment.creatorDisplayName,
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
			};

			changes.push(change);

			// Save change to database
			const changeRef = db.collection(Collections.versionChanges).doc(changeId);
			batch.set(changeRef, change);
		}

		// Update version with generation metadata
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
		});

		await batch.commit();

		logger.info(`[Versions API] Generated ${changes.length} changes for version ${versionId}`);

		// Return the changes that need AI processing
		const changesNeedingAI = changes.filter(c => c.changeType !== ChangeType.unchanged && c.sources.length > 0);

		return NextResponse.json({
			success: true,
			totalViewers,
			totalSuggestions: suggestions.length,
			totalComments: comments.length,
			totalChanges: changes.length,
			changesNeedingAI: changesNeedingAI.length,
			changes: changesNeedingAI, // Return only changes that need AI processing
			settings: { k1, k2, minImpactThreshold },
		});
	} catch (error) {
		logger.error('[Versions API] Generate error:', error);

		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
