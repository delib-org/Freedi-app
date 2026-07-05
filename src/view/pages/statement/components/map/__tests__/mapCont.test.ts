/**
 * Tests for resultsByParentId — specifically the cluster/synth nesting.
 *
 * Clusters (synths and topic clusters) and their members are stored FLAT
 * (all share parentId = question); membership lives in the cluster's
 * `integratedOptions[]`. The map must lift members out of their flat position
 * and nest them under the cluster, recursively, so the tree reads
 * question → cluster → synth → statement.
 */

// Avoid pulling Firebase/valibot into jsdom via the module's value imports.
jest.mock('@/controllers/db/results/getResults', () => ({ getResultsDB: jest.fn() }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@freedi/shared-types', () => ({}));

import { resultsByParentId } from '../mapCont';
import type { Results, Statement } from '@freedi/shared-types';

interface MockStatement {
	statementId: string;
	parentId: string;
	statement: string;
	isCluster?: boolean;
	derivedByPipeline?: 'synthesis' | 'topic-cluster';
	integratedOptions?: string[];
}

const QUESTION_ID = 'q1';

function make(over: Partial<MockStatement> & { statementId: string }): Statement {
	return {
		parentId: QUESTION_ID,
		statement: over.statementId,
		...over,
	} as unknown as Statement;
}

const question = make({ statementId: QUESTION_ID, parentId: 'root' });

/** Collect child ids of a node by statementId, for terse assertions. */
function childIds(node: Results): string[] {
	return node.sub.map((s) => s.top.statementId);
}

function findNode(node: Results, id: string): Results | null {
	if (node.top.statementId === id) return node;
	for (const sub of node.sub) {
		const found = findNode(sub, id);
		if (found) return found;
	}

	return null;
}

describe('resultsByParentId — cluster nesting', () => {
	it('leaves a plain flat tree untouched', () => {
		const descendants = [make({ statementId: 'o1' }), make({ statementId: 'o2' })];
		const tree = resultsByParentId(question, descendants);

		expect(childIds(tree).sort()).toEqual(['o1', 'o2']);
	});

	it("nests a synth's members under the synth and removes them as flat siblings", () => {
		const descendants = [
			make({
				statementId: 'synth1',
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['o1', 'o2'],
			}),
			make({ statementId: 'o1' }),
			make({ statementId: 'o2' }),
			make({ statementId: 'o3' }), // unclustered raw option stays flat
		];
		const tree = resultsByParentId(question, descendants);

		// Synth and the raw option are direct children; o1/o2 are NOT flat.
		expect(childIds(tree).sort()).toEqual(['o3', 'synth1']);

		const synth = findNode(tree, 'synth1');
		expect(synth).not.toBeNull();
		expect(childIds(synth as Results).sort()).toEqual(['o1', 'o2']);
	});

	it('nests cluster → synth → statement recursively', () => {
		const descendants = [
			make({
				statementId: 'topic1',
				isCluster: true,
				derivedByPipeline: 'topic-cluster',
				integratedOptions: ['synth1', 'o3'],
			}),
			make({
				statementId: 'synth1',
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['o1', 'o2'],
			}),
			make({ statementId: 'o1' }),
			make({ statementId: 'o2' }),
			make({ statementId: 'o3' }),
		];
		const tree = resultsByParentId(question, descendants);

		// Only the topic cluster sits directly under the question.
		expect(childIds(tree)).toEqual(['topic1']);

		const topic = findNode(tree, 'topic1');
		expect(childIds(topic as Results).sort()).toEqual(['o3', 'synth1']);

		const synth = findNode(tree, 'synth1');
		expect(childIds(synth as Results).sort()).toEqual(['o1', 'o2']);
	});

	it('ignores integratedOptions members that are not loaded', () => {
		const descendants = [
			make({
				statementId: 'synth1',
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['o1', 'missing'],
			}),
			make({ statementId: 'o1' }),
		];
		const tree = resultsByParentId(question, descendants);

		const synth = findNode(tree, 'synth1');
		expect(childIds(synth as Results)).toEqual(['o1']);
	});

	// T0.3: when the cluster doc itself is missing from the loaded set (e.g. it
	// was evicted by the mind-map load limit), its members have nothing to nest
	// under and correctly fall back to flat "Ungrouped" siblings. This is why
	// listenToMindMapData loads cluster docs unconditionally — so this fallback
	// stops happening for real clusters.
	it('leaves members flat when their cluster doc is not loaded', () => {
		const descendants = [make({ statementId: 'o1' }), make({ statementId: 'o2' })];
		// The cluster (c1) that lists o1/o2 in integratedOptions is NOT in the set.
		const tree = resultsByParentId(question, descendants);

		expect(childIds(tree).sort()).toEqual(['o1', 'o2']);
	});

	it('does not duplicate a member referenced by two clusters', () => {
		const descendants = [
			make({ statementId: 'cA', isCluster: true, integratedOptions: ['o1'] }),
			make({ statementId: 'cB', isCluster: true, integratedOptions: ['o1'] }),
			make({ statementId: 'o1' }),
		];
		const tree = resultsByParentId(question, descendants);

		const all: string[] = [];
		const walk = (n: Results) => {
			all.push(n.top.statementId);
			n.sub.forEach(walk);
		};
		walk(tree);

		expect(all.filter((id) => id === 'o1')).toHaveLength(1);
	});
});
