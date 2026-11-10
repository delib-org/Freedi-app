import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Statement } from '@freedi/shared-types';
import GroupedSuggestionCard from '../GroupedSuggestionCard';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, dir: 'ltr' }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({
	useAppSelector: () => [],
}));
jest.mock('@/controllers/hooks/useGroupMembers', () => ({
	useGroupMembers: () => ({ members: [], isLoading: false }),
}));
jest.mock('@/controllers/hooks/useAuthorization', () => ({
	useAuthorization: () => ({ isAdmin: false }),
}));
jest.mock('@/controllers/db/integration/integrationController', () => ({
	reverseIntegration: jest.fn(),
	regenerateSynthesisProposal: jest.fn(),
}));
jest.mock('../ScoreBreakdown', () => ({
	__esModule: true,
	default: () => <div data-testid="score-breakdown" />,
}));

const SYNTHESIS = {
	statementId: 'synth1',
	parentId: 'q1',
	statement: 'A merged proposal',
	derivedByPipeline: 'synthesis',
	integratedOptions: ['a', 'b'],
	evaluation: { numberOfEvaluators: 13, averageEvaluation: 0.38 },
} as unknown as Statement;

function renderSynthesis(): void {
	render(
		<MemoryRouter>
			<GroupedSuggestionCard
				cluster={SYNTHESIS}
				mode="both"
				allowDrillToOriginals
				pipeline="synthesis"
				evaluationSlot={<div data-testid="evaluation-control" />}
			/>
		</MemoryRouter>,
	);
}

describe('GroupedSuggestionCard (synthesis)', () => {
	it('renders the evaluation control passed in the slot', () => {
		renderSynthesis();

		expect(screen.getByTestId('evaluation-control')).toBeTruthy();
	});

	it('keeps the synthesis-only details collapsed by default', () => {
		renderSynthesis();

		const toggle = screen.getByRole('button', { name: 'Details' });
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(screen.queryByTestId('score-breakdown')).toBeNull();
		expect(screen.queryByText('People who rated', { exact: false })).toBeNull();
	});

	it('reveals the details when the toggle is pressed', () => {
		renderSynthesis();

		fireEvent.click(screen.getByRole('button', { name: 'Details' }));

		expect(screen.getByTestId('score-breakdown')).toBeTruthy();
		expect(screen.getByText('People who rated', { exact: false })).toBeTruthy();
	});

	it('shows the same three numbers as the results strip, with no second agreement or confidence', () => {
		render(
			<MemoryRouter>
				<GroupedSuggestionCard
					cluster={
						{
							...SYNTHESIS,
							consensus: 0.21,
							evaluation: {
								numberOfEvaluators: 13,
								averageEvaluation: -0.38,
								agreement: 0.5,
								confidenceIndex: 0.9,
							},
						} as unknown as Statement
					}
					mode="both"
					allowDrillToOriginals
					pipeline="synthesis"
				/>
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Details' }));

		expect(screen.getByText('+21')).toBeTruthy();
		expect(screen.getByText('−38')).toBeTruthy();
		expect(screen.queryByText('Confidence', { exact: false })).toBeNull();
		expect(screen.queryByText('+50')).toBeNull();
		expect(screen.queryByText('%', { exact: false })).toBeNull();
	});

	it('holds back the agreement score under the minimum number of raters', () => {
		render(
			<MemoryRouter>
				<GroupedSuggestionCard
					cluster={
						{
							...SYNTHESIS,
							consensus: 0.21,
							evaluation: { numberOfEvaluators: 2, averageEvaluation: 0.38 },
						} as unknown as Statement
					}
					mode="both"
					allowDrillToOriginals
					pipeline="synthesis"
				/>
			</MemoryRouter>,
		);

		fireEvent.click(screen.getByRole('button', { name: 'Details' }));

		expect(screen.queryByText('Agreement score', { exact: false })).toBeNull();
		expect(screen.getByText('+38')).toBeTruthy();
	});
});

describe('GroupedSuggestionCard (theme)', () => {
	it('renders no evaluation control for a theme', () => {
		const theme = {
			...SYNTHESIS,
			statementId: 'theme1',
			isCluster: true,
			derivedByPipeline: 'topic-cluster',
		} as unknown as Statement;
		render(
			<MemoryRouter>
				<GroupedSuggestionCard
					cluster={theme}
					mode="both"
					allowDrillToOriginals
					pipeline="topic"
					evaluationSlot={<div data-testid="evaluation-control" />}
				/>
			</MemoryRouter>,
		);

		expect(screen.queryByTestId('evaluation-control')).toBeNull();
	});

	it('keeps the evaluation control for a merged answer (cluster without a pipeline)', () => {
		const merged = {
			...SYNTHESIS,
			statementId: 'merged1',
			isCluster: true,
			derivedByPipeline: undefined,
		} as unknown as Statement;
		render(
			<MemoryRouter>
				<GroupedSuggestionCard
					cluster={merged}
					mode="both"
					allowDrillToOriginals
					evaluationSlot={<div data-testid="evaluation-control" />}
				/>
			</MemoryRouter>,
		);

		expect(screen.getByTestId('evaluation-control')).toBeTruthy();
	});
});
