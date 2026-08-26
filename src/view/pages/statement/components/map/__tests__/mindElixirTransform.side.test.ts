/**
 * First-level branches must carry an explicit MindElixir `direction`. The map
 * runs in SIDE layout so a branch CAN be placed left of the root, but SIDE
 * auto-balances any child that has no direction of its own — which would fling
 * half of every existing map to the left the moment the layout changed. Pinning
 * unplaced branches to the right keeps those maps looking exactly as they did.
 */

jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@freedi/shared-types', () => ({ StatementType: {} }));

import { toMindElixirData, type FreediNodeObj } from '../mapHelpers/mindElixirTransform';
import type { Results, Statement } from '@freedi/shared-types';

function make(statementId: string, mapSide?: 'left' | 'right'): Statement {
	return { statementId, statement: statementId, parentId: 'root', mapSide } as unknown as Statement;
}

function node(statementId: string, sub: Results[] = [], mapSide?: 'left' | 'right'): Results {
	return { top: make(statementId, mapSide), sub } as unknown as Results;
}

const childById = (parent: FreediNodeObj, id: string): FreediNodeObj =>
	(parent.children ?? []).find((child) => child.id === id) as FreediNodeObj;

// root → [left branch, unplaced branch → [grandchild]]
const tree: Results = node('root', [node('b1', [], 'left'), node('b2', [node('c1')], undefined)]);

describe('toMindElixirData branch sides', () => {
	const { nodeData } = toMindElixirData(tree);
	const root = nodeData as FreediNodeObj;

	it('places a branch marked left on the LHS', () => {
		expect(childById(root, 'b1').direction).toBe(0);
	});

	it('pins an unplaced branch to the RHS instead of leaving it to auto-balance', () => {
		expect(childById(root, 'b2').direction).toBe(1);
	});

	it('leaves the root itself without a direction', () => {
		expect(root.direction).toBeUndefined();
	});

	it('does not set a direction below the first level — only branches take sides', () => {
		expect(childById(childById(root, 'b2'), 'c1').direction).toBeUndefined();
	});
});
