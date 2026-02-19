/**
 * Tests for Modal atomic molecule component
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../Modal';

describe('Modal', () => {
	const defaultProps = {
		isOpen: true,
		onClose: jest.fn(),
	};

	beforeEach(() => {
		jest.clearAllMocks();
		document.body.innerHTML = '';
	});

	describe('rendering', () => {
		it('should render modal when isOpen is true', () => {
			render(
				<Modal {...defaultProps}>
					<p>Modal content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toBeInTheDocument();
			expect(screen.getByText('Modal content')).toBeInTheDocument();
		});

		it('should not render modal when isOpen is false', () => {
			render(
				<Modal {...defaultProps} isOpen={false}>
					<p>Hidden content</p>
				</Modal>,
			);

			expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
		});

		it('should render via portal to document.body', () => {
			render(
				<Modal {...defaultProps}>
					<p>Portal content</p>
				</Modal>,
			);

			const dialog = screen.getByRole('dialog');
			expect(dialog.parentElement).toBe(document.body);
		});

		it('should render with aria-modal attribute', () => {
			render(
				<Modal {...defaultProps}>
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
		});

		it('should render with open modifier class', () => {
			render(
				<Modal {...defaultProps}>
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('modal--open');
		});
	});

	describe('title', () => {
		it('should render title when provided', () => {
			render(
				<Modal {...defaultProps} title="Confirm Action">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByText('Confirm Action')).toBeInTheDocument();
		});

		it('should render title with correct class', () => {
			render(
				<Modal {...defaultProps} title="Title">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByText('Title')).toHaveClass('modal__title');
		});

		it('should use title as aria-label', () => {
			render(
				<Modal {...defaultProps} title="My Modal">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'My Modal');
		});
	});

	describe('close button', () => {
		it('should render close button by default', () => {
			render(
				<Modal {...defaultProps}>
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByLabelText('Close modal')).toBeInTheDocument();
		});

		it('should call onClose when close button is clicked', () => {
			const handleClose = jest.fn();
			render(
				<Modal {...defaultProps} onClose={handleClose}>
					<p>Content</p>
				</Modal>,
			);

			fireEvent.click(screen.getByLabelText('Close modal'));

			expect(handleClose).toHaveBeenCalledTimes(1);
		});

		it('should hide close button when showCloseButton is false', () => {
			render(
				<Modal {...defaultProps} showCloseButton={false}>
					<p>Content</p>
				</Modal>,
			);

			expect(screen.queryByLabelText('Close modal')).not.toBeInTheDocument();
		});
	});

	describe('footer', () => {
		it('should render footer when provided', () => {
			render(
				<Modal
					{...defaultProps}
					footer={<button>Confirm</button>}
				>
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByText('Confirm')).toBeInTheDocument();
		});

		it('should render footer with correct class', () => {
			render(
				<Modal
					{...defaultProps}
					footer={<button>OK</button>}
				>
					<p>Content</p>
				</Modal>,
			);

			const footer = document.body.querySelector('.modal__footer');
			expect(footer).toBeInTheDocument();
		});

		it('should apply footer alignment class', () => {
			render(
				<Modal
					{...defaultProps}
					footer={<button>OK</button>}
					footerAlign="center"
				>
					<p>Content</p>
				</Modal>,
			);

			const footer = document.body.querySelector('.modal__footer');
			expect(footer).toHaveClass('modal__footer--center');
		});
	});

	describe('sizes', () => {
		it('should apply small size class', () => {
			render(
				<Modal {...defaultProps} size="small">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('modal--small');
		});

		it('should apply medium size class by default', () => {
			render(
				<Modal {...defaultProps}>
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('modal--medium');
		});

		it('should apply large size class', () => {
			render(
				<Modal {...defaultProps} size="large">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('modal--large');
		});

		it('should apply full-screen size class', () => {
			render(
				<Modal {...defaultProps} size="full-screen">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('modal--full-screen');
		});
	});

	describe('variants', () => {
		it('should not add variant class for default', () => {
			render(
				<Modal {...defaultProps}>
					<p>Content</p>
				</Modal>,
			);

			const dialog = screen.getByRole('dialog');
			expect(dialog).not.toHaveClass('modal--primary');
			expect(dialog).not.toHaveClass('modal--warning');
		});

		it('should apply warning variant class', () => {
			render(
				<Modal {...defaultProps} variant="warning">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('modal--warning');
		});

		it('should apply error variant class', () => {
			render(
				<Modal {...defaultProps} variant="error">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('modal--error');
		});
	});

	describe('backdrop interaction', () => {
		it('should call onClose when backdrop is clicked', () => {
			const handleClose = jest.fn();
			render(
				<Modal {...defaultProps} onClose={handleClose}>
					<p>Content</p>
				</Modal>,
			);

			const dialog = screen.getByRole('dialog');
			fireEvent.click(dialog);

			expect(handleClose).toHaveBeenCalledTimes(1);
		});

		it('should not call onClose when content is clicked', () => {
			const handleClose = jest.fn();
			render(
				<Modal {...defaultProps} onClose={handleClose}>
					<p>Content</p>
				</Modal>,
			);

			fireEvent.click(screen.getByText('Content'));

			expect(handleClose).not.toHaveBeenCalled();
		});

		it('should not call onClose on backdrop click when closeOnBackdrop is false', () => {
			const handleClose = jest.fn();
			render(
				<Modal {...defaultProps} onClose={handleClose} closeOnBackdrop={false}>
					<p>Content</p>
				</Modal>,
			);

			const dialog = screen.getByRole('dialog');
			fireEvent.click(dialog);

			expect(handleClose).not.toHaveBeenCalled();
		});
	});

	describe('keyboard interaction', () => {
		it('should call onClose on Escape key', () => {
			const handleClose = jest.fn();
			render(
				<Modal {...defaultProps} onClose={handleClose}>
					<p>Content</p>
				</Modal>,
			);

			fireEvent.keyDown(document, { key: 'Escape' });

			expect(handleClose).toHaveBeenCalledTimes(1);
		});

		it('should not call onClose on Escape when closeOnEscape is false', () => {
			const handleClose = jest.fn();
			render(
				<Modal {...defaultProps} onClose={handleClose} closeOnEscape={false}>
					<p>Content</p>
				</Modal>,
			);

			fireEvent.keyDown(document, { key: 'Escape' });

			expect(handleClose).not.toHaveBeenCalled();
		});
	});

	describe('body scroll lock', () => {
		it('should add modal-open class to body when open', () => {
			render(
				<Modal {...defaultProps}>
					<p>Content</p>
				</Modal>,
			);

			expect(document.body).toHaveClass('modal-open');
		});

		it('should remove modal-open class from body on unmount', () => {
			const { unmount } = render(
				<Modal {...defaultProps}>
					<p>Content</p>
				</Modal>,
			);

			unmount();

			expect(document.body).not.toHaveClass('modal-open');
		});
	});

	describe('layout variants', () => {
		it('should apply bottom-sheet layout class', () => {
			render(
				<Modal {...defaultProps} layout="bottom-sheet">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('modal--bottom-sheet');
		});

		it('should apply centered layout class', () => {
			render(
				<Modal {...defaultProps} layout="centered">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('modal--centered');
		});
	});

	describe('additional props', () => {
		it('should apply custom className', () => {
			render(
				<Modal {...defaultProps} className="custom-modal">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('custom-modal');
		});

		it('should apply noPadding modifier', () => {
			render(
				<Modal {...defaultProps} noPadding>
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveClass('modal--no-padding');
		});

		it('should apply custom ariaLabel', () => {
			render(
				<Modal {...defaultProps} ariaLabel="Custom label">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Custom label');
		});

		it('should apply id attribute', () => {
			render(
				<Modal {...defaultProps} id="my-modal">
					<p>Content</p>
				</Modal>,
			);

			expect(screen.getByRole('dialog')).toHaveAttribute('id', 'my-modal');
		});
	});
});
