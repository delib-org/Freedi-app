import { extractExportableData, toExportRows } from '../utils/exportFormat';
import { StatementType } from '../models/TypeEnums';
import type { Statement } from '../models/statement/StatementTypes';

function makeStatement(overrides: Partial<Statement> & { statementId: string }): Statement {
	return {
		statement: `text ${overrides.statementId}`,
		parentId: 'q',
		topParentId: 'q',
		statementType: StatementType.option,
		createdAt: 1,
		lastUpdate: 2,
		consensus: 0,
		creatorId: 'secret-user',
		creator: { uid: 'secret-user', displayName: 'Secret Name' },
		joined: [{ uid: 'secret-user', displayName: 'Secret Name' }],
		...overrides,
	} as unknown as Statement;
}

const main = makeStatement({
	statementId: 'q',
	parentId: 'top',
	statementType: StatementType.question,
});

describe('extractExportableData', () => {
	it('emits cluster and pipeline fields for a derived row', () => {
		const row = extractExportableData(
			makeStatement({
				statementId: 't',
				isCluster: true,
				derivedByPipeline: 'topic-cluster',
				integratedOptions: ['a', 'b'],
			}),
		);

		expect(row.isDerived).toBe(true);
		expect(row.isCluster).toBe(true);
		expect(row.derivedByPipeline).toBe('topic-cluster');
		expect(row.integratedOptions).toEqual(['a', 'b']);
	});

	it('leaves pipeline fields undefined for a plain row', () => {
		const row = extractExportableData(makeStatement({ statementId: 'a' }));

		expect(row.isDerived).toBe(false);
		expect(row.isCluster).toBeUndefined();
		expect(row.derivedByPipeline).toBeUndefined();
		expect(row.integratedOptions).toBeUndefined();
	});

	it('never carries creator, creatorId or joined', () => {
		const row = extractExportableData(makeStatement({ statementId: 'a' }));
		const json = JSON.stringify(row);

		expect(row).not.toHaveProperty('creator');
		expect(row).not.toHaveProperty('creatorId');
		expect(row).not.toHaveProperty('joined');
		expect(json).not.toContain('Secret Name');
		expect(json).not.toContain('secret-user');
	});
});

describe('toExportRows', () => {
	const theme = makeStatement({
		statementId: 't',
		isCluster: true,
		derivedByPipeline: 'topic-cluster',
		integratedOptions: ['a'],
	});

	it('gives theme members the theme id and unthemed ideas other-ideas', () => {
		const rows = toExportRows(main, [
			theme,
			makeStatement({ statementId: 'a' }),
			makeStatement({ statementId: 'b' }),
		]);
		const byId = Object.fromEntries(rows.subStatements.map((r) => [r.statementId, r.themeId]));

		expect(byId.a).toBe('t');
		expect(byId.b).toBe('other-ideas');
	});

	it('leaves themeId empty on every row when there are no themes', () => {
		const rows = toExportRows(main, [
			makeStatement({ statementId: 'a' }),
			makeStatement({ statementId: 'b' }),
		]);

		expect(rows.mainStatement.themeId).toBe('');
		expect(rows.subStatements.map((r) => r.themeId)).toEqual(['', '']);
	});
});
