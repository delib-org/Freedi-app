import { Statement, StatementType } from '@freedi/shared-types';
import { getAtomStatements } from '../atomStatements';

const make = (statementId: string, extra: Partial<Statement> = {}): Statement =>
	({ statementId, statementType: StatementType.option, ...extra }) as Statement;

const ids = (list: Statement[]): string[] => list.map((s) => s.statementId);

describe('getAtomStatements', () => {
	it('keeps plain originals', () => {
		expect(ids(getAtomStatements([make('a'), make('b')]))).toEqual(['a', 'b']);
	});

	it('keeps synths and drops the originals they absorbed', () => {
		const synth = make('s', {
			isCluster: true,
			derivedByPipeline: 'synthesis',
			integratedOptions: ['a'],
		});

		expect(ids(getAtomStatements([make('a'), make('b'), synth]))).toEqual(['b', 's']);
	});

	it('drops originals marked integratedInto', () => {
		expect(ids(getAtomStatements([make('a', { integratedInto: 's' }), make('b')]))).toEqual(['b']);
	});

	it('drops topic-cluster containers', () => {
		const topic = make('t', {
			isCluster: true,
			derivedByPipeline: 'topic-cluster',
			integratedOptions: ['s'],
		});
		const synth = make('s', { isCluster: true, derivedByPipeline: 'synthesis' });

		expect(ids(getAtomStatements([topic, synth]))).toEqual(['s']);
	});

	it('returns an empty list for no input', () => {
		expect(getAtomStatements([])).toEqual([]);
	});
});
