// Shared enums used by both versionModel and coherenceModel.
// Kept in their own module to avoid a circular import between the two
// (versionModel imports ParagraphReasoningPathSchema from coherenceModel,
// which needs these enums at module-init time).

/**
 * Admin decision on a proposed change
 */
export enum ChangeDecision {
	pending = 'pending', // Not yet reviewed
	approved = 'approved', // Accepted as-is
	rejected = 'rejected', // Not included in version
	modified = 'modified', // Accepted with edits
}

/**
 * Source type for a change
 */
export enum ChangeSourceType {
	suggestion = 'suggestion', // From a user suggestion
	comment = 'comment', // From a user comment
	rejectionReason = 'rejectionReason', // From document-level rejection feedback
}
