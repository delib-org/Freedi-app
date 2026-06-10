import { StatementType } from '@freedi/shared-types';

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
