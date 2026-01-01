/**
 * Tests for MarkdownRenderer component
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import MarkdownRenderer from '../MarkdownRenderer';

// Mock react-markdown since it has complex dependencies
jest.mock('react-markdown', () => {
  return {
    __esModule: true,
    default: ({ children }: { children: string }) => <div data-testid="markdown">{children}</div>,
  };
});

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => {},
}));

describe('MarkdownRenderer', () => {
  describe('rendering', () => {
    it('should render markdown content', () => {
      render(<MarkdownRenderer content="Hello **World**" />);

      expect(screen.getByTestId('markdown')).toBeInTheDocument();
      expect(screen.getByTestId('markdown')).toHaveTextContent('Hello **World**');
    });

    it('should render empty content without crashing', () => {
      render(<MarkdownRenderer content="" />);

      expect(screen.getByTestId('markdown')).toBeInTheDocument();
    });

    it('should render multiline content', () => {
      const content = `# Heading

Some paragraph text.

- List item 1
- List item 2`;

      render(<MarkdownRenderer content={content} />);

      expect(screen.getByTestId('markdown')).toHaveTextContent('# Heading');
    });
  });

  describe('styling', () => {
    it('should apply markdown class', () => {
      const { container } = render(<MarkdownRenderer content="Test" />);

      expect(container.firstChild).toHaveClass('markdown');
    });

    it('should apply custom className when provided', () => {
      const { container } = render(
        <MarkdownRenderer content="Test" className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should handle undefined className', () => {
      const { container } = render(<MarkdownRenderer content="Test" />);

      // Should not have extra spaces or "undefined"
      expect(container.firstChild?.className).toMatch(/markdown\s*$/);
    });
  });

  describe('special content', () => {
    it('should render code blocks', () => {
      render(<MarkdownRenderer content="```js\nconst x = 1;\n```" />);

      expect(screen.getByTestId('markdown')).toBeInTheDocument();
    });

    it('should render links', () => {
      render(<MarkdownRenderer content="[Link](https://example.com)" />);

      expect(screen.getByTestId('markdown')).toBeInTheDocument();
    });

    it('should render images', () => {
      render(<MarkdownRenderer content="![Alt](https://example.com/img.png)" />);

      expect(screen.getByTestId('markdown')).toBeInTheDocument();
    });

    it('should render tables (GFM)', () => {
      const tableContent = `| Col1 | Col2 |
| --- | --- |
| A | B |`;

      render(<MarkdownRenderer content={tableContent} />);

      expect(screen.getByTestId('markdown')).toBeInTheDocument();
    });
  });
});
