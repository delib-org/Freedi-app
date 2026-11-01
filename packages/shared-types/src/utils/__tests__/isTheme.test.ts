import { isTheme } from '../otherIdeas';

describe('isTheme', () => {
	it('is true for a topic-cluster', () => {
		expect(isTheme({ isCluster: true, derivedByPipeline: 'topic-cluster' })).toBe(true);
	});

	it('is false for a cluster without derivedByPipeline (manual merge, legacy)', () => {
		expect(isTheme({ isCluster: true })).toBe(false);
	});

	it('is false for a cluster of an unknown pipeline', () => {
		expect(isTheme({ isCluster: true, derivedByPipeline: 'unknown-cluster' })).toBe(false);
	});

	it('is false for a synthesis', () => {
		expect(isTheme({ isCluster: true, derivedByPipeline: 'synthesis' })).toBe(false);
	});

	it('is false for a plain option', () => {
		expect(isTheme({})).toBe(false);
		expect(isTheme({ isCluster: false, derivedByPipeline: 'topic-cluster' })).toBe(false);
	});
});
