/**
 * Migration Script: Convert embedded paragraphs[] array to sub-statement documents
 *
 * This script migrates existing Statement documents from using
 * the embedded `paragraphs[]` array to separate Statement documents
 * marked with `doc.isOfficialParagraph: true`.
 *
 * Usage:
 *   npx tsx scripts/migrateParagraphsToSubStatements.ts [options]
 *
 * Options:
 *   --dry-run              Preview changes without writing to Firestore
 *   --batch-size=<n>       Number of documents to process per batch (default: 500)
 *   --resume-from=<docId>  Resume migration from a specific document ID
 *   --document-type=<type> Filter: all | document | question | option (default: all)
 *   --env=<env>            Target environment: test | prod (reads from GOOGLE_APPLICATION_CREDENTIALS)
 *
 * Environment:
 *   Set GOOGLE_APPLICATION_CREDENTIALS to point to your service account JSON file:
 *
 *   Test environment:
 *     GOOGLE_APPLICATION_CREDENTIALS=./env/test-service-account.json \
 *       npx tsx scripts/migrateParagraphsToSubStatements.ts --dry-run
 *
 *   Production:
 *     GOOGLE_APPLICATION_CREDENTIALS=./env/prod-service-account.json \
 *       npx tsx scripts/migrateParagraphsToSubStatements.ts
 */

import admin from 'firebase-admin';

// Define enums locally to avoid module resolution issues in standalone scripts
// These match the values in @freedi/shared-types

enum StatementType {
	statement = 'statement',
	option = 'option',
	question = 'question',
	document = 'document',
	group = 'group',
	comment = 'comment',
	paragraph = 'paragraph',
}

enum ParagraphType {
	h1 = 'h1',
	h2 = 'h2',
	h3 = 'h3',
	h4 = 'h4',
	h5 = 'h5',
	h6 = 'h6',
	paragraph = 'paragraph',
	li = 'li',
	table = 'table',
	image = 'image',
}

// Collection names matching @freedi/shared-types
const COLLECTIONS = {
	statements: 'statements',
	users: 'usersV2',
} as const;

// Initialize Firebase Admin
const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!admin.apps.length) {
	admin.initializeApp({
		credential: serviceAccount
			? admin.credential.cert(serviceAccount)
			: admin.credential.applicationDefault(),
	});
}

const db = admin.firestore();

// Type definitions
interface Paragraph {
	paragraphId: string;
	type: ParagraphType;
	content: string;
	order: number;
	listType?: 'ul' | 'ol';
	imageUrl?: string;
	imageAlt?: string;
	imageCaption?: string;
	sourceStatementId?: string;
}

interface User {
	uid: string;
	displayName: string;
	email: string;
	photoURL: string;
	isAnonymous: boolean;
}

interface Statement {
	statementId: string;
	statement: string;
	statementType: StatementType;
	parentId: string;
	topParentId: string;
	creatorId: string;
	creator: User;
	createdAt: number;
	lastUpdate: number;
	consensus: number;
	paragraphs?: Paragraph[];
	doc?: {
		isDoc?: boolean;
		order?: number;
		isOfficialParagraph?: boolean;
		paragraphType?: ParagraphType;
		listType?: 'ul' | 'ol';
		imageUrl?: string;
		imageAlt?: string;
		imageCaption?: string;
	};
	color?: string;
	[key: string]: unknown;
}

// Parse command line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const batchSizeArg = args.find((arg) => arg.startsWith('--batch-size='));
const resumeFromArg = args.find((arg) => arg.startsWith('--resume-from='));
const documentTypeArg = args.find((arg) => arg.startsWith('--document-type='));

const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]!, 10) : 500;
const RESUME_FROM = resumeFromArg ? resumeFromArg.split('=')[1] : undefined;
const DOCUMENT_TYPE = documentTypeArg ? documentTypeArg.split('=')[1] : 'all';

// Firestore batch size limit
const FIRESTORE_BATCH_SIZE = 500;

interface MigrationStats {
	processed: number;
	migrated: number;
	paragraphsCreated: number;
	skippedNoParagraphs: number;
	skippedAlreadyMigrated: number;
	errors: number;
	errorDetails: Array<{ documentId: string; error: string }>;
}

/**
 * System user for migration operations when no specific user is available
 */
const SYSTEM_USER: User = {
	uid: 'system',
	displayName: 'System',
	email: '',
	photoURL: '',
	isAnonymous: true,
};

/**
 * Check if a document has already been migrated to statement-based paragraphs
 */
async function checkIfMigrated(documentId: string): Promise<boolean> {
	const snapshot = await db
		.collection(COLLECTIONS.statements)
		.where('parentId', '==', documentId)
		.where('doc.isOfficialParagraph', '==', true)
		.limit(1)
		.get();

	return !snapshot.empty;
}

