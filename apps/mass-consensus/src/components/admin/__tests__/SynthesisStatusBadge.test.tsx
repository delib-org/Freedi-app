import { resolveSynthesisBadgeState } from '../SynthesisStatusBadge';

describe('resolveSynthesisBadgeState', () => {
	it('returns "live" by default (both undefined → MC default-on)', () => {
		expect(
			resolveSynthesisBadgeState({
				surveyLiveSynthEnabled: undefined,
				questionLiveSynthEnabledOverride: undefined,
			})
		).toBe('live');
	});

	it('returns "survey-off" when survey is explicitly false, regardless of per-question', () => {
		expect(
			resolveSynthesisBadgeState({
				surveyLiveSynthEnabled: false,
				questionLiveSynthEnabledOverride: true,
			})
		).toBe('survey-off');
		expect(
			resolveSynthesisBadgeState({
				surveyLiveSynthEnabled: false,
				questionLiveSynthEnabledOverride: undefined,
			})
		).toBe('survey-off');
	});

	it('returns "disabled" when survey is on but per-question is explicitly false', () => {
		expect(
			resolveSynthesisBadgeState({
				surveyLiveSynthEnabled: true,
				questionLiveSynthEnabledOverride: false,
			})
		).toBe('disabled');
		expect(
			resolveSynthesisBadgeState({
				surveyLiveSynthEnabled: undefined, // defaults to on
				questionLiveSynthEnabledOverride: false,
			})
		).toBe('disabled');
	});

	it('returns "live" when both are explicitly true', () => {
		expect(
			resolveSynthesisBadgeState({
				surveyLiveSynthEnabled: true,
				questionLiveSynthEnabledOverride: true,
			})
		).toBe('live');
	});
});
