import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
	Collections,
	Statement,
	StatementType,
	FullExportRequest,
	FullExportResponse,
	functionConfig,
	toExportRows,
} from '@freedi/shared-types';
import { db } from './index';
import { assertStatementAdmin } from './utils/assertStatementAdmin';
import { logError } from './utils/errorHandling';

const PAGE_SIZE = 500;

/** Document-body rows are not ideas: the client selector drops them too. */
function isDocumentBodyRow(statement: Statement): boolean {
	return (
		statement.statementType === StatementType.paragraph ||
		statement.statementType === StatementType.document ||
		statement.doc?.isOfficialParagraph === true
	);
}

/** A topic-cluster theme that holds no ideas is an empty shell, not data. */
function isEmptyTheme(statement: Statement): boolean {
	return (
		statement.isCluster === true &&
		statement.derivedByPipeline === 'topic-cluster' &&
		(statement.integratedOptions ?? []).length === 0
	);
}

/** Every child of the statement, hidden ones included, paged by document id. */
async function readAllChildren(firestore: Firestore, statementId: string): Promise<Statement[]> {
	const children: Statement[] = [];
	let last: QueryDocumentSnapshot | undefined;

	for (;;) {
		let query = firestore
			.collection(Collections.statements)
			.where('parentId', '==', statementId)
			.orderBy('__name__')
			.limit(PAGE_SIZE);

		if (last) query = query.startAfter(last);

		const snapshot = await query.get();

		snapshot.docs.forEach((doc) => children.push(doc.data() as Statement));
		if (snapshot.docs.length < PAGE_SIZE) break;
		last = snapshot.docs[snapshot.docs.length - 1];
	}

	return children;
}

export async function applyFullExport(
	firestore: Firestore,
	uid: string | undefined,
	data: Partial<FullExportRequest> | undefined,
): Promise<FullExportResponse> {
	if (!uid) {
		throw new HttpsError('unauthenticated', 'User must be authenticated');
	}

	const statementId = data?.statementId;

	if (!statementId || typeof statementId !== 'string') {
		throw new HttpsError('invalid-argument', 'statementId is required');
	}

	try {
		const main = await assertStatementAdmin(firestore, statementId, uid);
		const all = await readAllChildren(firestore, statementId);
		const candidates = all.filter((child) => !isDocumentBodyRow(child));
		const children = candidates.filter((child) => !isEmptyTheme(child));
		const rows = toExportRows(main, children);

		return {
			...rows,
			meta: {
				total: children.length,
				hiddenCount: children.filter((child) => child.hide === true).length,
				skippedEmptyThemes: candidates.length - children.length,
				exportedAt: Date.now(),
			},
		};
	} catch (error) {
		if (error instanceof HttpsError) throw error;

		logError(error, { operation: 'fullExport.applyFullExport', userId: uid, statementId });
		throw new HttpsError('internal', 'Export failed');
	}
}

/**
 * Admin export of a question: every child read server-side with the Admin SDK,
 * so the file never depends on what the admin's browser happened to load.
 */
export const fullExport = onCall<FullExportRequest>(
	{
		region: functionConfig.region,
		timeoutSeconds: 300,
		memory: '1GiB',
	},
	async (request): Promise<FullExportResponse> =>
		applyFullExport(db, request.auth?.uid, request.data),
);
