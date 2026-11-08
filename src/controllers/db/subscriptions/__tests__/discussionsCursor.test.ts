import {
	getDiscussionsCursor,
	recordDiscussionsCursor,
	resetDiscussionsCursor,
} from '../discussionsCursor';

describe('discussionsCursor', () => {
	beforeEach(() => {
		resetDiscussionsCursor();
	});

	it('starts empty', () => {
		expect(getDiscussionsCursor()).toBeNull();
	});

	it('takes the first page boundary', () => {
		recordDiscussionsCursor(500);

		expect(getDiscussionsCursor()).toBe(500);
	});

	it('only moves backwards: a live snapshot whose window shifted forward keeps the pager position', () => {
		recordDiscussionsCursor(500);
		recordDiscussionsCursor(300); // pager loaded an older page
		recordDiscussionsCursor(650); // live listener window moved forward

		expect(getDiscussionsCursor()).toBe(300);
	});

	it('ignores pages without a numeric lastUpdate', () => {
		recordDiscussionsCursor(undefined);

		expect(getDiscussionsCursor()).toBeNull();
	});
});
