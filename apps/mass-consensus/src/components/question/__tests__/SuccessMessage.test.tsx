/**
 * Tests for SuccessMessage component
 * @jest-environment jsdom
 */

import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuccessMessage from '../SuccessMessage';

describe('SuccessMessage', () => {
  const mockOnComplete = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('created action', () => {
    it('should show created icon', () => {
      render(
        <SuccessMessage
          action="created"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText('✅')).toBeInTheDocument();
    });

    it('should show created title', () => {
      render(
        <SuccessMessage
          action="created"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/Your solution added!/)).toBeInTheDocument();
    });

    it('should show created message', () => {
      render(
        <SuccessMessage
          action="created"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/Thank you for contributing!/)).toBeInTheDocument();
    });

    it('should not show vote counter for created action', () => {
      render(
        <SuccessMessage
          action="created"
          solutionText="My solution"
          voteCount={5}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.queryByText('5')).not.toBeInTheDocument();
    });
  });

  describe('merged action', () => {
    it('should show merged icon', () => {
      render(
        <SuccessMessage
          action="merged"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText('🔀')).toBeInTheDocument();
    });

    it('should show merged title', () => {
      render(
        <SuccessMessage
          action="merged"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/Your idea was merged!/)).toBeInTheDocument();
    });

    it('should show merged message', () => {
      render(
        <SuccessMessage
          action="merged"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/Your idea has been merged/)).toBeInTheDocument();
    });

    it('should show vote counter for merged action', () => {
      render(
        <SuccessMessage
          action="merged"
          solutionText="My solution"
          voteCount={5}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('votes')).toBeInTheDocument();
    });
  });

  describe('evaluated action', () => {
    it('should show evaluated icon', () => {
      render(
        <SuccessMessage
          action="evaluated"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText('🤝')).toBeInTheDocument();
    });

    it('should show evaluated title', () => {
      render(
        <SuccessMessage
          action="evaluated"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/Great minds think alike!/)).toBeInTheDocument();
    });

    it('should show evaluated message', () => {
      render(
        <SuccessMessage
          action="evaluated"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/Your vote has been added/)).toBeInTheDocument();
    });

    it('should show vote counter with singular "vote" for count of 1', () => {
      render(
        <SuccessMessage
          action="evaluated"
          solutionText="My solution"
          voteCount={1}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('vote')).toBeInTheDocument();
    });

    it('should show vote counter with plural "votes" for count > 1', () => {
      render(
        <SuccessMessage
          action="evaluated"
          solutionText="My solution"
          voteCount={3}
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('votes')).toBeInTheDocument();
    });
  });

  describe('solution text display', () => {
    it('should display solution text in quotes', () => {
      render(
        <SuccessMessage
          action="created"
          solutionText="This is my solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByText(/"This is my solution"/)).toBeInTheDocument();
    });
  });

  describe('continue button', () => {
    it('should render continue button', () => {
      render(
        <SuccessMessage
          action="created"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(screen.getByRole('button', { name: /View All Solutions/i })).toBeInTheDocument();
    });

    it('should call onComplete when button clicked', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <SuccessMessage
          action="created"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      await user.click(screen.getByRole('button', { name: /View All Solutions/i }));

      expect(mockOnComplete).toHaveBeenCalled();
    });
  });

  describe('auto redirect', () => {
    it('should show auto redirect notice', () => {
      render(
        <SuccessMessage
          action="created"
          solutionText="My solution"
          onComplete={mockOnComplete}
          autoRedirectSeconds={5}
        />
      );

      expect(screen.getByText(/Auto-redirecting in 5 seconds/)).toBeInTheDocument();
    });

    it('should call onComplete after timeout', () => {
      render(
        <SuccessMessage
          action="created"
          solutionText="My solution"
          onComplete={mockOnComplete}
          autoRedirectSeconds={3}
        />
      );

      expect(mockOnComplete).not.toHaveBeenCalled();

      // Advance time by 3 seconds
      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(mockOnComplete).toHaveBeenCalled();
    });

    it('should call onComplete after default timeout', () => {
      render(
        <SuccessMessage
          action="created"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(mockOnComplete).not.toHaveBeenCalled();

      // Advance through the default timeout (UI.AUTO_REDIRECT_SECONDS * TIME.SECOND)
      act(() => {
        jest.runAllTimers();
      });

      expect(mockOnComplete).toHaveBeenCalledTimes(1);
    });
  });

  describe('styling', () => {
    it('should have newSolution class for created action', () => {
      const { container } = render(
        <SuccessMessage
          action="created"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(container.firstChild).toHaveClass('newSolution');
    });

    it('should have merged class for merged action', () => {
      const { container } = render(
        <SuccessMessage
          action="merged"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(container.firstChild).toHaveClass('merged');
    });

    it('should have evaluated class for evaluated action', () => {
      const { container } = render(
        <SuccessMessage
          action="evaluated"
          solutionText="My solution"
          onComplete={mockOnComplete}
        />
      );

      expect(container.firstChild).toHaveClass('evaluated');
    });
  });
});
