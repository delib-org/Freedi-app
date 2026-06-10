import { StatementType } from '@freedi/shared-types';
import { NON_DOCUMENT_STATEMENT_TYPES } from '../statementTypeHelpers';

describe('statementTypeHelpers', () => {
	describe('NON_DOCUMENT_STATEMENT_TYPES', () => {
		it('contains every StatementType except document', () => {
			expect(NON_DOCUMENT_STATEMENT_TYPES).not.toContain(StatementType.document);
			expect(NON_DOCUMENT_STATEMENT_TYPES.length).toBe(Object.values(StatementType).length - 1);
		});

		it('fits within the Firestore `in`-filter 30-element cap', () => {
			expect(NON_DOCUMENT_STATEMENT_TYPES.length).toBeLessThanOrEqual(30);
		});
	});
});
