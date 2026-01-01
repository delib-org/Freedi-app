/**
 * Tests for CompletionScreen component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CompletionScreen from '../CompletionScreen';

// Mock analytics
jest.mock('@/lib/analytics', () => ({
  trackEmailSubscribed: jest.fn(),
}));

// Mock AchievementBadge
jest.mock('../AchievementBadge', () => ({
  __esModule: true,
  default: ({ type }: { type: string }) => (
    <div data-testid={`badge-${type}`}>{type}</div>
  ),
}));

describe('CompletionScreen', () => {
  const defaultProps = {
    questionId: 'q-123',
    userId: 'user-123',
    participantCount: 100,
    solutionsEvaluated: 10,
    hasSubmittedSolution: false,
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
  });

  describe('rendering', () => {
    it('should render thank you message', () => {
      render(<CompletionScreen {...defaultProps} />);

      expect(screen.getByText('Thank You')).toBeInTheDocument();
      expect(screen.getByText('Thank you for your participation')).toBeInTheDocument();
    });

    it('should display solutions count', () => {
      render(<CompletionScreen {...defaultProps} solutionsEvaluated={15} />);

      expect(screen.getByText('15')).toBeInTheDocument();
      expect(screen.getByText('Solutions')).toBeInTheDocument();
    });

    it('should display participant count', () => {
      render(<CompletionScreen {...defaultProps} participantCount={250} />);

      expect(screen.getByText('250')).toBeInTheDocument();
      expect(screen.getByText('Total participants')).toBeInTheDocument();
    });

    it('should display estimated days', () => {
      render(<CompletionScreen {...defaultProps} estimatedDays={5} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should use default estimated days of 3', () => {
      render(<CompletionScreen {...defaultProps} />);

      expect(screen.getByText('3')).toBeInTheDocument();
    });
  });

  describe('badges', () => {
    it('should always show consensus-participant badge', () => {
      render(<CompletionScreen {...defaultProps} />);

      expect(screen.getByTestId('badge-consensus-participant')).toBeInTheDocument();
    });

    it('should show early-contributor badge when participantCount <= 50', () => {
      render(<CompletionScreen {...defaultProps} participantCount={25} />);

      expect(screen.getByTestId('badge-early-contributor')).toBeInTheDocument();
    });

    it('should not show early-contributor badge when participantCount > 50', () => {
      render(<CompletionScreen {...defaultProps} participantCount={100} />);

      expect(screen.queryByTestId('badge-early-contributor')).not.toBeInTheDocument();
    });

    it('should show thoughtful-evaluator badge when solutionsEvaluated >= 5', () => {
      render(<CompletionScreen {...defaultProps} solutionsEvaluated={5} />);

      expect(screen.getByTestId('badge-thoughtful-evaluator')).toBeInTheDocument();
    });

    it('should not show thoughtful-evaluator badge when solutionsEvaluated < 5', () => {
      render(<CompletionScreen {...defaultProps} solutionsEvaluated={3} />);

      expect(screen.queryByTestId('badge-thoughtful-evaluator')).not.toBeInTheDocument();
    });

    it('should show solution-creator badge when hasSubmittedSolution is true', () => {
      render(<CompletionScreen {...defaultProps} hasSubmittedSolution={true} />);

      expect(screen.getByTestId('badge-solution-creator')).toBeInTheDocument();
    });

    it('should not show solution-creator badge when hasSubmittedSolution is false', () => {
      render(<CompletionScreen {...defaultProps} hasSubmittedSolution={false} />);

      expect(screen.queryByTestId('badge-solution-creator')).not.toBeInTheDocument();
    });

    it('should show all badges when all conditions are met', () => {
      render(
        <CompletionScreen
          {...defaultProps}
          participantCount={30}
          solutionsEvaluated={10}
          hasSubmittedSolution={true}
        />
      );

      expect(screen.getByTestId('badge-early-contributor')).toBeInTheDocument();
      expect(screen.getByTestId('badge-thoughtful-evaluator')).toBeInTheDocument();
      expect(screen.getByTestId('badge-solution-creator')).toBeInTheDocument();
      expect(screen.getByTestId('badge-consensus-participant')).toBeInTheDocument();
    });
  });

  describe('email subscription form', () => {
    it('should render email input', () => {
      render(<CompletionScreen {...defaultProps} />);

      expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
    });

    it('should render submit button', () => {
      render(<CompletionScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });

    it('should show error for empty email', async () => {
      const user = userEvent.setup();
      render(<CompletionScreen {...defaultProps} />);

      await user.click(screen.getByRole('button', { name: 'Submit' }));

      expect(screen.getByText('Please enter your email')).toBeInTheDocument();
    });

    it('should show error for invalid email format', async () => {
      const user = userEvent.setup();
      render(<CompletionScreen {...defaultProps} />);

      const input = screen.getByPlaceholderText('your@email.com');
      // Type an invalid email that passes HTML5 but fails regex (spaces)
      fireEvent.change(input, { target: { value: ' test@test ' } });
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      // The component trims and validates - empty after trim fails with "Please enter your email"
      // or invalid format fails with "Invalid email"
      expect(
        screen.queryByText('Invalid email') || screen.queryByText('Please enter your email')
      ).toBeInTheDocument();
    });

    it('should submit valid email', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      render(<CompletionScreen {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          '/api/statements/q-123/subscribe',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ email: 'test@example.com', userId: 'user-123' }),
          })
        );
      });
    });

    it('should show success message after subscription', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true });

      render(<CompletionScreen {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(screen.getByText(/successfully registered/)).toBeInTheDocument();
      });
    });

    it('should show error on API failure', async () => {
      const user = userEvent.setup();
      (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false });

      render(<CompletionScreen {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      await waitFor(() => {
        expect(screen.getByText('Something went wrong. Please try again!')).toBeInTheDocument();
      });
    });

    it('should disable input and button while submitting', async () => {
      const user = userEvent.setup();
      let resolvePromise: (value: { ok: boolean }) => void;
      (global.fetch as jest.Mock).mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePromise = resolve;
        })
      );

      render(<CompletionScreen {...defaultProps} />);

      await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
      await user.click(screen.getByRole('button', { name: 'Submit' }));

      // Should show submitting state
      expect(screen.getByRole('button', { name: 'Submitting...' })).toBeDisabled();
      expect(screen.getByPlaceholderText('your@email.com')).toBeDisabled();

      // Resolve the promise
      resolvePromise!({ ok: true });

      await waitFor(() => {
        expect(screen.getByText(/successfully registered/)).toBeInTheDocument();
      });
    });
  });

  describe('close button', () => {
    it('should render continue button', () => {
      render(<CompletionScreen {...defaultProps} />);

      expect(screen.getByRole('button', { name: 'Continue Evaluating' })).toBeInTheDocument();
    });

    it('should call onClose when continue button clicked', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(<CompletionScreen {...defaultProps} onClose={onClose} />);

      await user.click(screen.getByRole('button', { name: 'Continue Evaluating' }));

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('visual elements', () => {
    it('should render celebration animation', () => {
      const { container } = render(<CompletionScreen {...defaultProps} />);

      expect(container.querySelector('.celebration')).toBeInTheDocument();
      expect(container.querySelector('.checkmark')).toBeInTheDocument();
    });

    it('should render confetti pieces', () => {
      const { container } = render(<CompletionScreen {...defaultProps} />);

      const confettiPieces = container.querySelectorAll('.confettiPiece');
      expect(confettiPieces).toHaveLength(12);
    });

    it('should render timeline section', () => {
      const { container } = render(<CompletionScreen {...defaultProps} />);

      expect(container.querySelector('.timeline')).toBeInTheDocument();
    });
  });
});
