import { childTopParentId } from '../models/statement/treeFields';
import { QUARANTINED_ACCESS_SCOPE, isQuarantinedScope } from '../models/statement/accessScope';

describe('childTopParentId', () => {
	it('gives a child of a top statement the top id, even when the top stores "top"', () => {
		expect(childTopParentId({ statementId: 'root', parentId: 'top', topParentId: 'top' })).toBe(
			'root',
		);
		expect(childTopParentId({ statementId: 'root', parentId: 'top', topParentId: 'root' })).toBe(
			'root',
		);
	});

	it('copies the topParentId of any other parent', () => {
		expect(childTopParentId({ statementId: 'q', parentId: 'root', topParentId: 'root' })).toBe(
			'root',
		);
	});

	it('falls back to the parent id when the parent has no topParentId', () => {
		expect(childTopParentId({ statementId: 'q', parentId: 'root' })).toBe('q');
	});

	it('copies when the parentId is unknown, as callers holding only the top did', () => {
		expect(childTopParentId({ statementId: 'doc', topParentId: 'group' })).toBe('group');
	});
});

describe('isQuarantinedScope', () => {
	it('knows the quarantine value and nothing else', () => {
		expect(isQuarantinedScope(QUARANTINED_ACCESS_SCOPE)).toBe(true);
		expect(isQuarantinedScope('open')).toBe(false);
		expect(isQuarantinedScope(undefined)).toBe(false);
	});
});
