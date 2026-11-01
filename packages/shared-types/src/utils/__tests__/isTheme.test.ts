import { isTheme } from '../otherIdeas';

describe('isTheme', () => {
	it('is true for a topic-cluster', () => {
		expect(isTheme({ isCluster: true, derivedByPipeline: 'topic-cluster' })).toBe(true);
	});

	it('is true for a legacy cluster without derivedByPipeline', () => {
		expect(isTheme({ isCluster: true })).toBe(true);
	});

	it('is false for a synthesis', () => {
		expect(isTheme({ isCluster: true, derivedByPipeline: 'synthesis' })).toBe(false);
	});

	it('is false for a plain option', () => {
		expect(isTheme({})).toBe(false);
		expect(isTheme({ isCluster: false, derivedByPipeline: 'topic-cluster' })).toBe(false);
	});
});
