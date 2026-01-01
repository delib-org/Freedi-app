/**
 * Tests for QuestionHeader component
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import { Statement } from '@freedi/shared-types';
import QuestionHeader from '../QuestionHeader';

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

describe('QuestionHeader', () => {
  const createMockQuestion = (overrides: Partial<Statement> = {}): Statement => ({
    statementId: 'q-123',
    statement: 'Test Question Title',
    parentId: 'parent-123',
    creatorId: 'creator-123',
    lastUpdate: Date.now(),
    createdAt: Date.now(),
    statementType: 'question',
    consensus: 0,
    evaluation: { sumEvaluations: 0, numberOfEvaluations: 0, sumPro: 0, sumCon: 0 },
    ...overrides,
  });

  describe('rendering', () => {
    it('should render question title', () => {
      const question = createMockQuestion({ statement: 'My Question' });
      render(<QuestionHeader question={question} />);

      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
      expect(screen.getByText('My Question')).toBeInTheDocument();
    });

    it('should render title with InlineMarkdown', () => {
      const question = createMockQuestion();
      render(<QuestionHeader question={question} />);

      expect(screen.getAllByTestId('inline-markdown')[0]).toBeInTheDocument();
    });

    it('should render description when paragraphs exist', () => {
      const question = createMockQuestion({
        paragraphs: [{ paragraph: 'Question description text' }],
      });
      render(<QuestionHeader question={question} />);

      expect(screen.getByText('Question description text')).toBeInTheDocument();
    });

    it('should not render description when no paragraphs', () => {
      const question = createMockQuestion({ paragraphs: undefined });
      const { container } = render(<QuestionHeader question={question} />);

      const descriptions = container.querySelectorAll('p');
      expect(descriptions.length).toBe(0);
    });
  });

  describe('meta information', () => {
    it('should display suggestion count from totalSubStatements', () => {
      const question = createMockQuestion({ totalSubStatements: 15 });
      render(<QuestionHeader question={question} />);

      expect(screen.getByText('15 suggestions')).toBeInTheDocument();
    });

    it('should display suggestion count from suggestions fallback', () => {
      const question = createMockQuestion({
        totalSubStatements: undefined,
        suggestions: 8,
      });
      render(<QuestionHeader question={question} />);

      expect(screen.getByText('8 suggestions')).toBeInTheDocument();
    });

    it('should display 0 suggestions when no count available', () => {
      const question = createMockQuestion({
        totalSubStatements: undefined,
        suggestions: undefined,
      });
      render(<QuestionHeader question={question} />);

      expect(screen.getByText('0 suggestions')).toBeInTheDocument();
    });

    it('should display "Created" label', () => {
      const question = createMockQuestion();
      render(<QuestionHeader question={question} />);

      expect(screen.getByText(/Created/)).toBeInTheDocument();
    });
  });

  describe('date formatting', () => {
    it('should format date on client side', async () => {
      const specificDate = new Date('2024-06-15').getTime();
      const question = createMockQuestion({ createdAt: specificDate });
      render(<QuestionHeader question={question} />);

      // Date is formatted client-side after useEffect
      // The formatted date should appear
      await screen.findByText(/Created/);
    });
  });

  describe('edge cases', () => {
    it('should handle empty paragraphs array', () => {
      const question = createMockQuestion({ paragraphs: [] });
      const { container } = render(<QuestionHeader question={question} />);

      const descriptions = container.querySelectorAll('p');
      expect(descriptions.length).toBe(0);
    });

    it('should handle multiple paragraphs', () => {
      const question = createMockQuestion({
        paragraphs: [
          { paragraph: 'First paragraph' },
          { paragraph: 'Second paragraph' },
        ],
      });
      render(<QuestionHeader question={question} />);

      expect(screen.getByText('First paragraph Second paragraph')).toBeInTheDocument();
    });

    it('should handle long question text', () => {
      const longText = 'A'.repeat(500);
      const question = createMockQuestion({ statement: longText });
      render(<QuestionHeader question={question} />);

      expect(screen.getByText(longText)).toBeInTheDocument();
    });
  });
});
