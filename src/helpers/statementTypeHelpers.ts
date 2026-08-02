import { Statement, StatementType } from '@freedi/shared-types';

/**
 * All StatementType values except `document`. Used in Firestore `in` filters
 * to replace `where('statementType', '!=', 'document')`, which forces an
 * index scan with poor selectivity. Derived from the enum so adding a new
 * StatementType automatically includes it here — the matching unit test
 * (see __tests__/statementTypeHelpers.test.ts) catches the case where the
 * derivation is broken.
 */
export const NON_DOCUMENT_STATEMENT_TYPES: StatementType[] = Object.values(StatementType).filter(
	(t): t is StatementType => t !== StatementType.document,
);

/**
 * Statement types that belong in discussion feeds and child lists: everything
 * except `document` and `paragraph`. Paragraph children are the parent's rich
 * body content (rendered by StatementBody via its own subscription) — loading
 * them into chat listeners wastes reads and leaks body text into the feed.
 */
export const DISCUSSABLE_STATEMENT_TYPES: StatementType[] = NON_DOCUMENT_STATEMENT_TYPES.filter(
	(t) => t !== StatementType.paragraph,
);

/**
 * True when a statement is part of its parent document's rich BODY rather
 * than a discussable child. Two data shapes exist:
 * - canonical: `statementType === paragraph`
 * - legacy (Sign): `statementType === option` with `doc.isOfficialParagraph`
 *   (written by Sign's `createParagraphStatement`/migration; still the shape
 *   of most Sign documents until the option→paragraph data migration lands).
 *
 * Both must be excluded from chat feeds and child lists — otherwise a Sign
 * document's body paragraphs (raw HTML content) leak into the main app's
 * discussion view as chat messages.
 */
export function isDocumentBodyParagraph(statement: Statement): boolean {
	return (
		statement.statementType === StatementType.paragraph ||
		statement.doc?.isOfficialParagraph === true
	);
}
