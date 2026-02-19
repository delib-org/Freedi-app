/**
 * Statement Repository Interface
 *
 * Defines domain operations for Statement entities.
 * Implementations handle the underlying data source (Firebase, etc.).
 */

import { Statement } from '@freedi/shared-types';
import { Unsubscribe } from 'firebase/auth';

export interface IStatementRepository {
	/** Retrieve a single statement by its ID */
	getById(id: string): Promise<Statement | undefined>;

	/** Persist a new statement (creates or overwrites) */
	save(statement: Statement): Promise<void>;

	/** Update specific fields on an existing statement */
	update(id: string, fields: Partial<Statement>): Promise<void>;

	/** Delete a statement by its ID */
	delete(id: string): Promise<void>;

	/** Get all direct children of a parent statement */
	getChildrenByParent(parentId: string): Promise<Statement[]>;

	/** Listen to real-time changes on a single statement document */
	listenToDocument(id: string, callback: (statement: Statement | undefined) => void): Unsubscribe;

	/** Listen to real-time changes on children of a parent statement */
	listenToChildren(parentId: string, callback: (statements: Statement[]) => void): Unsubscribe;
}
