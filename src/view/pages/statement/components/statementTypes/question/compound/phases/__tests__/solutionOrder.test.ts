import { Statement } from '@freedi/shared-types';
import { orderSolutionsForViewer } from '../solutionOrder';

function solution(statementId: string, createdAt: number, consensus: number): Statement {
	return { statementId, createdAt, consensus } as Statement;
}

const solutions = [
	solution('new-weak', 3, 0.1),
	solution('old-mid', 1, 0.4),
	solution('top', 2, 0.9),
];
const ids = (list: Statement[]) => list.map((item) => item.statementId);

describe('orderSolutionsForViewer', () => {
	it('ranks by score for a viewer who may see scores', () => {
		expect(ids(orderSolutionsForViewer(solutions, true))).toEqual(['top', 'old-mid', 'new-weak']);
	});

	it('uses creation order for a locked viewer, so position reveals nothing', () => {
		expect(ids(orderSolutionsForViewer(solutions, false))).toEqual(['old-mid', 'top', 'new-weak']);
	});

	it('leaves the input untouched', () => {
		orderSolutionsForViewer(solutions, true);

		expect(ids(solutions)).toEqual(['new-weak', 'old-mid', 'top']);
	});
});
