import { array, InferOutput, number, object, optional, string } from "valibot";

/**
 * Tombstone written by a Cloud Function when a statement document is
 * hard-deleted. Clients that bulk-loaded a scope listen to this collection
 * (filtered by parentId / parents + deletedAtMs) to remove deleted
 * statements without re-reading the whole scope.
 * Documents expire via a Firestore TTL policy on `expireAt`.
 */
export const StatementDeletionSchema = object({
    statementId: string(),
    parentId: string(),
    topParentId: optional(string()),
    parents: optional(array(string())),
    deletedAtMs: number(),
});

export type StatementDeletion = InferOutput<typeof StatementDeletionSchema>;
