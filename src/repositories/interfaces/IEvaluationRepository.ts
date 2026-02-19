/**
 * Evaluation Repository Interface
 *
 * Defines domain operations for Evaluation entities.
 * Implementations handle the underlying data source (Firebase, etc.).
 */

import { Evaluation } from '@freedi/shared-types';

export interface IEvaluationRepository {
	/** Retrieve a single evaluation by its ID */
	getById(id: string): Promise<Evaluation | undefined>;

	/** Persist an evaluation (creates or overwrites) */
	save(evaluation: Evaluation): Promise<void>;

	/** Delete an evaluation by its ID */
	delete(id: string): Promise<void>;

	/** Get all evaluations for a given statement (by parentId) */
	getByStatement(statementId: string): Promise<Evaluation[]>;

	/** Get a specific user's evaluation for a given statement */
	getByUser(userId: string, statementId: string): Promise<Evaluation | undefined>;
}
