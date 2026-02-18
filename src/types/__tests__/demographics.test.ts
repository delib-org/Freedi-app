import type { MemberReviewData, InheritedQuestion } from '../demographics';
import { UserDemographicQuestionType } from '@freedi/shared-types';

describe('demographics types', () => {
	describe('MemberReviewData', () => {
		it('should accept a valid MemberReviewData object', () => {
			const data: MemberReviewData = {
				userId: 'user123',
				user: { uid: 'user123', displayName: 'Test User' } as MemberReviewData['user'],
				responses: [
					{
						questionId: 'q1',
						question: 'What is your age?',
						answer: '25',
						answeredAt: Date.now(),
					},
				],
				flags: [],
				status: 'pending',
			};

			expect(data.userId).toBe('user123');
			expect(data.responses).toHaveLength(1);
			expect(data.status).toBe('pending');
		});

		it('should accept all valid status values', () => {
			const statuses: MemberReviewData['status'][] = ['pending', 'approved', 'flagged', 'banned'];
			statuses.forEach((status) => {
				const data: MemberReviewData = {
					userId: 'user1',
					user: { uid: 'user1', displayName: 'User' } as MemberReviewData['user'],
					responses: [],
					flags: [],
					status,
				};
				expect(data.status).toBe(status);
			});
		});

		it('should allow optional fields', () => {
			const data: MemberReviewData = {
				userId: 'user1',
				user: { uid: 'user1', displayName: 'User' } as MemberReviewData['user'],
				responses: [],
				flags: [],
				status: 'pending',
			};

			expect(data.role).toBeUndefined();
			expect(data.joinedAt).toBeUndefined();
		});
	});

	describe('InheritedQuestion', () => {
		it('should accept a valid InheritedQuestion object', () => {
			const question: InheritedQuestion = {
				userQuestionId: 'q1',
				question: 'What is your role?',
				type: UserDemographicQuestionType.radio,
				statementId: 'stmt1',
				topParentId: 'top1',
				userId: 'user1',
				sourceStatementId: 'parent1',
				sourceStatementTitle: 'Parent Discussion',
				sourceType: 'group',
				isEnabled: true,
			} as InheritedQuestion;

			expect(question.sourceStatementId).toBe('parent1');
			expect(question.sourceType).toBe('group');
			expect(question.isEnabled).toBe(true);
		});

		it('should accept both source types', () => {
			const types: InheritedQuestion['sourceType'][] = ['group', 'discussion'];
			types.forEach((sourceType) => {
				const q = {
					sourceStatementId: 'stmt1',
					sourceStatementTitle: 'Test',
					sourceType,
					isEnabled: false,
				} as InheritedQuestion;
				expect(q.sourceType).toBe(sourceType);
			});
		});
	});
});