/**
 * Get user information or return system user
 */
async function getCreatorInfo(creatorId: string): Promise<User> {
	if (!creatorId || creatorId === 'system') {
		return SYSTEM_USER;
	}

	try {
		const userSnapshot = await db
			.collection(COLLECTIONS.users)
			.doc(creatorId)
			.get();

		if (userSnapshot.exists) {
			const userData = userSnapshot.data();

			return {
				uid: creatorId,
				displayName: userData?.displayName || 'Unknown',
				email: userData?.email || '',
				photoURL: userData?.photoURL || '',
				isAnonymous: userData?.isAnonymous ?? false,
			};
		}
	} catch (error) {
		console.error(`[Warning] Could not fetch user ${creatorId}:`, error);
	}

	return SYSTEM_USER;
}

/**
 * Create a paragraph sub-statement from a paragraph object
 */
function createParagraphSubStatement(
	paragraph: Paragraph,
	documentId: string,
	creator: User
): Statement {
	const now = Date.now();

	const statement: Statement = {
		statementId: paragraph.paragraphId,
		statement: paragraph.content,
		statementType: StatementType.paragraph,
		parentId: documentId,
		topParentId: documentId,
		creatorId: creator.uid,
		creator,
		createdAt: now,
		lastUpdate: now,
		consensus: 1.0, // Official paragraphs have full consensus
		doc: {
			isDoc: true,
			order: paragraph.order,
			isOfficialParagraph: true,
			paragraphType: paragraph.type,
		},
	};

	// Add optional fields
	if (paragraph.listType) {
		statement.doc!.listType = paragraph.listType;
	}

	if (paragraph.imageUrl) {
		statement.doc!.imageUrl = paragraph.imageUrl;
	}

	if (paragraph.imageAlt) {
		statement.doc!.imageAlt = paragraph.imageAlt;
	}

	if (paragraph.imageCaption) {
		statement.doc!.imageCaption = paragraph.imageCaption;
	}

	// Preserve header colors
	if (paragraph.type.startsWith('h') && 'color' in paragraph) {
		statement.color = (paragraph as { color?: string }).color;
	}

	return statement;
}

/**
 * Write paragraph statements in batches (max 500 per batch)
 */
async function writeParagraphStatementsInBatches(
	statements: Statement[]
): Promise<void> {
	// Split into batches of 500
	const batches: Statement[][] = [];
	for (let i = 0; i < statements.length; i += FIRESTORE_BATCH_SIZE) {
		batches.push(statements.slice(i, i + FIRESTORE_BATCH_SIZE));
	}

	// Execute each batch sequentially
	for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
		const batch = db.batch();
		const currentBatch = batches[batchIndex]!;

		for (const statement of currentBatch) {
			const ref = db.collection(COLLECTIONS.statements).doc(statement.statementId);
			batch.set(ref, statement);
		}

		await batch.commit();

		console.info(
			`    Batch ${batchIndex + 1}/${batches.length} committed (${currentBatch.length} statements)`
		);
	}
}

/**
 * Migrate a single document's paragraphs to sub-statements
 */
async function migrateDocument(
	docSnapshot: admin.firestore.QueryDocumentSnapshot,
	stats: MigrationStats
): Promise<void> {
	const docData = docSnapshot.data() as Statement;
	const documentId = docSnapshot.id;

	stats.processed++;

	// Skip if no paragraphs to migrate
	if (!docData.paragraphs || docData.paragraphs.length === 0) {
		stats.skippedNoParagraphs++;

		return;
	}

	// Check if already migrated (idempotent)
	const alreadyMigrated = await checkIfMigrated(documentId);
	if (alreadyMigrated) {
		stats.skippedAlreadyMigrated++;
		console.info(`  [SKIP] ${documentId}: Already migrated`);

		return;
	}

	try {
		// Get creator information
		const creator = await getCreatorInfo(docData.creatorId);

		// Convert paragraphs to sub-statements
		const paragraphStatements: Statement[] = [];
		for (const paragraph of docData.paragraphs) {
			const statement = createParagraphSubStatement(paragraph, documentId, creator);
			paragraphStatements.push(statement);
		}

		if (paragraphStatements.length === 0) {
			stats.skippedNoParagraphs++;

			return;
		}

		console.info(
			`  [${isDryRun ? 'DRY RUN' : 'MIGRATE'}] ${documentId}: ${paragraphStatements.length} paragraphs`
		);

		if (!isDryRun) {
			await writeParagraphStatementsInBatches(paragraphStatements);
		}

		stats.migrated++;
		stats.paragraphsCreated += paragraphStatements.length;
	} catch (error) {
		stats.errors++;
		const errorMessage = error instanceof Error ? error.message : String(error);
		stats.errorDetails.push({ documentId, error: errorMessage });
		console.error(`  [ERROR] ${documentId}:`, errorMessage);
	}
}

