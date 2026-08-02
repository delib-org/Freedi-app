/**
 * Tests for the ResultsStrip molecule — the three result numbers shown on a
 * suggestion card (consensus, average, evaluators).
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import ResultsStrip from '../ResultsStrip';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({
		t: (text: string) => text,
		currentLanguage: 'en',
	}),
}));

interface EvaluationOverrides {
	numberOfEvaluators?: number;
	sumPro?: number;
	sumCon?: number;
	sumEvaluations?: number;
}

function makeStatement(consensus: number, evaluation: EvaluationOverrides | undefined): Statement {
	return {
		statementId: 'st-1',
		statement: 'A suggestion',
		consensus,
		evaluation,
	} as unknown as Statement;
}

describe('ResultsStrip', () => {
	it('renders nothing when nobody has evaluated yet', () => {
		const { container } = render(
			<ResultsStrip statement={makeStatement(0, { numberOfEvaluators: 0 })} />,
		);

		expect(container.firstChild).toBeNull();
	});

	it('renders nothing when the statement has no evaluation object', () => {
		const { container } = render(<ResultsStrip statement={makeStatement(0, undefined)} />);

		expect(container.firstChild).toBeNull();
	});

	it('renders consensus, average and evaluator count', () => {
		render(
			<ResultsStrip
				statement={makeStatement(0.42, {
					numberOfEvaluators: 10,
					sumEvaluations: 6,
					sumPro: 8,
					sumCon: 2,
				})}
			/>,
		);

		expect(screen.getByText('42%')).toBeInTheDocument(); // consensus
		expect(screen.getByText('60%')).toBeInTheDocument(); // average: 6 / 10
		expect(screen.getByText('10')).toBeInTheDocument(); // evaluators
	});

	it('falls back to sumPro - sumCon when sumEvaluations is missing (legacy docs)', () => {
		render(
			<ResultsStrip
				statement={makeStatement(0.1, { numberOfEvaluators: 4, sumPro: 3, sumCon: 1 })}
			/>,
		);

		expect(screen.getByText('50%')).toBeInTheDocument(); // (3 - 1) / 4
	});

	it('hides consensus until the minimum number of evaluators is reached', () => {
		render(
			<ResultsStrip statement={makeStatement(0.9, { numberOfEvaluators: 2, sumEvaluations: 2 })} />,
		);

		expect(screen.queryByText('90%')).not.toBeInTheDocument();
		expect(screen.getByText('100%')).toBeInTheDocument(); // average still shows
		expect(screen.getByText('2')).toBeInTheDocument();
	});

	it('marks negative consensus so it does not read as an achievement', () => {
		const { container } = render(
			<ResultsStrip
				statement={makeStatement(-0.35, { numberOfEvaluators: 5, sumEvaluations: -2 })}
			/>,
		);

		expect(screen.getByText('-35%')).toBeInTheDocument();
		expect(container.querySelectorAll('.results-strip__item--negative')).toHaveLength(2);
	});

	it('highlights the requested primary metric', () => {
		const { container } = render(
			<ResultsStrip
				statement={makeStatement(0.5, { numberOfEvaluators: 5, sumEvaluations: 3 })}
				primary="average"
			/>,
		);

		const primary = container.querySelector('.results-strip__item--primary');
		expect(primary).toHaveTextContent('60%');
		expect(primary).toHaveTextContent('Average');
	});
});
