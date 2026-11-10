import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import LeadingSuggestion from '../LeadingSuggestion';

let mockCanSee = false;

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}));
jest.mock('../../../../../questionScreen/useAnswerScoreGate', () => ({
	useAnswerScoreGate: () => ({ canSee: mockCanSee, showRevealHint: false }),
}));

const option = { statementId: 'a1', statement: 'The best title', consensus: 0.7 } as Statement;

describe('LeadingSuggestion', () => {
	beforeEach(() => {
		mockCanSee = false;
	});

	it('names no leader to a locked viewer', () => {
		render(<LeadingSuggestion option={option} isHost={false} />);

		expect(screen.queryByText('Leading suggestion')).not.toBeInTheDocument();
		expect(screen.queryByText('The best title')).not.toBeInTheDocument();
	});

	it('shows the leader once the guard allows', () => {
		mockCanSee = true;

		render(<LeadingSuggestion option={option} isHost={false} />);

		expect(screen.getByText('The best title')).toBeInTheDocument();
	});

	it('shows a host the leader even before the discussion is loaded', () => {
		render(<LeadingSuggestion option={option} isHost />);

		expect(screen.getByTestId('leading-suggestion')).toBeInTheDocument();
	});
});
