import { StatementType } from '@freedi/shared-types';
import { DISCUSSABLE_STATEMENT_TYPES, NON_DOCUMENT_STATEMENT_TYPES } from '../statementTypeHelpers';

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

	describe('DISCUSSABLE_STATEMENT_TYPES', () => {
		it('contains every StatementType except document and paragraph', () => {
			expect(DISCUSSABLE_STATEMENT_TYPES).not.toContain(StatementType.document);
			expect(DISCUSSABLE_STATEMENT_TYPES).not.toContain(StatementType.paragraph);
			expect(DISCUSSABLE_STATEMENT_TYPES.length).toBe(Object.values(StatementType).length - 2);
		});

		it('fits within the Firestore `in`-filter 30-element cap', () => {
			expect(DISCUSSABLE_STATEMENT_TYPES.length).toBeLessThanOrEqual(30);
		});
	});
});
