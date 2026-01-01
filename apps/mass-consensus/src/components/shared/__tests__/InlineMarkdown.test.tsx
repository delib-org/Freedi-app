/**
 * Tests for InlineMarkdown component
 * @jest-environment jsdom
 */

import { render, screen } from '@testing-library/react';
import InlineMarkdown from '../InlineMarkdown';

describe('InlineMarkdown', () => {
  describe('plain text', () => {
    it('should render plain text without modification', () => {
      render(<InlineMarkdown text="Hello World" />);

      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('should render empty string', () => {
      const { container } = render(<InlineMarkdown text="" />);

      expect(container.firstChild).toBeInTheDocument();
      expect(container.firstChild?.textContent).toBe('');
    });
  });

  describe('bold text', () => {
    it('should render **bold** as <strong>', () => {
      render(<InlineMarkdown text="This is **bold** text" />);

      const strong = screen.getByText('bold');
      expect(strong.tagName).toBe('STRONG');
    });

    it('should handle multiple bold sections', () => {
      const { container } = render(
        <InlineMarkdown text="**First** and **Second**" />
      );

      const strongs = container.querySelectorAll('strong');
      expect(strongs).toHaveLength(2);
      expect(strongs[0]).toHaveTextContent('First');
      expect(strongs[1]).toHaveTextContent('Second');
    });

    it('should preserve text around bold', () => {
      render(<InlineMarkdown text="Start **bold** end" />);

      expect(screen.getByText(/Start/)).toBeInTheDocument();
      expect(screen.getByText('bold')).toBeInTheDocument();
      expect(screen.getByText(/end/)).toBeInTheDocument();
    });
  });

  describe('italic text', () => {
    it('should render *italic* as <em>', () => {
      render(<InlineMarkdown text="This is *italic* text" />);

      const em = screen.getByText('italic');
      expect(em.tagName).toBe('EM');
    });

    it('should handle multiple italic sections', () => {
      const { container } = render(
        <InlineMarkdown text="*First* and *Second*" />
      );

      const ems = container.querySelectorAll('em');
      expect(ems).toHaveLength(2);
    });
  });

  describe('bold italic text', () => {
    it('should render ***bold italic*** as <strong><em>', () => {
      render(<InlineMarkdown text="This is ***bold italic*** text" />);

      const strong = screen.getByText('bold italic').closest('strong');
      expect(strong).toBeInTheDocument();

      const em = screen.getByText('bold italic');
      expect(em.tagName).toBe('EM');
    });
  });

  describe('mixed formatting', () => {
    it('should handle bold and italic together', () => {
      const { container } = render(
        <InlineMarkdown text="**Bold** and *italic* text" />
      );

      expect(container.querySelector('strong')).toHaveTextContent('Bold');
      expect(container.querySelector('em')).toHaveTextContent('italic');
    });

    it('should handle complex mixed formatting', () => {
      const { container } = render(
        <InlineMarkdown text="Start **bold** middle *italic* end ***both***" />
      );

      const strongs = container.querySelectorAll('strong');
      const ems = container.querySelectorAll('em');

      // 2 strongs: one for **bold**, one for ***both***
      expect(strongs.length).toBeGreaterThanOrEqual(2);
      // 2 ems: one for *italic*, one inside ***both***
      expect(ems.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('edge cases', () => {
    it('should handle text at the start', () => {
      render(<InlineMarkdown text="**Bold** at start" />);

      expect(screen.getByText('Bold').tagName).toBe('STRONG');
    });

    it('should handle text at the end', () => {
      render(<InlineMarkdown text="Text **at end**" />);

      expect(screen.getByText('at end').tagName).toBe('STRONG');
    });

    it('should handle only formatted text', () => {
      render(<InlineMarkdown text="**Only bold**" />);

      expect(screen.getByText('Only bold').tagName).toBe('STRONG');
    });

    it('should handle unclosed markers as plain text', () => {
      render(<InlineMarkdown text="This has *unclosed italic" />);

      // Unclosed markers should render as plain text
      expect(screen.getByText(/This has \*unclosed italic/)).toBeInTheDocument();
    });

    it('should handle asterisks without matching pair', () => {
      render(<InlineMarkdown text="Price is $10*" />);

      expect(screen.getByText(/Price is \$10\*/)).toBeInTheDocument();
    });
  });

  describe('className', () => {
    it('should apply className to wrapper span', () => {
      const { container } = render(
        <InlineMarkdown text="Test" className="custom-class" />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('should render without className', () => {
      const { container } = render(<InlineMarkdown text="Test" />);

      expect(container.firstChild?.tagName).toBe('SPAN');
    });
  });

  describe('special characters', () => {
    it('should handle HTML entities', () => {
      render(<InlineMarkdown text="**<script>alert(1)</script>**" />);

      // Should be escaped/rendered as text, not executed
      expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    });

    it('should handle quotes and apostrophes', () => {
      render(<InlineMarkdown text={'It\'s **"quoted"** text'} />);

      expect(screen.getByText('"quoted"').tagName).toBe('STRONG');
    });
  });
});
