import { render } from '@testing-library/react';
import { renderInlineMarkdown, hasInlineMarkdown } from '../inlineMarkdownHelpers';

describe('inlineMarkdownHelpers', () => {
	describe('renderInlineMarkdown', () => {
		it('should return null for null/undefined input', () => {
			expect(renderInlineMarkdown(null)).toBeNull();
			expect(renderInlineMarkdown(undefined)).toBeNull();
		});

		it('should return plain text without markdown formatting', () => {
			const { container } = render(<>{renderInlineMarkdown('Hello world')}</>);
			expect(container.textContent).toBe('Hello world');
		});

		it('should render **bold** text with strong tags', () => {
			const { container } = render(<>{renderInlineMarkdown('This is **bold** text')}</>);
			expect(container.textContent).toBe('This is bold text');
			expect(container.querySelector('strong')?.textContent).toBe('bold');
		});

		it('should render __bold__ text with strong tags', () => {
			const { container } = render(<>{renderInlineMarkdown('This is __bold__ text')}</>);
			expect(container.textContent).toBe('This is bold text');
			expect(container.querySelector('strong')?.textContent).toBe('bold');
		});

		it('should render *italic* text with em tags', () => {
			const { container } = render(<>{renderInlineMarkdown('This is *italic* text')}</>);
			expect(container.textContent).toBe('This is italic text');
			expect(container.querySelector('em')?.textContent).toBe('italic');
		});

		it('should render _italic_ text with em tags', () => {
			const { container } = render(<>{renderInlineMarkdown('This is _italic_ text')}</>);
			expect(container.textContent).toBe('This is italic text');
			expect(container.querySelector('em')?.textContent).toBe('italic');
		});

		it('should render ***bolditalic*** text with strong and em tags', () => {
			const { container } = render(<>{renderInlineMarkdown('This is ***bolditalic*** text')}</>);
			expect(container.textContent).toBe('This is bolditalic text');
			const strong = container.querySelector('strong');
			expect(strong).toBeTruthy();
			expect(strong?.querySelector('em')?.textContent).toBe('bolditalic');
		});

		it('should render ___bolditalic___ text with strong and em tags', () => {
			const { container } = render(<>{renderInlineMarkdown('This is ___bolditalic___ text')}</>);
			expect(container.textContent).toBe('This is bolditalic text');
			const strong = container.querySelector('strong');
			expect(strong).toBeTruthy();
			expect(strong?.querySelector('em')?.textContent).toBe('bolditalic');
		});

		it('should handle multiple formatting in same string', () => {
			const { container } = render(<>{renderInlineMarkdown('**bold** and *italic*')}</>);
			expect(container.textContent).toBe('bold and italic');
			expect(container.querySelectorAll('strong').length).toBe(1);
			expect(container.querySelectorAll('em').length).toBe(1);
		});

		it('should preserve text between markdown elements', () => {
			const { container } = render(<>{renderInlineMarkdown('Start **middle** end')}</>);
			expect(container.textContent).toBe('Start middle end');
		});
	});

	describe('hasInlineMarkdown', () => {
		it('should return false for null/undefined', () => {
			expect(hasInlineMarkdown(null)).toBe(false);
			expect(hasInlineMarkdown(undefined)).toBe(false);
		});

		it('should return false for plain text', () => {
			expect(hasInlineMarkdown('Hello world')).toBe(false);
		});

		it('should return true for **bold** text', () => {
			expect(hasInlineMarkdown('This is **bold** text')).toBe(true);
		});

		it('should return true for *italic* text', () => {
			expect(hasInlineMarkdown('This is *italic* text')).toBe(true);
		});

		it('should return true for __bold__ text', () => {
			expect(hasInlineMarkdown('This is __bold__ text')).toBe(true);
		});

		it('should return true for _italic_ text', () => {
			expect(hasInlineMarkdown('This is _italic_ text')).toBe(true);
		});

		it('should return true for ***bolditalic*** text', () => {
			expect(hasInlineMarkdown('This is ***bolditalic*** text')).toBe(true);
		});
	});
});
