/**
 * Tests for Modal component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../shared/Modal';

// Mock CSS modules
jest.mock('../shared/Modal.module.scss', () => ({
	backdrop: 'backdrop',
	modal: 'modal',
	small: 'small',
	medium: 'medium',
	large: 'large',
	header: 'header',
	title: 'title',
	closeButton: 'closeButton',
	content: 'content',
}));

describe('Modal', () => {
	const defaultProps = {
		onClose: jest.fn(),
		children: <div>Modal content</div>,
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('renders children content', () => {
		render(<Modal {...defaultProps} />);
		expect(screen.getByText('Modal content')).toBeInTheDocument();
	});

	it('renders with role="dialog"', () => {
		render(<Modal {...defaultProps} />);
		expect(screen.getByRole('dialog')).toBeInTheDocument();
	});

	it('has aria-modal="true"', () => {
		render(<Modal {...defaultProps} />);
		expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
	});

	describe('title', () => {
		it('does not render title when not provided', () => {
			render(<Modal {...defaultProps} />);
			expect(screen.queryByRole('heading')).not.toBeInTheDocument();
		});

		it('renders title when provided', () => {
			render(<Modal {...defaultProps} title="Test Title" />);
			expect(screen.getByRole('heading', { name: 'Test Title' })).toBeInTheDocument();
		});

		it('sets aria-labelledby when title is provided', () => {
			render(<Modal {...defaultProps} title="Test Title" />);
			expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby', 'modal-title');
		});

		it('does not set aria-labelledby when title is not provided', () => {
			render(<Modal {...defaultProps} />);
			expect(screen.getByRole('dialog')).not.toHaveAttribute('aria-labelledby');
		});

		it('renders close button when title is provided', () => {
			render(<Modal {...defaultProps} title="Test Title" />);
			expect(screen.getByRole('button', { name: 'Close modal' })).toBeInTheDocument();
		});
	});

	describe('sizes', () => {
		it('applies medium size by default', () => {
			render(<Modal {...defaultProps} />);
			expect(screen.getByRole('dialog').querySelector('.modal')).toHaveClass('medium');
		});

		it('applies small size', () => {
			render(<Modal {...defaultProps} size="small" />);
			expect(screen.getByRole('dialog').querySelector('.modal')).toHaveClass('small');
		});

		it('applies large size', () => {
			render(<Modal {...defaultProps} size="large" />);
			expect(screen.getByRole('dialog').querySelector('.modal')).toHaveClass('large');
		});
	});

	describe('close interactions', () => {
		it('calls onClose when close button is clicked', () => {
			const onClose = jest.fn();
			render(<Modal {...defaultProps} onClose={onClose} title="Title" />);

			fireEvent.click(screen.getByRole('button', { name: 'Close modal' }));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('calls onClose when backdrop is clicked', () => {
			const onClose = jest.fn();
			render(<Modal {...defaultProps} onClose={onClose} />);

			// Click on backdrop (the element with role="dialog")
			fireEvent.click(screen.getByRole('dialog'));

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('does not call onClose when modal content is clicked', () => {
			const onClose = jest.fn();
			render(<Modal {...defaultProps} onClose={onClose} />);

			// Click on the modal content, not the backdrop
			fireEvent.click(screen.getByText('Modal content'));

			expect(onClose).not.toHaveBeenCalled();
		});

		it('calls onClose when Escape key is pressed', () => {
			const onClose = jest.fn();
			render(<Modal {...defaultProps} onClose={onClose} />);

			fireEvent.keyDown(document, { key: 'Escape' });

			expect(onClose).toHaveBeenCalledTimes(1);
		});

		it('does not call onClose for other keys', () => {
			const onClose = jest.fn();
			render(<Modal {...defaultProps} onClose={onClose} />);

			fireEvent.keyDown(document, { key: 'Enter' });
			fireEvent.keyDown(document, { key: 'Tab' });

			expect(onClose).not.toHaveBeenCalled();
		});
	});

	describe('body scroll prevention', () => {
		it('sets body overflow to hidden on mount', () => {
			render(<Modal {...defaultProps} />);
			expect(document.body.style.overflow).toBe('hidden');
		});

		it('restores body overflow on unmount', () => {
			const { unmount } = render(<Modal {...defaultProps} />);
			expect(document.body.style.overflow).toBe('hidden');

			unmount();
			expect(document.body.style.overflow).toBe('');
		});
	});

	describe('event cleanup', () => {
		it('removes keydown event listener on unmount', () => {
			const removeEventListenerSpy = jest.spyOn(document, 'removeEventListener');
			const { unmount } = render(<Modal {...defaultProps} />);

			unmount();

			expect(removeEventListenerSpy).toHaveBeenCalledWith('keydown', expect.any(Function));
			removeEventListenerSpy.mockRestore();
		});
	});
});
