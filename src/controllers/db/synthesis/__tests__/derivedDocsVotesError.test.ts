import { isDerivedDocsHaveVotesError } from '../derivedDocsVotesError';

describe('isDerivedDocsHaveVotesError', () => {
	it('detects the votes refusal', () => {
		expect(
			isDerivedDocsHaveVotesError({
				code: 'functions/failed-precondition',
				details: { reason: 'derived-docs-have-votes', hasVotes: true },
			}),
		).toBe(true);
	});

	it('ignores other failed-precondition errors and non-errors', () => {
		expect(
			isDerivedDocsHaveVotesError({
				code: 'functions/failed-precondition',
				details: { reason: 'x' },
			}),
		).toBe(false);
		expect(isDerivedDocsHaveVotesError({ code: 'functions/failed-precondition' })).toBe(false);
		expect(
			isDerivedDocsHaveVotesError({
				code: 'functions/internal',
				details: { reason: 'derived-docs-have-votes' },
			}),
		).toBe(false);
		expect(isDerivedDocsHaveVotesError(null)).toBe(false);
		expect(isDerivedDocsHaveVotesError('boom')).toBe(false);
	});
});
