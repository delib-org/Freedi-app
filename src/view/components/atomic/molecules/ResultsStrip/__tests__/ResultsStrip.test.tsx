/**
 * Tests for the ResultsStrip molecule — the three result numbers shown on an
 * answer card (agreement score, average rating, people who rated).
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
	stakeholderCount?: number;
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

	it('renders the agreement score, average rating and people who rated', () => {
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

		expect(screen.getByText('+42')).toBeInTheDocument(); // consensus
		expect(screen.getByText('+60')).toBeInTheDocument(); // average: 6 / 10
		expect(screen.getByText('10')).toBeInTheDocument(); // evaluators
		expect(screen.getByText('Agreement score')).toBeInTheDocument();
		expect(screen.getByText('Average rating')).toBeInTheDocument();
		expect(screen.getByText('People who rated')).toBeInTheDocument();
	});

	it('never puts a percent sign on a score', () => {
		const { container } = render(
			<ResultsStrip
				statement={makeStatement(0.42, { numberOfEvaluators: 10, sumEvaluations: 6 })}
			/>,
		);

		expect(container.textContent).not.toContain('%');
	});

	it('falls back to sumPro - sumCon when sumEvaluations is missing (legacy docs)', () => {
		render(
			<ResultsStrip
				statement={makeStatement(0.1, { numberOfEvaluators: 4, sumPro: 3, sumCon: 1 })}
			/>,
		);

		expect(screen.getByText('+50')).toBeInTheDocument(); // (3 - 1) / 4
	});

	it('hides the agreement score until the minimum number of raters is reached', () => {
		render(
			<ResultsStrip statement={makeStatement(0.9, { numberOfEvaluators: 2, sumEvaluations: 2 })} />,
		);

		expect(screen.queryByText('+90')).not.toBeInTheDocument();
		expect(screen.getByText('+100')).toBeInTheDocument(); // average still shows
		expect(screen.getByText('2')).toBeInTheDocument();
	});

	it('explains the consensus gate with a caption while below the minimum', () => {
		render(
			<ResultsStrip
				statement={makeStatement(0.9, { numberOfEvaluators: 2, sumEvaluations: 2 })}
				minEvaluators={5}
			/>,
		);

		expect(screen.getByTestId('results-strip-caption')).toHaveTextContent(
			'Consensus will show after 5 evaluators',
		);
	});

	it('drops the caption once consensus is shown', () => {
		render(
			<ResultsStrip statement={makeStatement(0.9, { numberOfEvaluators: 5, sumEvaluations: 2 })} />,
		);

		expect(screen.queryByTestId('results-strip-caption')).not.toBeInTheDocument();
	});

	it('marks a negative score so it does not read as an achievement', () => {
		const { container } = render(
			<ResultsStrip
				statement={makeStatement(-0.35, { numberOfEvaluators: 5, sumEvaluations: -2 })}
			/>,
		);

		expect(screen.getByText('−35')).toBeInTheDocument();
		expect(container.querySelectorAll('.results-strip__item--negative')).toHaveLength(2);
	});

	it('shows a score that rounds to zero as a plain 0, not as negative', () => {
		const { container } = render(
			<ResultsStrip
				statement={makeStatement(-0.004, { numberOfEvaluators: 5, sumEvaluations: 1 })}
			/>,
		);

		expect(screen.getByText('0')).toBeInTheDocument();
		expect(container.querySelector('.results-strip__item--negative')).toBeNull();
	});

	it('keeps each score isolated as LTR so the sign stays before the digits in RTL', () => {
		render(
			<ResultsStrip
				statement={makeStatement(-0.35, { numberOfEvaluators: 5, sumEvaluations: -2 })}
			/>,
		);

		expect(screen.getByText('−35')).toHaveAttribute('dir', 'ltr');
	});

	it('highlights the requested primary metric', () => {
		const { container } = render(
			<ResultsStrip
				statement={makeStatement(0.5, { numberOfEvaluators: 5, sumEvaluations: 3 })}
				primary="average"
			/>,
		);

		const primary = container.querySelector('.results-strip__item--primary');
		expect(primary).toHaveTextContent('+60');
		expect(primary).toHaveTextContent('Average rating');
	});
});

describe('ResultsStrip - explanations', () => {
	const statement = makeStatement(0.42, { numberOfEvaluators: 10, sumEvaluations: 6 });

	it('has no title attributes, which touch screens cannot open', () => {
		const { container } = render(<ResultsStrip statement={statement} />);

		expect(container.querySelector('[title]')).toBeNull();
	});

	it.each([
		['Agreement score', 'scoreTip.agreement'],
		['Average rating', 'scoreTip.average'],
		['People who rated', 'scoreTip.people'],
	])('%s opens %s on a tap', (label, tip) => {
		render(<ResultsStrip statement={statement} />);

		fireEvent.click(screen.getByRole('button', { name: new RegExp(label) }));

		expect(screen.getByRole('tooltip')).toHaveTextContent(tip);
	});

	it('every number can be reached by keyboard', () => {
		render(<ResultsStrip statement={statement} />);

		expect(screen.getAllByRole('button')).toHaveLength(3);
	});
});

describe('ResultsStrip - stakeholder coverage', () => {
	it('shows a bare evaluator count when no stakeholder set is known', () => {
		// Open participation: there is no denominator, and inventing one would
		// be worse than omitting it.
		render(<ResultsStrip statement={makeStatement(0.4, { numberOfEvaluators: 50 })} />);

		expect(screen.getByText('50')).toBeInTheDocument();
		expect(screen.queryByText(/\//)).not.toBeInTheDocument();
	});

	it('publishes the denominator the corrected score was computed against', () => {
		// The consensus above was finite-population corrected against 500, and
		// a smaller N would have raised it — so the reader has to see the 500.
		render(
			<ResultsStrip
				statement={makeStatement(0.42, { numberOfEvaluators: 50, stakeholderCount: 500 })}
			/>,
		);

		expect(screen.getByText('50 / 500')).toBeInTheDocument();
		expect(screen.getByText('People who rated')).toBeInTheDocument();
	});

	it('explains the known population with its own tip', () => {
		render(
			<ResultsStrip
				statement={makeStatement(0.42, { numberOfEvaluators: 50, stakeholderCount: 500 })}
			/>,
		);

		fireEvent.click(screen.getByRole('button', { name: /People who rated/ }));

		expect(screen.getByRole('tooltip')).toHaveTextContent('scoreTip.peopleOf');
	});

	it('isolates the evaluator value as LTR so bidi cannot flip "50 / 500"', () => {
		render(
			<ResultsStrip
				statement={makeStatement(0.42, { numberOfEvaluators: 50, stakeholderCount: 500 })}
			/>,
		);

		const value = screen.getByText('50 / 500');
		expect(value).toHaveAttribute('dir', 'ltr');
		expect(value).toHaveClass('results-strip__value');
	});

	it('shows a census as everyone having spoken', () => {
		render(
			<ResultsStrip
				statement={makeStatement(0.6, { numberOfEvaluators: 500, stakeholderCount: 500 })}
			/>,
		);

		expect(screen.getByText('500 / 500')).toBeInTheDocument();
	});

	it('chips variant uses the same names and highlights the agreement score', () => {
		const { container } = render(
			<ResultsStrip
				variant="chips"
				statement={makeStatement(0.42, {
					numberOfEvaluators: 10,
					sumEvaluations: 6,
					sumPro: 8,
					sumCon: 2,
				})}
			/>,
		);

		expect(container.querySelector('.results-strip--chips')).not.toBeNull();
		expect(screen.getByText('Agreement score')).toBeInTheDocument();
		expect(screen.getByText('Average rating')).toBeInTheDocument();
		expect(screen.getByText('People who rated')).toBeInTheDocument();
		expect(container.querySelector('.results-strip__item--primary')).toHaveTextContent('+42');
	});

	it('adds the inline class only on chips', () => {
		const statement = makeStatement(0.5, { numberOfEvaluators: 4, sumPro: 3, sumCon: 1 });
		const chips = render(<ResultsStrip statement={statement} variant="chips" inline />);
		expect(chips.container.querySelector('.results-strip--inline')).not.toBeNull();
		chips.unmount();

		const tiles = render(<ResultsStrip statement={statement} variant="tiles" inline />);
		expect(tiles.container.querySelector('.results-strip--inline')).toBeNull();
	});
});
