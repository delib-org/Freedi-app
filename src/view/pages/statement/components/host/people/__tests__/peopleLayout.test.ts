import { isNewSpace, pickDefaultOpen, summaryLine, visiblePeopleAnchors } from '../peopleLayout';

describe('peopleLayout', () => {
	describe('visiblePeopleAnchors', () => {
		it('a group without waiting or questions', () => {
			expect(
				visiblePeopleAnchors({ isQuestion: false, showWaiting: false, hasJoinQuestions: false }),
			).toEqual(['join', 'members', 'questions', 'stakeholders']);
		});

		it('a question with everything, in IA order', () => {
			expect(
				visiblePeopleAnchors({ isQuestion: true, showWaiting: true, hasJoinQuestions: true }),
			).toEqual([
				'join',
				'waiting',
				'members',
				'questions',
				'entry-check',
				'stakeholders',
				'joining',
			]);
		});
	});

	describe('pickDefaultOpen', () => {
		const all = visiblePeopleAnchors({
			isQuestion: true,
			showWaiting: true,
			hasJoinQuestions: true,
		});

		it('Waiting first when someone waits', () => {
			expect(
				pickDefaultOpen({ available: all, waitingCount: 2, toReviewCount: 3, isNewSpace: true }),
			).toBe('waiting');
		});

		it('then Entry check when answers wait for review', () => {
			expect(
				pickDefaultOpen({ available: all, waitingCount: 0, toReviewCount: 3, isNewSpace: true }),
			).toBe('entry-check');
		});

		it('then Who can join on a brand-new space', () => {
			expect(
				pickDefaultOpen({ available: all, waitingCount: 0, toReviewCount: 0, isNewSpace: true }),
			).toBe('join');
		});

		it('else nothing', () => {
			expect(
				pickDefaultOpen({ available: all, waitingCount: 0, toReviewCount: 0, isNewSpace: false }),
			).toBeNull();
		});

		it('skips a subsection that is not shown', () => {
			expect(
				pickDefaultOpen({
					available: ['join', 'members'],
					waitingCount: 0,
					toReviewCount: 4,
					isNewSpace: false,
				}),
			).toBeNull();
		});
	});

	describe('isNewSpace', () => {
		it('is unknown (false) until the count arrives', () => expect(isNewSpace(null)).toBe(false));
		it('only the creator: new', () => expect(isNewSpace(1)).toBe(true));
		it('anyone else joined: not new', () => expect(isNewSpace(2)).toBe(false));
	});

	describe('summaryLine', () => {
		it('joins the parts that apply with a middle dot', () => {
			expect(summaryLine(['Open to all', false, null, '', 'same as the group'])).toBe(
				'Open to all · same as the group',
			);
		});
	});
});
