import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Statement } from '@freedi/shared-types';
import AnswerResult from '../AnswerResult';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

function renderAnswer(raters: number, consensus = 0.8): void {
	const answer = {
		statementId: 'a1',
		statement: 'An answer',
		createdAt: 1,
		consensus,
		evaluation: { numberOfEvaluators: raters, agreement: consensus, sumEvaluations: raters },
	} as unknown as Statement;

	render(
		<MemoryRouter>
			<AnswerResult answer={answer} variant="ranked" rank={1} />
		</MemoryRouter>,
	);
}

describe('AnswerResult', () => {
	it('says "Not rated yet" and shows no bar with no raters', () => {
		renderAnswer(0);

		expect(screen.getByText('Not rated yet')).toBeInTheDocument();
		expect(screen.queryByRole('img')).not.toBeInTheDocument();
	});

	it.each([1, 2])('hides the bar and says too few ratings with %d raters', (raters) => {
		renderAnswer(raters);

		expect(screen.getByText('Too few ratings so far')).toBeInTheDocument();
		expect(screen.queryByRole('img')).not.toBeInTheDocument();
	});

	it('shows the bar and the band from 3 raters', () => {
		renderAnswer(3);

		expect(screen.getByRole('img', { name: 'Broad agreement' })).toBeInTheDocument();
	});
});
