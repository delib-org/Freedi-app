/**
 * Tests for Modal component
 * @jest-environment jsdom
 */

import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Modal from '../Modal';

describe('Modal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    children: <div>Modal content</div>,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    document.body.style.overflow = 'unset';
  });

  describe('visibility', () => {
    it('should render when isOpen is true', () => {
      render(<Modal {...defaultProps} />);

      expect(screen.getByText('Modal content')).toBeInTheDocument();
    });

    it('should not render when isOpen is false', () => {
      render(<Modal {...defaultProps} isOpen={false} />);

      expect(screen.queryByText('Modal content')).not.toBeInTheDocument();
    });

    it('should show title when provided', () => {
      render(<Modal {...defaultProps} title="Test Title" />);

      expect(screen.getByRole('heading', { name: 'Test Title' })).toBeInTheDocument();
    });

    it('should not show header when title is not provided', () => {
      render(<Modal {...defaultProps} />);

      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });
  });

  describe('closing behavior', () => {
    it('should call onClose when clicking overlay', async () => {
      const onClose = jest.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      const overlay = document.querySelector('.overlay');
      if (overlay) {
        fireEvent.click(overlay);
      }

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose when clicking modal content', async () => {
      const onClose = jest.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      fireEvent.click(screen.getByText('Modal content'));

      expect(onClose).not.toHaveBeenCalled();
    });

    it('should call onClose when clicking close button', async () => {
      const user = userEvent.setup();
      const onClose = jest.fn();
      render(<Modal {...defaultProps} onClose={onClose} title="Test" />);

      const closeButton = screen.getByRole('button');
      await user.click(closeButton);

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should call onClose when pressing Escape key', () => {
      const onClose = jest.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('should not call onClose for other keys', () => {
      const onClose = jest.fn();
      render(<Modal {...defaultProps} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Enter' });

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('body scroll behavior', () => {
    it('should disable body scroll when open', () => {
      render(<Modal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body scroll when closed', () => {
      const { rerender } = render(<Modal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');

      rerender(<Modal {...defaultProps} isOpen={false} />);

      expect(document.body.style.overflow).toBe('unset');
    });

    it('should restore body scroll on unmount', () => {
      const { unmount } = render(<Modal {...defaultProps} />);

      expect(document.body.style.overflow).toBe('hidden');

      unmount();

      expect(document.body.style.overflow).toBe('unset');
    });
  });

  describe('event listener cleanup', () => {
    it('should remove keydown listener when closed', () => {
      const onClose = jest.fn();
      const { rerender } = render(<Modal {...defaultProps} onClose={onClose} />);

      rerender(<Modal {...defaultProps} isOpen={false} onClose={onClose} />);

      fireEvent.keyDown(document, { key: 'Escape' });

      // Should not be called after modal is closed
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('children rendering', () => {
    it('should render children content', () => {
      render(
        <Modal {...defaultProps}>
          <p>Paragraph 1</p>
          <p>Paragraph 2</p>
        </Modal>
      );

      expect(screen.getByText('Paragraph 1')).toBeInTheDocument();
      expect(screen.getByText('Paragraph 2')).toBeInTheDocument();
    });

    it('should render complex children', () => {
      render(
        <Modal {...defaultProps}>
          <form>
            <input type="text" placeholder="Test input" />
            <button type="submit">Submit</button>
          </form>
        </Modal>
      );

      expect(screen.getByPlaceholderText('Test input')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
    });
  });
});
