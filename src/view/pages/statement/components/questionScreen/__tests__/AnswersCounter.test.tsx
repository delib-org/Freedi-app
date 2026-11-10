import { render, screen } from '@testing-library/react';
import AnswersCounter from '../AnswersCounter';
import type { QuestionScreenData } from '../useQuestionScreenData';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (k: string) => k }),
}));
jest.mock('../useQuestionScreenData', () => ({}));

function data(overrides: Partial<QuestionScreenData>): QuestionScreenData {
	return {
		ratedCount: 2,
		rateableCount: 5,
		answersComplete: true,
		...overrides,
	} as QuestionScreenData;
}

describe('AnswersCounter', () => {
	it('shows rated/total when every answer is loaded', () => {
		render(<AnswersCounter data={data({})} />);
		expect(screen.getByText('2/5')).toBeInTheDocument();
	});

	it('shows no fraction while only part of the answers is loaded', () => {
		render(<AnswersCounter data={data({ answersComplete: false })} />);
		expect(screen.queryByText('2/5')).not.toBeInTheDocument();
	});

	it('shows no fraction when the question runs the voting UI', () => {
		render(<AnswersCounter data={data({ ratedCount: 0, usesVotingUI: true })} />);
		expect(screen.queryByText('0/5')).not.toBeInTheDocument();
	});

	it('shows no fraction when there is nothing to rate', () => {
		render(<AnswersCounter data={data({ ratedCount: 0, rateableCount: 0 })} />);
		expect(screen.queryByText('0/0')).not.toBeInTheDocument();
	});
});
