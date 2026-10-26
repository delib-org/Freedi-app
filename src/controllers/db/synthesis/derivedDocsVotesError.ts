/** Mirrors `DERIVED_DOCS_HAVE_VOTES_REASON` in functions/src/synthesis/derivedDocVotes.ts. */
export const DERIVED_DOCS_HAVE_VOTES_REASON = 'derived-docs-have-votes';

const FAILED_PRECONDITION_CODE = 'functions/failed-precondition';

/**
 * True when a re-cluster / global-cluster callable was refused because the
 * question's merged ideas (synths, topics) already hold participant votes.
 */
export function isDerivedDocsHaveVotesError(error: unknown): boolean {
	if (typeof error !== 'object' || error === null) return false;
	const { code, details } = error as { code?: unknown; details?: unknown };
	if (code !== FAILED_PRECONDITION_CODE) return false;
	if (typeof details !== 'object' || details === null) return false;

	return (details as { reason?: unknown }).reason === DERIVED_DOCS_HAVE_VOTES_REASON;
}
