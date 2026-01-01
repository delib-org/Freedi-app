/**
 * Tests for SolutionCard component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import SolutionCard from '../SolutionCard';

// Mock InlineMarkdown
jest.mock('../../shared/InlineMarkdown', () => ({
  __esModule: true,
  default: ({ text }: { text: string }) => <span data-testid="inline-markdown">{text}</span>,
}));

// Mock paragraphUtils
jest.mock('@/lib/utils/paragraphUtils', () => ({
  getParagraphsText: jest.fn((paragraphs) => {
    if (!paragraphs || paragraphs.length === 0) return '';
    return paragraphs.map((p: { paragraph: string }) => p.paragraph).join(' ');
  }),
}));

describe('SolutionCard', () => {
  const mockOnEvaluate = jest.fn();

  const createMockSolution = (overrides: Partial<Statement> = {}): Statement => ({
    statementId: 'solution-123',
    statement: 'Test Solution Title',
    parentId: 'parent-123',
    creatorId: 'creator-123',
    lastUpdate: Date.now(),
    createdAt: Date.now(),
    statementType: 'option',
    consensus: 0,
    evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0 },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render solution title', () => {
      const solution = createMockSolution({ statement: 'My Solution' });
      render(<SolutionCard solution={solution} onEvaluate={mockOnEvaluate} />);

      expect(screen.getByText('My Solution')).toBeInTheDocument();
    });

    it('should render title with InlineMarkdown', () => {
      const solution = createMockSolution();
      render(<SolutionCard solution={solution} onEvaluate={mockOnEvaluate} />);

      expect(screen.getAllByTestId('inline-markdown')[0]).toBeInTheDocument();
    });

    it('should render description when paragraphs exist', () => {
      const solution = createMockSolution({
        statement: 'Title',
        paragraphs: [{ paragraph: 'Description text' }],
      });
      render(<SolutionCard solution={solution} onEvaluate={mockOnEvaluate} />);

      expect(screen.getByText('Description text')).toBeInTheDocument();
    });

    it('should not show description when it matches title', () => {
      const solution = createMockSolution({
        statement: 'Same text',
        paragraphs: [{ paragraph: 'Same text' }],
      });
      render(<SolutionCard solution={solution} onEvaluate={mockOnEvaluate} />);

      // Should only render title, not duplicate description
      const inlineMarkdowns = screen.getAllByTestId('inline-markdown');
      expect(inlineMarkdowns).toHaveLength(1);
    });

    it('should render EvaluationButtons', () => {
      const solution = createMockSolution();
      render(<SolutionCard solution={solution} onEvaluate={mockOnEvaluate} />);

      expect(screen.getAllByRole('button')).toHaveLength(5);
    });
  });

  describe('evaluation handling', () => {
    it('should call onEvaluate with solution ID and score', () => {
      const solution = createMockSolution({ statementId: 'sol-456' });
      render(<SolutionCard solution={solution} onEvaluate={mockOnEvaluate} />);

      fireEvent.click(screen.getByRole('button', { name: 'Agree' }));

      expect(mockOnEvaluate).toHaveBeenCalledWith('sol-456', 0.5);
    });

    it('should pass currentScore to EvaluationButtons', () => {
      const solution = createMockSolution();
      render(
        <SolutionCard
          solution={solution}
          onEvaluate={mockOnEvaluate}
          currentScore={1}
        />
      );

      expect(screen.getByRole('button', { name: 'Strongly agree' })).toHaveClass('selected');
    });
  });

  describe('evaluated state', () => {
    it('should apply evaluated class when currentScore is provided', () => {
      const solution = createMockSolution();
      const { container } = render(
        <SolutionCard
          solution={solution}
          onEvaluate={mockOnEvaluate}
          currentScore={0.5}
        />
      );

      expect(container.firstChild).toHaveClass('evaluated');
    });

    it('should not apply evaluated class when currentScore is null', () => {
      const solution = createMockSolution();
      const { container } = render(
        <SolutionCard
          solution={solution}
          onEvaluate={mockOnEvaluate}
          currentScore={null}
        />
      );

      expect(container.firstChild).not.toHaveClass('evaluated');
    });

    it('should not apply evaluated class when currentScore is undefined', () => {
      const solution = createMockSolution();
      const { container } = render(
        <SolutionCard
          solution={solution}
          onEvaluate={mockOnEvaluate}
          currentScore={undefined}
        />
      );

      expect(container.firstChild).not.toHaveClass('evaluated');
    });

    it('should apply evaluated class for zero score', () => {
      const solution = createMockSolution();
      const { container } = render(
        <SolutionCard
          solution={solution}
          onEvaluate={mockOnEvaluate}
          currentScore={0}
        />
      );

      expect(container.firstChild).toHaveClass('evaluated');
    });
  });

  describe('edge cases', () => {
    it('should handle solution without paragraphs', () => {
      const solution = createMockSolution({
        statement: 'Title only',
        paragraphs: undefined,
      });
      render(<SolutionCard solution={solution} onEvaluate={mockOnEvaluate} />);

      expect(screen.getByText('Title only')).toBeInTheDocument();
    });

    it('should handle solution with empty paragraphs', () => {
      const solution = createMockSolution({
        statement: 'Title',
        paragraphs: [],
      });
      render(<SolutionCard solution={solution} onEvaluate={mockOnEvaluate} />);

      // Falls back to statement as description, but since it matches title, not shown
      const inlineMarkdowns = screen.getAllByTestId('inline-markdown');
      expect(inlineMarkdowns).toHaveLength(1);
    });

    it('should handle multiple paragraphs', () => {
      const solution = createMockSolution({
        statement: 'Title',
        paragraphs: [
          { paragraph: 'First paragraph' },
          { paragraph: 'Second paragraph' },
        ],
      });
      render(<SolutionCard solution={solution} onEvaluate={mockOnEvaluate} />);

      expect(screen.getByText('First paragraph Second paragraph')).toBeInTheDocument();
    });
  });
});
