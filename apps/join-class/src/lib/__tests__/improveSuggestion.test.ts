import { describe, it, expect } from 'vitest';
import type { Statement } from '@freedi/shared-types';
import {
	messageToCommentContent,
	buildImprovePayload,
	composeDraftText,
} from '../improveSuggestion';

function fakeStatement(overrides: Partial<Statement>): Statement {
	return { statementId: 'id', statement: '', description: '', ...overrides } as Statement;
}

describe('messageToCommentContent', () => {
	it('returns the title line for a single-line message', () => {
		const msg = fakeStatement({ statement: 'Great idea', description: '' });
		expect(messageToCommentContent(msg)).toBe('Great idea');
	});

	it("splits multi-paragraph bodies on the server's ' | ' join", () => {
		const msg = fakeStatement({
			statement: 'Two points',
			description: 'First point | Second point',
		});
		expect(messageToCommentContent(msg)).toBe('Two points\nFirst point\nSecond point');
	});

	it('drops empty fragments', () => {
		const msg = fakeStatement({ statement: 'Title', description: ' |  | Body' });
		expect(messageToCommentContent(msg)).toBe('Title\nBody');
	});
});

describe('buildImprovePayload', () => {
	const option = fakeStatement({ statementId: 'opt1', statement: 'My suggestion' });
	const question = fakeStatement({
		statementId: 'q1',
		statement: 'How to improve the park?',
		description: 'Context here',
	});

	it('joins paragraph children into the description with newlines', () => {
		const paragraphs = [
			fakeStatement({ statement: 'Para one' }),
			fakeStatement({ statement: 'Para two' }),
		];
		const payload = buildImprovePayload(option, paragraphs, question, []);
		expect(payload.title).toBe('My suggestion');
		expect(payload.description).toBe('Para one\nPara two');
		expect(payload.parentTitle).toBe('How to improve the park?');
		expect(payload.parentDescription).toBe('Context here');
	});

	it('omits the description when there are no paragraph children', () => {
		const payload = buildImprovePayload(option, null, question, []);
		expect(payload.description).toBeUndefined();
	});

	it('flattens helpful messages into comment contents, dropping empty ones', () => {
		const helpful = [
			fakeStatement({ statement: 'Add benches', description: '' }),
			fakeStatement({ statement: '', description: '' }),
			fakeStatement({ statement: 'More shade', description: 'Trees | Awnings' }),
		];
		const payload = buildImprovePayload(option, null, question, helpful);
		expect(payload.comments).toEqual([
			{ content: 'Add benches' },
			{ content: 'More shade\nTrees\nAwnings' },
		]);
	});

	it('handles a missing question without parent context', () => {
		const payload = buildImprovePayload(option, null, null, []);
		expect(payload.parentTitle).toBeUndefined();
		expect(payload.parentDescription).toBeUndefined();
	});
});

describe('composeDraftText', () => {
	it('produces first-line-title text matching the updateSuggestion contract', () => {
		const text = composeDraftText('New title', 'Body one\nBody two');
		expect(text).toBe('New title\nBody one\nBody two');
		// Round-trip: the first line is the title, the rest become paragraphs.
		const [title, ...paras] = text.split('\n');
		expect(title).toBe('New title');
		expect(paras).toEqual(['Body one', 'Body two']);
	});

	it('handles a title-only draft', () => {
		expect(composeDraftText('Just a title', undefined)).toBe('Just a title');
		expect(composeDraftText('Just a title', '')).toBe('Just a title');
	});

	it('trims whitespace and drops blank lines', () => {
		expect(composeDraftText('  Title  ', ' Body \n\n  ')).toBe('Title\nBody');
	});
});
