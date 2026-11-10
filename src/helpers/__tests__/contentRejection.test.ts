import { parseContentRejection } from '../contentRejection';

describe('parseContentRejection', () => {
	it('reads a moderation refusal', () => {
		expect(parseContentRejection(400, { reason: 'Rephrase', category: 'hate_speech' })).toEqual({
			reason: 'Rephrase',
			category: 'hate_speech',
		});
	});

	it('defaults a missing category', () => {
		expect(parseContentRejection(400, { reason: 'Rephrase' })).toEqual({
			reason: 'Rephrase',
			category: 'other',
		});
	});

	it.each([
		['another status', 500, { reason: 'Rephrase' }],
		['a 400 with no reason', 400, { error: 'Missing required fields' }],
		['a blank reason', 400, { reason: '  ' }],
		['a non-string reason', 400, { reason: 7 }],
		['no body', 400, null],
		['a text body', 400, 'Bad request'],
	])('ignores %s', (_name, status, body) => {
		expect(parseContentRejection(status, body)).toBeNull();
	});
});
