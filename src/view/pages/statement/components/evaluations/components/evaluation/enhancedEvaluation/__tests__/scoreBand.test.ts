import {
	getConsensusBarPercent,
	getScoreBand,
	getScoreTone,
	SCORE_BAND_LABEL_KEYS,
} from '../scoreBand';

describe('scoreBand', () => {
	it.each([
		[1, 'broad'],
		[0.6, 'broad'],
		[0.59, 'partial'],
		[0.3, 'partial'],
		[0.29, 'divided'],
		[0, 'divided'],
		[-0.09, 'divided'],
		[-0.1, 'opposition'],
		[-1, 'opposition'],
	])('score %p is %p', (score, band) => {
		expect(getScoreBand(score)).toBe(band);
	});

	it.each([
		[0.8, 'positive'],
		[0.3, 'positive'],
		[0.29, 'split'],
		[-0.09, 'split'],
		[-0.1, 'negative'],
	])('score %p is coloured %p', (score, tone) => {
		expect(getScoreTone(score)).toBe(tone);
	});

	it('has a label key for every band', () => {
		expect(SCORE_BAND_LABEL_KEYS).toEqual({
			broad: 'Broad agreement',
			partial: 'Partial agreement',
			divided: 'Divided opinion',
			opposition: 'Opposition',
		});
	});

	it('maps -1…1 onto a 0…100% bar and clamps outliers', () => {
		expect(getConsensusBarPercent(-1)).toBe(0);
		expect(getConsensusBarPercent(0)).toBe(50);
		expect(getConsensusBarPercent(0.81)).toBe(91);
		expect(getConsensusBarPercent(1)).toBe(100);
		expect(getConsensusBarPercent(3)).toBe(100);
		expect(getConsensusBarPercent(-2)).toBe(0);
	});
});
