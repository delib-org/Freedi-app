import { Collections, StatementType } from '@freedi/shared-types';
import type { Statement, User } from '@freedi/shared-types';
import type { ParagraphBatch, ParagraphDeps, ParagraphStore } from '@freedi/shared-utils';
import { getFirestoreAdmin } from './admin';
import { logError } from '../utils/errorHandling';

/**
 * Mass-Consensus (admin SDK) implementation of the shared {@link ParagraphStore}.
 * Server-side only. Wires the canonical paragraph CRUD layer in
 * `@freedi/shared-utils` to the Firebase Admin SDK.
 */
const mcParagraphStore: ParagraphStore = {
	async getParagraphChildren(hostId: string): Promise<Statement[]> {
		const db = getFirestoreAdmin();
		const snap = await db
			.collection(Collections.statements)
			.where('parentId', '==', hostId)
			.where('statementType', '==', StatementType.paragraph)
			.get();

		return snap.docs.map((d) => d.data() as Statement).filter((p) => p.hide !== true);
	},

	batch(): ParagraphBatch {
		const db = getFirestoreAdmin();
		const batch = db.batch();
		const ref = (id: string) => db.collection(Collections.statements).doc(id);

		return {
			set: (statement) => batch.set(ref(statement.statementId), statement),
			update: (id, patch) => batch.update(ref(id), patch),
			delete: (id) => batch.delete(ref(id)),
			commit: async () => {
				await batch.commit();
			},
		};
	},

	async update(id, patch): Promise<void> {
		await getFirestoreAdmin().collection(Collections.statements).doc(id).update(patch);
	},

	async delete(id): Promise<void> {
		await getFirestoreAdmin().collection(Collections.statements).doc(id).delete();
	},

	now(): number {
		return Date.now();
	},
};

/**
 * Build request-scoped shared-CRUD dependencies for MC server routes. The
 * creator varies per request, so pass it in explicitly.
 */
export function makeMcParagraphDeps(creator: User): ParagraphDeps {
	return {
		store: mcParagraphStore,
		creator: () => creator,
		logError: (error, context) =>
			logError(error, { operation: 'paragraphCrud', ...(context ?? {}) }),
	};
}

export { mcParagraphStore };
