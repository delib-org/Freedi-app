/**
 * Vote Repository Interface
 *
 * Defines domain operations for Vote entities.
 * Implementations handle the underlying data source (Firebase, etc.).
 */

import { Vote } from '@freedi/shared-types';

export interface IVoteRepository {
	/** Persist a vote (creates or overwrites) */
	save(vote: Vote): Promise<void>;

	/** Delete a vote by its ID */
	delete(id: string): Promise<void>;

	/** Get all votes for a given statement (by parentId) */
	getByStatement(statementId: string): Promise<Vote[]>;

	/** Get a specific user's vote for a given parent statement */
	getByUser(userId: string, parentId: string): Promise<Vote | undefined>;
}
