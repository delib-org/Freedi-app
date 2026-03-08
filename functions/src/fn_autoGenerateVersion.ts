/**
 * Auto-Generate Version on Suggestion Threshold
 *
 * Firestore trigger that fires when a new suggestion is created.
 * If the document has autoGenerateOnThreshold configured, it counts
 * non-hidden suggestions since the last published version and triggers
 * version creation + AI processing when the threshold is met.
 */

import { FirestoreEvent, QueryDocumentSnapshot } from 'firebase-functions/v2/firestore';
import { getFirestore } from 'firebase-admin/firestore';
import { logError } from './utils/errorHandling';

const db = getFirestore();

const AUTO_GEN_DEBOUNCE_MS = 60 * 60 * 1000; // 1 hour

const SignCollections = {
	suggestions: 'suggestions',
	documentVersions: 'documentVersions',
	versioningSettings: 'versioningSettings',
	statements: 'statements',
	versionChanges: 'versionChanges',
} as const;

/**
 * Handler for suggestion creation - checks if auto-generation threshold is met
 */
export async function onSuggestionCreatedAutoGenerate(
	event: FirestoreEvent<QueryDocumentSnapshot | undefined>,
): Promise<void> {
	try {
		const data = event.data?.data();
		if (!data) return;

		// Get the document ID (topParentId of the suggestion's parent statement)
		const parentId = data.parentId as string | undefined;
		if (!parentId) return;

		// Look up the parent statement to get topParentId (the document)
		const parentSnap = await db.collection(SignCollections.statements).doc(parentId).get();
		if (!parentSnap.exists) return;

		const parentData = parentSnap.data();
		const documentId = (parentData?.topParentId as string) || parentId;

		// Check versioning settings
		const settingsSnap = await db
			.collection(SignCollections.versioningSettings)
			.doc(documentId)
			.get();

		if (!settingsSnap.exists) return;

		const settings = settingsSnap.data();
		if (!settings?.enabled || !settings?.autoGenerateOnThreshold) return;

		const threshold = settings.autoGenerateOnThreshold as number;

		// Check debounce: skip if a version was auto-generated in the last hour
		const recentVersions = await db
			.collection(SignCollections.documentVersions)
			.where('documentId', '==', documentId)
			.where('createdAt', '>', Date.now() - AUTO_GEN_DEBOUNCE_MS)
			.limit(1)
			.get();

		if (!recentVersions.empty) {
			console.info(
				`[autoGenerate] Skipping - version generated within last hour for document ${documentId}`,
			);

			return;
		}

		// Check for existing draft version (dedup)
		const draftVersions = await db
			.collection(SignCollections.documentVersions)
			.where('documentId', '==', documentId)
			.where('status', '==', 'draft')
			.limit(1)
			.get();

		if (!draftVersions.empty) {
			console.info(
				`[autoGenerate] Skipping - draft version already exists for document ${documentId}`,
			);

			return;
		}

		// Find the last published version to count suggestions since then
		const lastPublished = await db
			.collection(SignCollections.documentVersions)
			.where('documentId', '==', documentId)
			.where('status', '==', 'published')
			.orderBy('publishedAt', 'desc')
			.limit(1)
			.get();

		const sinceTimestamp = lastPublished.empty
			? 0
			: (lastPublished.docs[0].data().publishedAt as number) || 0;

		// Count non-hidden suggestions since last published version
		// Suggestions are stored as statements with suggestion type
		const suggestionsQuery = await db
			.collection(SignCollections.suggestions)
			.where('documentId', '==', documentId)
			.where('createdAt', '>', sinceTimestamp)
			.get();

		const suggestionCount = suggestionsQuery.size;

		console.info(
			`[autoGenerate] Document ${documentId}: ${suggestionCount}/${threshold} suggestions since last publish`,
		);

		if (suggestionCount < threshold) return;

		// Threshold met! Log that auto-generation should be triggered
		// The actual version creation is done via the existing API flow
		// We create a marker document that the admin UI can pick up
		console.info(
			`[autoGenerate] Threshold met for document ${documentId}! ${suggestionCount} suggestions >= ${threshold}`,
		);

		// Create a draft version via the same pattern used by the API
		// Get current document paragraphs
		const docSnap = await db.collection(SignCollections.statements).doc(documentId).get();
		if (!docSnap.exists) return;

		const docData = docSnap.data();
		const paragraphs = docData?.paragraphs || [];

		if (paragraphs.length === 0) {
			console.info(`[autoGenerate] No paragraphs found for document ${documentId}`);

			return;
		}

		// Determine next version number
		const allVersions = await db
			.collection(SignCollections.documentVersions)
			.where('documentId', '==', documentId)
			.orderBy('versionNumber', 'desc')
			.limit(1)
			.get();

		const nextVersionNumber = allVersions.empty
			? 1
			: ((allVersions.docs[0].data().versionNumber as number) || 0) + 1;

		const versionId = `${documentId}--v${nextVersionNumber}`;

		// Create draft version
		const versionData = {
			versionId,
			documentId,
			versionNumber: nextVersionNumber,
			paragraphs,
			status: 'draft',
			createdAt: Date.now(),
			createdBy: 'system-auto-generate',
			aiGenerated: true,
		};

		await db.collection(SignCollections.documentVersions).doc(versionId).set(versionData);

		console.info(
			`[autoGenerate] Created auto-generated draft version ${versionId} for document ${documentId}`,
		);
	} catch (error) {
		logError(error, {
			operation: 'autoGenerateVersion.onSuggestionCreated',
			metadata: { suggestionId: event.data?.id },
		});
	}
}
