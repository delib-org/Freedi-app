import {
	collection,
	deleteDoc,
	getDocs,
	onSnapshot,
	query,
	updateDoc,
	where,
	writeBatch,
} from 'firebase/firestore';
import type { DocumentData, UpdateData } from 'firebase/firestore';
import { Collections, StatementType } from '@freedi/shared-types';
import type { Statement } from '@freedi/shared-types';
import type { ParagraphBatch, ParagraphDeps, ParagraphStore } from '@freedi/shared-utils';
import { FireStore } from '../config';
import { createStatementRef, getCurrentTimestamp } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { store } from '@/redux/store';

/**
 * Main-app (client SDK) implementation of the shared {@link ParagraphStore}.
 * Wires the canonical paragraph CRUD layer in `@freedi/shared-utils` to the
 * Firestore web SDK + the redux creator.
 */
const paragraphStore: ParagraphStore = {
	async getParagraphChildren(hostId: string): Promise<Statement[]> {
		const q = query(
			collection(FireStore, Collections.statements),
			where('parentId', '==', hostId),
			where('statementType', '==', StatementType.paragraph),
		);
		const snap = await getDocs(q);

		return snap.docs.map((d) => d.data() as Statement).filter((p) => p.hide !== true);
	},

	batch(): ParagraphBatch {
		const batch = writeBatch(FireStore);

		return {
			set: (statement) => batch.set(createStatementRef(statement.statementId), statement),
			update: (id, patch) =>
				batch.update(createStatementRef(id), patch as UpdateData<DocumentData>),
			delete: (id) => batch.delete(createStatementRef(id)),
			commit: () => batch.commit(),
		};
	},

	async update(id, patch): Promise<void> {
		await updateDoc(createStatementRef(id), patch as UpdateData<DocumentData>);
	},

	async delete(id): Promise<void> {
		await deleteDoc(createStatementRef(id));
	},

	now(): number {
		return getCurrentTimestamp();
	},

	listen(hostId, cb): () => void {
		const q = query(
			collection(FireStore, Collections.statements),
			where('parentId', '==', hostId),
			where('statementType', '==', StatementType.paragraph),
		);

		return onSnapshot(q, (snap) => {
			cb(snap.docs.map((d) => d.data() as Statement).filter((p) => p.hide !== true));
		});
	},
};

/** Shared-CRUD dependencies for the main app. */
export const paragraphDeps: ParagraphDeps = {
	store: paragraphStore,
	creator: () => store.getState().creator?.creator ?? undefined,
	logError: (error, context) => logError(error, { operation: 'paragraphCrud', ...(context ?? {}) }),
};
