/**
 * Injectable store ports for the shared paragraph CRUD layer.
 *
 * This package is SDK-agnostic: it must NOT import `firebase` or
 * `firebase-admin`. Each app implements a `ParagraphStore` from its own SDK
 * (client SDK for Main/Join, admin SDK for Sign/MC server) and passes it in via
 * `ParagraphDeps`. The CRUD logic in `paragraphCrud.ts` is written once against
 * these ports.
 */

import type { Statement, User } from '@freedi/shared-types';

/**
 * A write batch over paragraph statements. Implementations MUST chunk at the
 * Firestore 500-write limit inside `commit()`.
 */
export interface ParagraphBatch {
	/** Stage creation of a new paragraph statement. */
	set(statement: Statement): void;
	/** Stage a field patch on an existing statement (supports dot-path keys). */
	update(statementId: string, patch: Record<string, unknown>): void;
	/** Stage deletion of a statement. */
	delete(statementId: string): void;
	/** Commit all staged writes. */
	commit(): Promise<void>;
}

/**
 * Abstraction over a Firestore instance for paragraph operations. Implemented
 * per app from either the client SDK (`firebase/firestore`) or the admin SDK
 * (`firebase-admin/firestore`).
 */
export interface ParagraphStore {
	/**
	 * Query the non-hidden paragraph children of `hostId`
	 * (`parentId === hostId && statementType === paragraph && !hide`), unsorted.
	 */
	getParagraphChildren(hostId: string): Promise<Statement[]>;
	/** Start a write batch. */
	batch(): ParagraphBatch;
	/** Single-document field patch (supports dot-path keys like `doc.listType`). */
	update(statementId: string, patch: Record<string, unknown>): Promise<void>;
	/** Single-document delete. */
	delete(statementId: string): Promise<void>;
	/** Current timestamp in milliseconds. */
	now(): number;
	/**
	 * Optional real-time listener (client SDK only). Receives the non-hidden
	 * paragraph children; the shared layer sorts them before invoking the caller.
	 * Returns an unsubscribe function.
	 */
	listen?(hostId: string, cb: (paragraphs: Statement[]) => void): () => void;
}

/** Dependencies passed to every shared paragraph CRUD function. */
export interface ParagraphDeps {
	store: ParagraphStore;
	/** Resolves the current creator (redux store / session / system user). */
	creator: () => User | undefined;
	/** Structured error logger. */
	logError: (error: unknown, context?: Record<string, unknown>) => void;
}
