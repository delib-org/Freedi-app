/**
 * Tests for ExplanationEditor component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ExplanationEditor from '../ExplanationEditor';
import type { SurveyExplanationPage } from '@freedi/shared-types';

// Mock MarkdownRenderer
jest.mock('../../shared/MarkdownRenderer', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <div data-testid="markdown-preview">{content}</div>,
}));

describe('ExplanationEditor', () => {
  const createMockPage = (overrides: Partial<SurveyExplanationPage> = {}): SurveyExplanationPage => ({
    explanationPageId: 'exp-1',
    title: 'Introduction',
    content: 'This is the content',
    createdAt: Date.now(),
    lastUpdate: Date.now(),
    ...overrides,
  });

  const mockOnUpdate = jest.fn();
  const mockOnRemove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render title input with page title', () => {
      render(
        <ExplanationEditor
          page={createMockPage({ title: 'My Title' })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      expect(screen.getByDisplayValue('My Title')).toBeInTheDocument();
    });

    it('should render content textarea with page content', () => {
      render(
        <ExplanationEditor
          page={createMockPage({ content: 'Some content' })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      expect(screen.getByDisplayValue('Some content')).toBeInTheDocument();
    });

    it('should render hero image URL input', () => {
      render(
        <ExplanationEditor
          page={createMockPage({ heroImageUrl: 'https://example.com/image.jpg' })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      expect(screen.getByDisplayValue('https://example.com/image.jpg')).toBeInTheDocument();
    });

    it('should render remove button', () => {
      render(
        <ExplanationEditor
          page={createMockPage()}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      expect(screen.getByText(/removeExplanationPage/i)).toBeInTheDocument();
    });

    it('should render edit/preview toggle buttons', () => {
      render(
        <ExplanationEditor
          page={createMockPage()}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      expect(screen.getByText(/editContent/i)).toBeInTheDocument();
      expect(screen.getByText(/previewContent/i)).toBeInTheDocument();
    });
  });

  describe('title editing', () => {
    it('should call onUpdate when title changes', async () => {
      const user = userEvent.setup();
      render(
        <ExplanationEditor
          page={createMockPage({ title: '' })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      const titleInput = screen.getByPlaceholderText(/explanationTitlePlaceholder/i);
      await user.type(titleInput, 'New Title');

      expect(mockOnUpdate).toHaveBeenCalled();
    });
  });

  describe('content editing', () => {
    it('should show textarea in edit mode by default', () => {
      render(
        <ExplanationEditor
          page={createMockPage({ content: 'Test content' })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      // Should have a textarea (content editor)
      expect(screen.getByPlaceholderText(/explanationContentPlaceholder/i)).toBeInTheDocument();
    });

    it('should call onUpdate when content changes', async () => {
      const user = userEvent.setup();
      render(
        <ExplanationEditor
          page={createMockPage({ content: '' })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      const textarea = screen.getByPlaceholderText(/explanationContentPlaceholder/i);
      await user.type(textarea, 'New content');

      expect(mockOnUpdate).toHaveBeenCalled();
    });

    it('should show markdown hint in edit mode', () => {
      render(
        <ExplanationEditor
          page={createMockPage()}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      expect(screen.getByText(/markdownSupported/i)).toBeInTheDocument();
    });
  });

  describe('preview mode', () => {
    it('should switch to preview mode when preview button clicked', async () => {
      const user = userEvent.setup();
      render(
        <ExplanationEditor
          page={createMockPage({ content: 'Preview content' })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      await user.click(screen.getByText(/previewContent/i));

      expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
      expect(screen.getByTestId('markdown-preview')).toHaveTextContent('Preview content');
    });

    it('should hide textarea in preview mode', async () => {
      const user = userEvent.setup();
      render(
        <ExplanationEditor
          page={createMockPage()}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      await user.click(screen.getByText(/previewContent/i));

      expect(screen.queryByPlaceholderText(/explanationContentPlaceholder/i)).not.toBeInTheDocument();
    });

    it('should switch back to edit mode when edit button clicked', async () => {
      const user = userEvent.setup();
      render(
        <ExplanationEditor
          page={createMockPage()}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      // Switch to preview
      await user.click(screen.getByText(/previewContent/i));
      expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();

      // Switch back to edit
      await user.click(screen.getByText(/editContent/i));
      expect(screen.getByPlaceholderText(/explanationContentPlaceholder/i)).toBeInTheDocument();
    });
  });

  describe('hero image', () => {
    it('should call onUpdate when hero image URL changes', async () => {
      const user = userEvent.setup();
      render(
        <ExplanationEditor
          page={createMockPage({ heroImageUrl: '' })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      const imageInput = screen.getByPlaceholderText(/heroImageUrlPlaceholder/i);
      await user.type(imageInput, 'https://example.com/new-image.jpg');

      expect(mockOnUpdate).toHaveBeenCalled();
    });

    it('should show image preview when URL is provided', () => {
      render(
        <ExplanationEditor
          page={createMockPage({ heroImageUrl: 'https://example.com/image.jpg' })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      const image = screen.getByAltText('Hero preview');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
    });

    it('should not show image preview when URL is empty', () => {
      render(
        <ExplanationEditor
          page={createMockPage({ heroImageUrl: undefined })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      expect(screen.queryByAltText('Hero preview')).not.toBeInTheDocument();
    });

    it('should hide broken images on error', () => {
      render(
        <ExplanationEditor
          page={createMockPage({ heroImageUrl: 'https://invalid.com/broken.jpg' })}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      const image = screen.getByAltText('Hero preview');
      fireEvent.error(image);

      expect(image).toHaveStyle({ display: 'none' });
    });
  });

  describe('remove action', () => {
    it('should call onRemove when remove button clicked', async () => {
      const user = userEvent.setup();
      render(
        <ExplanationEditor
          page={createMockPage()}
          onUpdate={mockOnUpdate}
          onRemove={mockOnRemove}
        />
      );

      await user.click(screen.getByText(/removeExplanationPage/i));

      expect(mockOnRemove).toHaveBeenCalled();
    });
  });
});
