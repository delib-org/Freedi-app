/**
 * Tests for derivedStatement
 *
 * Cluster/synthesis spawns are stored with `statementType: option`, so exports
 * rely on these helpers to tell AI-generated statements apart from genuine
 * participant submissions.
 */

import { Statement, StatementType } from '@freedi/shared-types';
import { isDerivedStatement, resolveDerivedPipeline } from '../derivedStatement';

function makeStatement(overrides: Partial<Statement> & Record<string, unknown> = {}): Statement {
	return {
		statementId: 'opt-1',
		statement: 'An option',
		parentId: 'parent-1',
		topParentId: 'top-1',
		statementType: StatementType.option,
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

describe('derivedStatement', () => {
	describe('isDerivedStatement', () => {
		it('returns false for a genuine participant submission', () => {
			expect(isDerivedStatement(makeStatement())).toBe(false);
		});

		it('detects a cluster via isCluster', () => {
			expect(isDerivedStatement(makeStatement({ isCluster: true }))).toBe(true);
		});

		it('detects a derived option via derivedByPipeline', () => {
			expect(isDerivedStatement(makeStatement({ derivedByPipeline: 'synthesis' }))).toBe(true);
		});

		it('detects a derived option via non-empty integratedOptions', () => {
			expect(isDerivedStatement(makeStatement({ integratedOptions: ['a', 'b'] }))).toBe(true);
		});

		it('ignores an empty integratedOptions array', () => {
			expect(isDerivedStatement(makeStatement({ integratedOptions: [] }))).toBe(false);
		});

		it('detects a derived option via synthesisRunId', () => {
			expect(isDerivedStatement(makeStatement({ synthesisRunId: 'run-1' }))).toBe(true);
		});

		it('detects a derived option via synthesisMechanism', () => {
			expect(isDerivedStatement(makeStatement({ synthesisMechanism: 'bulk' }))).toBe(true);
		});

		it('detects a statement stored with the synthesis statementType', () => {
			expect(isDerivedStatement(makeStatement({ statementType: StatementType.synthesis }))).toBe(
				true,
			);
		});

		it('detects a live-spawn doc via the off-schema liveSynthOrigin marker', () => {
			const statement = makeStatement({ liveSynthOrigin: 'spawn' });

			expect(isDerivedStatement(statement)).toBe(true);
		});
	});

	describe('resolveDerivedPipeline', () => {
		it('prefers the explicit derivedByPipeline field', () => {
			expect(resolveDerivedPipeline(makeStatement({ derivedByPipeline: 'topic-cluster' }))).toBe(
				'topic-cluster',
			);
			expect(resolveDerivedPipeline(makeStatement({ derivedByPipeline: 'synthesis' }))).toBe(
				'synthesis',
			);
		});

		it('infers synthesis from the synthesis statementType', () => {
			expect(
				resolveDerivedPipeline(makeStatement({ statementType: StatementType.synthesis })),
			).toBe('synthesis');
		});

		it('reports unknown-cluster for legacy docs carrying only isCluster', () => {
			expect(resolveDerivedPipeline(makeStatement({ isCluster: true }))).toBe('unknown-cluster');
		});

		it('falls back to the legacy isSynthesis boolean when derivedByPipeline is absent', () => {
			const synth = makeStatement({ isCluster: true, isSynthesis: true });
			const topic = makeStatement({ isCluster: true, isSynthesis: false });

			expect(resolveDerivedPipeline(synth)).toBe('synthesis');
			expect(resolveDerivedPipeline(topic)).toBe('topic-cluster');
		});

		it('does not let statementType override an explicit pipeline', () => {
			const statement = makeStatement({
				statementType: StatementType.synthesis,
				derivedByPipeline: 'topic-cluster',
			});

			expect(resolveDerivedPipeline(statement)).toBe('topic-cluster');
		});
	});
});