/**
 * Build query based on document type filter
 */
function buildQuery(): admin.firestore.Query {
	let query = db.collection(COLLECTIONS.statements).orderBy('createdAt');

	// Filter by document type if specified
	if (DOCUMENT_TYPE !== 'all') {
		query = query.where('statementType', '==', DOCUMENT_TYPE);
	}

	return query;
}

/**
 * Main migration function
 */
async function migrateAllDocuments(): Promise<void> {
	console.info('='.repeat(70));
	console.info('Migration: paragraphs[] array → Sub-Statement Documents');
	console.info('='.repeat(70));
	console.info(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
	console.info(`Batch size: ${BATCH_SIZE}`);
	console.info(`Document type filter: ${DOCUMENT_TYPE}`);
	if (RESUME_FROM) {
		console.info(`Resuming from: ${RESUME_FROM}`);
	}
	console.info('');

	const stats: MigrationStats = {
		processed: 0,
		migrated: 0,
		paragraphsCreated: 0,
		skippedNoParagraphs: 0,
		skippedAlreadyMigrated: 0,
		errors: 0,
		errorDetails: [],
	};

	try {
		const baseQuery = buildQuery();
		let lastDoc: admin.firestore.QueryDocumentSnapshot | undefined;
		let hasMore = true;
		let isResuming = !!RESUME_FROM;

		// If resuming, fetch the resume document first
		if (RESUME_FROM) {
			const resumeDoc = await db
				.collection(COLLECTIONS.statements)
				.doc(RESUME_FROM)
				.get();

			if (!resumeDoc.exists) {
				console.error(`Resume document ${RESUME_FROM} not found`);
				process.exit(1);
			}

			lastDoc = resumeDoc as admin.firestore.QueryDocumentSnapshot;
			console.info(`Found resume point: ${RESUME_FROM}`);
		}

		while (hasMore) {
			// Build paginated query
			let paginatedQuery = baseQuery.limit(BATCH_SIZE);
			if (lastDoc) {
				paginatedQuery = paginatedQuery.startAfter(lastDoc);
			}

			const snapshot = await paginatedQuery.get();

			if (snapshot.empty) {
				hasMore = false;
				break;
			}

			const batchDocs = snapshot.docs;
			console.info(`\nProcessing batch of ${batchDocs.length} documents...`);

			// Process each document in the batch
			for (const docSnapshot of batchDocs) {
				// Skip documents until we reach the resume point
				if (isResuming && docSnapshot.id !== RESUME_FROM) {
					continue;
				}
				isResuming = false;

				await migrateDocument(docSnapshot, stats);
			}

			// Update pagination cursor
			lastDoc = batchDocs[batchDocs.length - 1];

			// Check if we have more documents
			if (batchDocs.length < BATCH_SIZE) {
				hasMore = false;
			}

			// Log progress
			console.info(
				`Progress: ${stats.processed} processed, ${stats.migrated} migrated, ${stats.paragraphsCreated} paragraphs created`
			);
		}

		// Print summary
		console.info('\n' + '='.repeat(70));
		console.info('Migration Complete');
		console.info('='.repeat(70));
		console.info(`Total documents processed: ${stats.processed}`);
		console.info(`Documents migrated: ${stats.migrated}`);
		console.info(`Paragraph sub-statements created: ${stats.paragraphsCreated}`);
		console.info(`Skipped (no paragraphs): ${stats.skippedNoParagraphs}`);
		console.info(`Skipped (already migrated): ${stats.skippedAlreadyMigrated}`);
		console.info(`Errors: ${stats.errors}`);

		if (stats.errorDetails.length > 0) {
			console.info('\nError Details:');
			stats.errorDetails.forEach(({ documentId, error }) => {
				console.info(`  - ${documentId}: ${error}`);
			});
		}

		if (isDryRun) {
			console.info('\nThis was a dry run. Run without --dry-run to apply changes.');
		}

		// Exit with error code if there were errors
		if (stats.errors > 0) {
			process.exit(1);
		}
	} catch (error) {
		console.error('Migration failed:', error);
		process.exit(1);
	}
}

// Run the migration
console.info('Starting migration...');
console.info(`Environment: ${serviceAccount || 'Using application default credentials'}`);
console.info('');

migrateAllDocuments()
	.then(() => {
		console.info('\nMigration script finished.');
		process.exit(0);
	})
	.catch((error) => {
		console.error('Fatal error:', error);
		process.exit(1);
	});
