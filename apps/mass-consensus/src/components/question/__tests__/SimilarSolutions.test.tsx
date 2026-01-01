/**
 * Tests for SimilarSolutions component
 * @jest-environment jsdom
 */

import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SimilarSolutions from '../SimilarSolutions';
import { Statement } from '@freedi/shared-types';

// Mock InlineMarkdown
jest.mock('../../shared/InlineMarkdown', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <span>{text}</span>,
}));

describe('SimilarSolutions', () => {
  const createMockStatement = (overrides: Partial<Statement> = {}): Statement => ({
    statementId: 'stmt-1',
    statement: 'This is a similar solution',
    parentId: 'parent-1',
    creatorId: 'creator-1',
    lastUpdate: Date.now(),
    createdAt: Date.now(),
    statementType: 'option',
    consensus: 0,
    evaluation: {
      sumEvaluations: 0,
      numberOfEvaluations: 0,
      sumPro: 0,
      sumCon: 0,
      numberOfEvaluators: 5,
    },
    ...overrides,
  });

  const mockOnSelect = jest.fn();
  const mockOnMerge = jest.fn();
  const mockOnBack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('with no similar solutions', () => {
    it('should auto-select null after timeout', async () => {
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(mockOnSelect).toHaveBeenCalledWith(null);
    });

    it('should return null (not render anything)', () => {
      const { container } = render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('with similar solutions', () => {
    it('should render header', () => {
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText(/Similar proposal found!/i)).toBeInTheDocument();
    });

    it('should display best similar solution', () => {
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement({ statement: 'Best similar solution' })]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText('Best similar solution')).toBeInTheDocument();
    });

    it('should display user suggestion preview', () => {
      render(
        <SimilarSolutions
          userSuggestion="My unique suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText('My unique suggestion')).toBeInTheDocument();
      expect(screen.getByText(/Your addition:/i)).toBeInTheDocument();
    });

    it('should display supporter count', () => {
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText(/5 supporters/i)).toBeInTheDocument();
    });

    it('should display "supporter" for count of 1', () => {
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement({
            evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0, numberOfEvaluators: 1 },
          })]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText(/1/)).toBeInTheDocument();
      expect(screen.getByText(/supporter$/i)).toBeInTheDocument();
    });
  });

  describe('merge action', () => {
    it('should render merge button', () => {
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByRole('button', { name: /Merge & Strengthen/i })).toBeInTheDocument();
    });

    it('should call onMerge when merge button clicked', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement({ statementId: 'target-id' })]}
          onSelect={mockOnSelect}
          onMerge={mockOnMerge}
          onBack={mockOnBack}
        />
      );

      await user.click(screen.getByRole('button', { name: /Merge & Strengthen/i }));

      expect(mockOnMerge).toHaveBeenCalledWith('target-id');
    });

    it('should fall back to onSelect if onMerge not provided', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement({ statementId: 'target-id' })]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      await user.click(screen.getByRole('button', { name: /Merge & Strengthen/i }));

      expect(mockOnSelect).toHaveBeenCalledWith('target-id');
    });
  });

  describe('keep separate modal', () => {
    it('should show modal when keep separate clicked', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      await user.click(screen.getByRole('button', { name: /Keep as separate proposal/i }));

      expect(screen.getByText(/Why merge\?/i)).toBeInTheDocument();
    });

    it('should show benefits list in modal', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      await user.click(screen.getByRole('button', { name: /Keep as separate proposal/i }));

      expect(screen.getByText(/Your voice is preserved/i)).toBeInTheDocument();
      expect(screen.getByText(/Stronger together/i)).toBeInTheDocument();
    });

    it('should close modal when merge anyway clicked', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      await user.click(screen.getByRole('button', { name: /Keep as separate proposal/i }));
      await user.click(screen.getByRole('button', { name: /Merge Anyway/i }));

      expect(screen.queryByText(/Why merge\?/i)).not.toBeInTheDocument();
    });

    it('should call onSelect with null when confirm keep separate', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      await user.click(screen.getByRole('button', { name: /Keep as separate proposal/i }));
      await user.click(screen.getByRole('button', { name: /Keep Separate$/i }));

      expect(mockOnSelect).toHaveBeenCalledWith(null);
    });
  });

  describe('multiple similar solutions', () => {
    it('should show other similar proposals section', () => {
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[
            createMockStatement({ statementId: 's1', statement: 'First similar' }),
            createMockStatement({ statementId: 's2', statement: 'Second similar' }),
          ]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText(/Other similar proposals/i)).toBeInTheDocument();
      expect(screen.getByText('Second similar')).toBeInTheDocument();
    });

    it('should limit to MAX_SIMILAR_SOLUTIONS_DISPLAY', () => {
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[
            createMockStatement({ statementId: 's1', statement: 'First' }),
            createMockStatement({ statementId: 's2', statement: 'Second' }),
            createMockStatement({ statementId: 's3', statement: 'Third' }),
            createMockStatement({ statementId: 's4', statement: 'Fourth' }),
            createMockStatement({ statementId: 's5', statement: 'Fifth' }),
          ]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText('First')).toBeInTheDocument();
      expect(screen.getByText('Second')).toBeInTheDocument();
      expect(screen.getByText('Third')).toBeInTheDocument();
      expect(screen.queryByText('Fourth')).not.toBeInTheDocument();
      expect(screen.queryByText('Fifth')).not.toBeInTheDocument();
    });

    it('should allow merging with secondary solutions', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[
            createMockStatement({ statementId: 's1', statement: 'First similar' }),
            createMockStatement({ statementId: 's2', statement: 'Second similar' }),
          ]}
          onSelect={mockOnSelect}
          onMerge={mockOnMerge}
          onBack={mockOnBack}
        />
      );

      await user.click(screen.getByRole('button', { name: /Merge with this/i }));

      expect(mockOnMerge).toHaveBeenCalledWith('s2');
    });
  });

  describe('back button', () => {
    it('should render back button', () => {
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByRole('button', { name: /Back to Edit/i })).toBeInTheDocument();
    });

    it('should call onBack when back button clicked', async () => {
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      await user.click(screen.getByRole('button', { name: /Back to Edit/i }));

      expect(mockOnBack).toHaveBeenCalled();
    });
  });

  describe('help footer', () => {
    it('should display help text', () => {
      render(
        <SimilarSolutions
          userSuggestion="My suggestion"
          similarSolutions={[createMockStatement()]}
          onSelect={mockOnSelect}
          onBack={mockOnBack}
        />
      );

      expect(screen.getByText(/Merging preserves your voice/i)).toBeInTheDocument();
    });
  });
});
