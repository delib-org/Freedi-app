import {
	deriveAgoraOutcome,
	AgoraOutcomeInput,
} from '../models/agora/agoraOutcome';
import { AgoraSessionOutcome } from '../models/agora/agoraEnums';
import { AGORA_OUTCOME } from '../models/agora/agoraConstants';

function input(overrides: Partial<AgoraOutcomeInput>): AgoraOutcomeInput {
	return {
		total: 0,
		threshold: 70,
		crossRatedProposals: 0,
		raterCoverage: 0,
		...overrides,
	};
}

describe('deriveAgoraOutcome', () => {
	it('returns success at exactly the threshold', () => {
		expect(deriveAgoraOutcome(input({ total: 70 }))).toBe(
			AgoraSessionOutcome.success
		);
	});

	it('returns success above the threshold regardless of coverage', () => {
		expect(
			deriveAgoraOutcome(
				input({ total: 100, crossRatedProposals: 0, raterCoverage: 0 })
			)
		).toBe(AgoraSessionOutcome.success);
	});

	it('returns honestDisagreement below threshold when divergence was mapped', () => {
		expect(
			deriveAgoraOutcome(
				input({
					total: 69,
					crossRatedProposals: AGORA_OUTCOME.MIN_CROSS_RATED_PROPOSALS,
					raterCoverage: AGORA_OUTCOME.MIN_RATER_COVERAGE,
				})
			)
		).toBe(AgoraSessionOutcome.honestDisagreement);
	});

	it('returns collapse when cross-rated proposals fall short', () => {
		expect(
			deriveAgoraOutcome(
				input({
					total: 69,
					crossRatedProposals: AGORA_OUTCOME.MIN_CROSS_RATED_PROPOSALS - 1,
					raterCoverage: 1,
				})
			)
		).toBe(AgoraSessionOutcome.collapse);
	});

	it('returns collapse when rater coverage falls short', () => {
		expect(
			deriveAgoraOutcome(
				input({
					total: 69,
					crossRatedProposals: 10,
					raterCoverage: AGORA_OUTCOME.MIN_RATER_COVERAGE - 0.01,
				})
			)
		).toBe(AgoraSessionOutcome.collapse);
	});

	it('returns collapse for a degenerate empty session', () => {
		expect(deriveAgoraOutcome(input({}))).toBe(AgoraSessionOutcome.collapse);
	});
});
