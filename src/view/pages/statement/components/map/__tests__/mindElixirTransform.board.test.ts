/**
 * Tests for toMindElixirData board mode — the sticky-note cluster-board styling
 * used by the shareable /map board. Board mode must:
 *  - render the root as the dark "Subject" hub,
 *  - give each first-level branch its own palette color (connector + pill),
 *  - have deeper nodes inherit their branch color as a tinted card,
 *  - and leave the default (in-app) styling untouched when off.
 */

jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('@freedi/shared-types', () => ({ StatementType: {} }));

import { toMindElixirData, type FreediNodeObj } from '../mapHelpers/mindElixirTransform';
import type { Results, Statement } from '@freedi/shared-types';

function make(statementId: string): Statement {
	return { statementId, statement: statementId, parentId: 'root' } as unknown as Statement;
}

function node(statementId: string, sub: Results[] = []): Results {
	return { top: make(statementId), sub } as unknown as Results;
}

// root → [b1, b2]; b1 → [c1]
const tree: Results = node('root', [node('b1', [node('c1')]), node('b2')]);

const childById = (n: FreediNodeObj, id: string): FreediNodeObj =>
	(n.children ?? []).find((c) => c.id === id) as FreediNodeObj;

describe('toMindElixirData board mode', () => {
	it('renders the root as the dark Subject hub', () => {
		const { nodeData } = toMindElixirData(tree, [], undefined, { boardMode: true });
		expect(nodeData.style?.background).toBe('#2b2b33');
		expect(nodeData.style?.color).toBe('#ffffff');
	});

	it('gives first-level branches distinct palette colors', () => {
		const { nodeData } = toMindElixirData(tree, [], undefined, { boardMode: true });
		const b1 = childById(nodeData as FreediNodeObj, 'b1');
		const b2 = childById(nodeData as FreediNodeObj, 'b2');

		// Each branch gets a solid colored pill + matching connector color.
		expect(b1.branchColor).toBeDefined();
		expect(b2.branchColor).toBeDefined();
		expect(b1.branchColor).not.toBe(b2.branchColor);
		expect(b1.style?.background).toBe(b1.branchColor);
		expect(b1.style?.color).toBe('#ffffff');
	});

	it('has deeper nodes inherit their branch color as a tinted card', () => {
		const { nodeData } = toMindElixirData(tree, [], undefined, { boardMode: true });
		const b1 = childById(nodeData as FreediNodeObj, 'b1');
		const c1 = childById(b1, 'c1');

		// c1 shares b1's connector color but is a light card, not the solid pill.
		expect(c1.branchColor).toBe(b1.branchColor);
		expect(c1.style?.background).not.toBe(b1.style?.background);
	});

	it('leaves styling untouched when board mode is off', () => {
		const { nodeData } = toMindElixirData(tree);
		expect(nodeData.style?.background).not.toBe('#2b2b33');
		const b1 = childById(nodeData as FreediNodeObj, 'b1');
		expect(b1.branchColor).toBeUndefined();
	});
});
