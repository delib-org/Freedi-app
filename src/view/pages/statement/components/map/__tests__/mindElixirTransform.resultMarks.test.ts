import { Statement, StatementType } from '@freedi/shared-types';
import { toMindElixirData, type FreediNodeObj } from '../mapHelpers/mindElixirTransform';

const option = (statementId: string, extra: Partial<Statement>): Statement =>
	({
		statementId,
		statement: statementId,
		statementType: StatementType.option,
		parentId: 'q1',
		...extra,
	}) as Statement;

const results = {
	top: { statementId: 'q1', statement: 'Q', statementType: StatementType.question } as Statement,
	sub: [
		{ top: option('chosen', { isChosen: true }), sub: [] },
		{ top: option('voted', { isVoted: true }), sub: [] },
		{ top: option('plain', {}), sub: [] },
	],
};

function selectedIds(showResultMarks: boolean | undefined): string[] {
	const { nodeData } = toMindElixirData(results, [], undefined, { showResultMarks });

	return ((nodeData.children ?? []) as FreediNodeObj[])
		.filter((node) => node.isSelected)
		.map((node) => node.id);
}

describe('toMindElixirData result marks', () => {
	it('highlights chosen and voted answers for a viewer the guard allows', () => {
		expect(selectedIds(true)).toEqual(['chosen', 'voted']);
	});

	it('highlights no leader for a locked viewer', () => {
		expect(selectedIds(false)).toEqual([]);
	});

	it('is off unless asked for', () => {
		expect(selectedIds(undefined)).toEqual([]);
	});
});
