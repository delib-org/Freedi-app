import { isDerived } from '../derivedDocs';
import type { Statement } from '@freedi/shared-types';

// Minimal Statement-shaped builder for classifier tests.
const make = (overrides: Record<string, unknown>): Statement =>
	({
		statementId: 'x',
		statement: 't',
		statementType: 'option',
		parentId: 'q',
		...overrides,
	}) as unknown as Statement;

describe('isDerived', () => {
	it('treats a genuine user option as NOT derived', () => {
		expect(isDerived(make({}))).toBe(false);
		expect(isDerived(make({ integratedOptions: [] }))).toBe(false);
		expect(isDerived(make({ hide: true }))).toBe(false); // hidden but not derived
	});

	it('flags docs with non-empty integratedOptions (incl. legacy untagged)', () => {
		expect(isDerived(make({ integratedOptions: ['a', 'b'] }))).toBe(true);
		// legacy untagged: integratedOptions set but no derivedByPipeline
		expect(isDerived(make({ integratedOptions: ['a'], derivedByPipeline: undefined }))).toBe(true);
	});

	it('flags isCluster, derivedByPipeline, and liveSynthOrigin docs', () => {
		expect(isDerived(make({ isCluster: true }))).toBe(true);
		expect(isDerived(make({ derivedByPipeline: 'synthesis' }))).toBe(true);
		expect(isDerived(make({ derivedByPipeline: 'topic-cluster', integratedOptions: [] }))).toBe(
			true,
		); // 0-member topic header
		expect(isDerived(make({ liveSynthOrigin: 'spawn' }))).toBe(true);
	});
});
