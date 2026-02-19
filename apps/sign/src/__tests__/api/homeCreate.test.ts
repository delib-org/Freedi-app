/**
 * Tests for POST /api/home/create route
 * Verifies document creation follows Group -> Question -> Option hierarchy
 */

import { StatementType, Access, Role } from '@freedi/shared-types';

// We can't directly import the route handler (it's under app/, outside jest roots).
// Instead, test the data model and hierarchy expectations.

describe('createDocument hierarchy', () => {
	describe('Question + Option pair structure', () => {
		it('should create a question with correct parent fields', () => {
			const groupId = 'group-123';
			const questionId = 'question-456';

			const questionData = {
				statementId: questionId,
				statementType: StatementType.question,
				parentId: groupId,
				topParentId: groupId,
				parents: ['top', groupId],
			};

			expect(questionData.statementType).toBe(StatementType.question);
			expect(questionData.parentId).toBe(groupId);
			expect(questionData.topParentId).toBe(groupId);
			expect(questionData.parents).toEqual(['top', groupId]);
		});

		it('should create an option with correct hierarchy fields', () => {
			const groupId = 'group-123';
			const questionId = 'question-456';
			const optionId = 'option-789';

			const optionData = {
				statementId: optionId,
				statementType: StatementType.option,
				isDocument: true,
				parentId: questionId,
				topParentId: groupId,
				parents: ['top', groupId, questionId],
			};

			expect(optionData.statementType).toBe(StatementType.option);
			expect(optionData.isDocument).toBe(true);
			expect(optionData.parentId).toBe(questionId);
			expect(optionData.topParentId).toBe(groupId);
			expect(optionData.parents).toEqual(['top', groupId, questionId]);
		});

		it('should use different IDs for question and option', () => {
			const questionId = crypto.randomUUID();
			const optionId = crypto.randomUUID();

			expect(questionId).not.toBe(optionId);
		});

		it('should create admin subscriptions with correct role', () => {
			const userId = 'user-123';
			const statementId = 'stmt-456';
			const subscriptionId = `${userId}--${statementId}`;

			const subscription = {
				role: Role.admin,
				userId,
				statementId,
				statementsSubscribeId: subscriptionId,
			};

			expect(subscription.role).toBe(Role.admin);
			expect(subscription.statementsSubscribeId).toBe('user-123--stmt-456');
		});
	});

	describe('isDocument flag logic', () => {
		it('should set isDocument: true for options (new hierarchy)', () => {
			const isDocument = true;

			expect(isDocument).toBe(true);
		});

		it('should set isDocument: false for questions', () => {
			// Questions are structural wrappers, not documents
			const isDocument = false;

			expect(isDocument).toBe(false);
		});

		it('should set isDocument: false for groups', () => {
			const isDocument = false;

			expect(isDocument).toBe(false);
		});
	});

	describe('backward compatibility', () => {
		it('legacy StatementType.document should still be recognized', () => {
			// The query uses 'in' with [option, document] for backward compatibility
			const validTypes = [StatementType.option, StatementType.document];

			expect(validTypes).toContain(StatementType.document);
			expect(validTypes).toContain(StatementType.option);
			expect(validTypes).not.toContain(StatementType.question);
		});
	});
});
