import { render, screen } from '@testing-library/react';
import RatedAllNotice from '../RatedAllNotice';
import type { QuestionScreenData } from '../useQuestionScreenData';

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));

function data(ratedCount: number, lastRatedAt: number): QuestionScreenData {
	return {
		ratedCount,
		rateableCount: 2,
		answersComplete: true,
		lastRatedAt,
	} as QuestionScreenData;
}

describe('RatedAllNotice', () => {
	it('shows the line when the person finishes, with no number in it', () => {
		const { rerender } = render(<RatedAllNotice data={data(1, 0)} />);
		expect(screen.queryByTestId('action-toast')).not.toBeInTheDocument();

		rerender(<RatedAllNotice data={data(2, Date.now() + 1000)} />);

		const toast = screen.getByTestId('action-toast');
		expect(toast).toHaveTextContent('question.ratedAllNotice');
		expect(toast.textContent).not.toMatch(/\d/);
	});

	it('shows nothing for a question that was already finished on an earlier visit', () => {
		const { rerender } = render(<RatedAllNotice data={data(1, 0)} />);

		rerender(<RatedAllNotice data={data(2, 5)} />);

		expect(screen.queryByTestId('action-toast')).not.toBeInTheDocument();
	});
});
