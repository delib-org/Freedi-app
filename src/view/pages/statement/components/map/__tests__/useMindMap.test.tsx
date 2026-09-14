import React from 'react';
import { act, renderHook } from '@testing-library/react';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router';
import { Statement, StatementType } from '@freedi/shared-types';

import { useMindMap } from '../MindMapMV';
import { setStatement, setStatements, statementsSlice } from '@/redux/statements/statementsSlice';

function makeStatement(overrides: Partial<Statement> & { statementId: string }): Statement {
	return {
		statement: overrides.statementId,
		statementType: StatementType.option,
		parentId: 'q1',
		parents: ['q1'],
		topParentId: 'q1',
		creatorId: 'u1',
		createdAt: 1,
		lastUpdate: 1,
		consensus: 0,
		...overrides,
	} as Statement;
}

const question = makeStatement({
	statementId: 'q1',
	statement: 'Question',
	statementType: StatementType.question,
	parentId: 'top',
	parents: [],
});

function setup(extra: Statement[] = []) {
	const store = configureStore({ reducer: { statements: statementsSlice.reducer } });
	store.dispatch(
		setStatements([
			question,
			makeStatement({ statementId: 'a' }),
			makeStatement({ statementId: 'b' }),
			...extra,
		]),
	);
	const wrapper = ({ children }: { children: React.ReactNode }) => (
		<Provider store={store}>
			<MemoryRouter>{children}</MemoryRouter>
		</Provider>
	);
	const hook = renderHook(() => useMindMap('q1'), { wrapper });

	return { store, ...hook };
}

describe('useMindMap', () => {
	it('builds the results tree from the store', () => {
		const { result } = setup();

		expect(result.current.results?.top.statementId).toBe('q1');
		expect(result.current.results?.sub.map((node) => node.top.statementId).sort()).toEqual([
			'a',
			'b',
		]);
		expect(result.current.flat).toBe(true);
	});

	it('keeps the same results object when a statement outside the tree changes', () => {
		const { result, store } = setup();
		const before = result.current.results;

		act(() => {
			store.dispatch(
				setStatement(
					makeStatement({
						statementId: 'other',
						parentId: 'q2',
						parents: ['q2'],
						topParentId: 'q2',
					}),
				),
			);
		});

		expect(result.current.results).toBe(before);
	});

	it('keeps the same results object when only the subject bookkeeping changes', () => {
		const { result, store } = setup();
		const before = result.current.results;

		act(() => {
			store.dispatch(setStatement({ ...question, lastChildUpdate: 999, lastUpdate: 999 }));
		});

		expect(result.current.results).toBe(before);
	});

	it('rebuilds when the subject title changes', () => {
		const { result, store } = setup();

		act(() => {
			store.dispatch(setStatement({ ...question, statement: 'Renamed question' }));
		});

		expect(result.current.results?.top.statement).toBe('Renamed question');
	});

	it('rebuilds when a descendant changes', () => {
		const { result, store } = setup();
		const before = result.current.results;

		act(() => {
			store.dispatch(setStatement(makeStatement({ statementId: 'a', statement: 'Edited' })));
		});

		expect(result.current.results).not.toBe(before);
		expect(
			result.current.results?.sub.find((node) => node.top.statementId === 'a')?.top.statement,
		).toBe('Edited');
	});

	it('nests cluster members and reports a non-flat map', () => {
		const { result } = setup([
			makeStatement({ statementId: 'c', isCluster: true, integratedOptions: ['a', 'b'] }),
		]);

		expect(result.current.flat).toBe(false);
		const cluster = result.current.results?.sub.find((node) => node.top.statementId === 'c');
		expect(cluster?.sub.map((node) => node.top.statementId).sort()).toEqual(['a', 'b']);
	});
});
