import { areResultsUnlocked, ResultsUnlockedInput } from '../resultsVisibility';

const base: ResultsUnlockedInput = {
	isCard: true,
	isOwnAnswer: false,
	hasRated: false,
	evaluationDisabled: false,
	isSpaceAdmin: false,
};

describe('areResultsUnlocked', () => {
	it('keeps results locked for a participant who has not rated', () => {
		expect(areResultsUnlocked(base)).toBe(false);
	});

	it('unlocks after the participant rates', () => {
		expect(areResultsUnlocked({ ...base, hasRated: true })).toBe(true);
	});

	it('unlocks immediately for an admin of the space', () => {
		expect(areResultsUnlocked({ ...base, isSpaceAdmin: true })).toBe(true);
	});

	it('unlocks on own answer and when rating is disabled', () => {
		expect(areResultsUnlocked({ ...base, isOwnAnswer: true })).toBe(true);
		expect(areResultsUnlocked({ ...base, evaluationDisabled: true })).toBe(true);
	});

	it('is never locked outside the card variant', () => {
		expect(areResultsUnlocked({ ...base, isCard: false })).toBe(true);
	});
});
