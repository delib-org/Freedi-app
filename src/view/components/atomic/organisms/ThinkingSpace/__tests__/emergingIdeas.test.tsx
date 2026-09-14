import React from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import { getEmergingIdeas } from '../emergingIdeas';
import DecisionBoard from '../DecisionBoard';

const proposal = (overrides: Partial<Statement>): Statement =>
	({
		statementId: 'p',
		statement: 'Try a community garden',
		createdAt: 1,
		...overrides,
	}) as Statement;

describe('Thinking space evidence and visibility', () => {
	it('preserves independent ideas and excludes hidden originals and thematic headings', () => {
		const result = getEmergingIdeas([
			proposal({ statementId: 'theme', isCluster: true, derivedByPipeline: 'topic-cluster' }),
			proposal({ statementId: 'hidden', hide: true }),
			proposal({ statementId: 'standalone', createdAt: 3 }),
			proposal({
				statementId: 'synthesis',
				isCluster: true,
				derivedByPipeline: 'synthesis',
				integratedOptions: ['a', 'b'],
				createdAt: 2,
			}),
		]);
		expect(result.map((idea) => idea.id)).toEqual(['standalone', 'synthesis']);
		expect(result[1].synthesisSources).toBe(2);
		expect(result[0].mean).toBeUndefined();
	});
	it('uses signed sentiment without turning the ranking score into a support percentage', () => {
		const result = getEmergingIdeas([
			proposal({
				consensus: 0.8,
				evaluation: { numberOfEvaluators: 4, sumPro: 1, sumCon: 3 } as Statement['evaluation'],
			}),
		]);
		expect(result[0].mean).toBe(-0.5);
	});
	it('does not leak results when the facilitator has hidden them', () => {
		render(
			<DecisionBoard
				t={(text) => text}
				ideas={[{ id: 'a', title: 'An idea', evaluators: 18, mean: 0.72 }]}
				onOpen={jest.fn()}
				onExplore={jest.fn()}
				showResults={false}
			/>,
		);
		expect(screen.queryByText(/people evaluated/)).not.toBeInTheDocument();
		expect(screen.queryByText(/72%/)).not.toBeInTheDocument();
		expect(screen.getByText('An idea')).toBeInTheDocument();
	});
	it('distinguishes an unevaluated idea and a small early sample', () => {
		render(
			<DecisionBoard
				t={(text) => text}
				ideas={[
					{ id: 'a', title: 'New idea', evaluators: 0 },
					{ id: 'b', title: 'Early idea', evaluators: 2, mean: 1 },
				]}
				onOpen={jest.fn()}
				onExplore={jest.fn()}
				showResults
			/>,
		);
		expect(screen.getByText('Be among the first to weigh in')).toBeInTheDocument();
		expect(screen.getByText('Early impressions')).toBeInTheDocument();
		expect(screen.queryByText(/consensus/i)).not.toBeInTheDocument();
	});
});
