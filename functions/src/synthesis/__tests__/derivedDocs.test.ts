import { isDerived, isManualCluster } from '../derivedDocs';
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

describe('isManualCluster', () => {
	it('flags an admin cluster with a locked title', () => {
		expect(
			isManualCluster(make({ isCluster: true, titleLockedByCreator: true })),
		).toBe(true);
		// members present or not, a title-locked cluster is still manual
		expect(
			isManualCluster(
				make({ isCluster: true, titleLockedByCreator: true, integratedOptions: ['a', 'b'] }),
			),
		).toBe(true);
		expect(
			isManualCluster(
				make({ isCluster: true, titleLockedByCreator: true, integratedOptions: [] }),
			),
		).toBe(true);
	});

	it('does NOT flag auto-formed synth clusters (no title lock)', () => {
		expect(isManualCluster(make({ isCluster: true }))).toBe(false);
		expect(
			isManualCluster(make({ isCluster: true, derivedByPipeline: 'synthesis' })),
		).toBe(false);
		expect(
			isManualCluster(make({ isCluster: true, integratedOptions: ['a', 'b'] })),
		).toBe(false);
	});

	it('does NOT flag a non-cluster option even if title is locked', () => {
		expect(isManualCluster(make({ titleLockedByCreator: true }))).toBe(false);
		expect(isManualCluster(make({}))).toBe(false);
	});
});
