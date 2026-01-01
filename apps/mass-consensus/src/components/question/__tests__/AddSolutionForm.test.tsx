/**
 * Tests for AddSolutionForm component
 * @jest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddSolutionForm from '../AddSolutionForm';
import { VALIDATION } from '@/constants/common';

describe('AddSolutionForm', () => {
  const mockOnSubmit = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('rendering', () => {
    it('should render title', () => {
      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      expect(screen.getByText('Add Your Solution')).toBeInTheDocument();
    });

    it('should render textarea with placeholder', () => {
      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      expect(screen.getByPlaceholderText('Type your solution here...')).toBeInTheDocument();
    });

    it('should render submit button', () => {
      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      expect(screen.getByRole('button', { name: /submit solution/i })).toBeInTheDocument();
    });

    it('should render character count', () => {
      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      expect(screen.getByText(`0/${VALIDATION.MAX_SOLUTION_LENGTH} characters`)).toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('should disable submit button when text is too short', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...');
      await user.type(textarea, 'ab');

      expect(screen.getByRole('button', { name: /submit solution/i })).toBeDisabled();
    });

    it('should enable submit button when text meets minimum length', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...');
      const validText = 'a'.repeat(VALIDATION.MIN_SOLUTION_LENGTH);
      await user.type(textarea, validText);

      expect(screen.getByRole('button', { name: /submit solution/i })).not.toBeDisabled();
    });

    it('should show minimum length warning when text is too short', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...');
      await user.type(textarea, 'ab');

      expect(screen.getByText(new RegExp(`minimum ${VALIDATION.MIN_SOLUTION_LENGTH}`))).toBeInTheDocument();
    });

    it('should update character count as user types', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...');
      await user.type(textarea, 'hello');

      expect(screen.getByText(`5/${VALIDATION.MAX_SOLUTION_LENGTH} characters`)).toBeInTheDocument();
    });
  });

  describe('submission', () => {
    it('should call onSubmit with text when form is submitted', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...');
      const validText = 'This is a valid solution text that meets the minimum length requirement.';
      await user.type(textarea, validText);

      const submitButton = screen.getByRole('button', { name: /submit solution/i });
      await user.click(submitButton);

      expect(mockOnSubmit).toHaveBeenCalledWith(validText);
    });

    it('should show loading state during submission', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...');
      const validText = 'This is a valid solution text that meets the minimum length requirement.';
      await user.type(textarea, validText);

      const submitButton = screen.getByRole('button', { name: /submit solution/i });
      await user.click(submitButton);

      expect(screen.getByText('Checking...')).toBeInTheDocument();
    });

    it('should clear form after submission delay', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...') as HTMLTextAreaElement;
      const validText = 'This is a valid solution text that meets the minimum length requirement.';
      await user.type(textarea, validText);

      const submitButton = screen.getByRole('button', { name: /submit solution/i });
      await user.click(submitButton);

      // Advance timers to trigger form reset
      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        expect(textarea.value).toBe('');
      });
    });

    it('should disable textarea during submission', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...');
      const validText = 'This is a valid solution text that meets the minimum length requirement.';
      await user.type(textarea, validText);

      const submitButton = screen.getByRole('button', { name: /submit solution/i });
      await user.click(submitButton);

      expect(textarea).toBeDisabled();
    });

    it('should not submit when button is disabled', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...');
      await user.type(textarea, 'ab'); // Too short

      const submitButton = screen.getByRole('button', { name: /submit solution/i });
      await user.click(submitButton);

      expect(mockOnSubmit).not.toHaveBeenCalled();
    });
  });

  describe('textarea auto-grow', () => {
    it('should have initial row count of 1', () => {
      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...');
      expect(textarea).toHaveAttribute('rows', '1');
    });

    it('should have max length attribute', () => {
      render(
        <AddSolutionForm
          questionId="q1"
          userId="user-1"
          onSubmit={mockOnSubmit}
        />
      );

      const textarea = screen.getByPlaceholderText('Type your solution here...');
      expect(textarea).toHaveAttribute('maxlength', String(VALIDATION.MAX_SOLUTION_LENGTH));
    });
  });
});
