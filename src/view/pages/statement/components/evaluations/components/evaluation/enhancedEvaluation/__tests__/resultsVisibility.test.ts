import { areResultsUnlocked, shouldShowResults, ResultsUnlockedInput } from '../resultsVisibility';

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

describe('shouldShowResults (showEvaluation setting x role)', () => {
	it('setting off: nobody sees results, admin included', () => {
		expect(shouldShowResults(false, base)).toBe(false);
		expect(shouldShowResults(false, { ...base, isSpaceAdmin: true })).toBe(false);
		expect(shouldShowResults(false, { ...base, hasRated: true })).toBe(false);
	});

	it('setting on: admin sees at once, participant only after rating', () => {
		expect(shouldShowResults(true, { ...base, isSpaceAdmin: true })).toBe(true);
		expect(shouldShowResults(true, base)).toBe(false);
		expect(shouldShowResults(true, { ...base, hasRated: true })).toBe(true);
	});
});
