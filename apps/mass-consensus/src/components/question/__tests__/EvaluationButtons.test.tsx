/**
 * Tests for EvaluationButtons component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import EvaluationButtons from '../EvaluationButtons';

describe('EvaluationButtons', () => {
  const mockOnEvaluate = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render 5 evaluation buttons', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(5);
    });

    it('should render buttons with correct scores', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} />);

      expect(screen.getByText('-1')).toBeInTheDocument();
      expect(screen.getByText('-0.5')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getByText('+0.5')).toBeInTheDocument();
      expect(screen.getByText('+1')).toBeInTheDocument();
    });

    it('should render buttons with emojis', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} />);

      expect(screen.getByText('👎👎')).toBeInTheDocument();
      expect(screen.getByText('👎')).toBeInTheDocument();
      expect(screen.getByText('🤷')).toBeInTheDocument();
      expect(screen.getByText('👍')).toBeInTheDocument();
      expect(screen.getByText('👍👍')).toBeInTheDocument();
    });

    it('should have accessible labels', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} />);

      expect(screen.getByRole('button', { name: 'Strongly disagree' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Disagree' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Neutral' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Agree' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Strongly agree' })).toBeInTheDocument();
    });
  });

  describe('interaction', () => {
    it('should call onEvaluate with correct score when button clicked', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} />);

      fireEvent.click(screen.getByRole('button', { name: 'Agree' }));

      expect(mockOnEvaluate).toHaveBeenCalledWith(0.5);
    });

    it('should call onEvaluate for each score', () => {
      const scores = [-1, -0.5, 0, 0.5, 1];
      const labels = ['Strongly disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly agree'];

      render(<EvaluationButtons onEvaluate={mockOnEvaluate} />);

      labels.forEach((label, index) => {
        fireEvent.click(screen.getByRole('button', { name: label }));
        expect(mockOnEvaluate).toHaveBeenLastCalledWith(scores[index]);
      });

      expect(mockOnEvaluate).toHaveBeenCalledTimes(5);
    });
  });

  describe('selection state', () => {
    it('should apply selected class when button is clicked', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} />);

      const button = screen.getByRole('button', { name: 'Agree' });
      fireEvent.click(button);

      expect(button).toHaveClass('selected');
    });

    it('should only have one selected button at a time', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} />);

      const agreeButton = screen.getByRole('button', { name: 'Agree' });
      const disagreeButton = screen.getByRole('button', { name: 'Disagree' });

      fireEvent.click(agreeButton);
      expect(agreeButton).toHaveClass('selected');

      fireEvent.click(disagreeButton);
      expect(disagreeButton).toHaveClass('selected');
      expect(agreeButton).not.toHaveClass('selected');
    });

    it('should show pre-selected button when currentScore is provided', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} currentScore={0.5} />);

      const agreeButton = screen.getByRole('button', { name: 'Agree' });
      expect(agreeButton).toHaveClass('selected');
    });

    it('should update selection when currentScore prop changes', () => {
      const { rerender } = render(
        <EvaluationButtons onEvaluate={mockOnEvaluate} currentScore={0.5} />
      );

      expect(screen.getByRole('button', { name: 'Agree' })).toHaveClass('selected');

      rerender(<EvaluationButtons onEvaluate={mockOnEvaluate} currentScore={-0.5} />);

      expect(screen.getByRole('button', { name: 'Disagree' })).toHaveClass('selected');
      expect(screen.getByRole('button', { name: 'Agree' })).not.toHaveClass('selected');
    });

    it('should handle null currentScore', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} currentScore={null} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).not.toHaveClass('selected');
      });
    });

    it('should handle undefined currentScore', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} currentScore={undefined} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach((button) => {
        expect(button).not.toHaveClass('selected');
      });
    });
  });

  describe('edge cases', () => {
    it('should handle multiple rapid clicks', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} />);

      const buttons = screen.getAllByRole('button');

      buttons.forEach((button) => {
        fireEvent.click(button);
      });

      expect(mockOnEvaluate).toHaveBeenCalledTimes(5);
    });

    it('should handle clicking same button twice', () => {
      render(<EvaluationButtons onEvaluate={mockOnEvaluate} />);

      const button = screen.getByRole('button', { name: 'Neutral' });
      fireEvent.click(button);
      fireEvent.click(button);

      expect(mockOnEvaluate).toHaveBeenCalledTimes(2);
      expect(mockOnEvaluate).toHaveBeenCalledWith(0);
    });
  });
});
