/**
 * Tests for Loader atomic component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import Loader from '../Loader';

describe('Loader', () => {
	describe('rendering', () => {
		it('should render with status role', () => {
			render(<Loader />);

			expect(screen.getByRole('status')).toBeInTheDocument();
		});

		it('should render spinner element', () => {
			render(<Loader />);

			const status = screen.getByRole('status');
			const spinner = status.querySelector('.loader__spinner');
			expect(spinner).toBeInTheDocument();
		});

		it('should render with default classes', () => {
			render(<Loader />);

			const loader = screen.getByRole('status');
			expect(loader).toHaveClass('loader');
			// Default size (medium) and variant (default) should not add modifier classes
			expect(loader).not.toHaveClass('loader--small');
			expect(loader).not.toHaveClass('loader--large');
			expect(loader).not.toHaveClass('loader--primary');
		});

		it('should have default aria-label', () => {
			render(<Loader />);

			expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading');
		});

		it('should have aria-busy attribute', () => {
			render(<Loader />);

			expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true');
		});
	});

	describe('text', () => {
		it('should render text when provided', () => {
			render(<Loader text="Loading data..." />);

			expect(screen.getByText('Loading data...')).toBeInTheDocument();
		});

		it('should render text with correct class', () => {
			render(<Loader text="Please wait" />);

			const text = screen.getByText('Please wait');
			expect(text).toHaveClass('loader__text');
		});

		it('should not render text element when text is not provided', () => {
			render(<Loader />);

			const status = screen.getByRole('status');
			expect(status.querySelector('.loader__text')).not.toBeInTheDocument();
		});
	});

	describe('sizes', () => {
		it('should apply small size class', () => {
			render(<Loader size="small" />);

			expect(screen.getByRole('status')).toHaveClass('loader--small');
		});

		it('should not add size class for medium (default)', () => {
			render(<Loader size="medium" />);

			const loader = screen.getByRole('status');
			expect(loader).not.toHaveClass('loader--medium');
			expect(loader).not.toHaveClass('loader--small');
			expect(loader).not.toHaveClass('loader--large');
		});

		it('should apply large size class', () => {
			render(<Loader size="large" />);

			expect(screen.getByRole('status')).toHaveClass('loader--large');
		});
	});

	describe('variants', () => {
		it('should not add variant class for default', () => {
			render(<Loader />);

			expect(screen.getByRole('status')).not.toHaveClass('loader--primary');
			expect(screen.getByRole('status')).not.toHaveClass('loader--white');
		});

		it('should apply primary variant class', () => {
			render(<Loader variant="primary" />);

			expect(screen.getByRole('status')).toHaveClass('loader--primary');
		});

		it('should apply white variant class', () => {
			render(<Loader variant="white" />);

			expect(screen.getByRole('status')).toHaveClass('loader--white');
		});
	});

	describe('layout', () => {
		it('should not add layout class for inline (default)', () => {
			render(<Loader />);

			expect(screen.getByRole('status')).not.toHaveClass('loader--centered');
			expect(screen.getByRole('status')).not.toHaveClass('loader--fullscreen');
		});

		it('should apply centered layout class', () => {
			render(<Loader layout="centered" />);

			expect(screen.getByRole('status')).toHaveClass('loader--centered');
		});

		it('should apply fullscreen layout class', () => {
			render(<Loader layout="fullscreen" />);

			expect(screen.getByRole('status')).toHaveClass('loader--fullscreen');
		});
	});

	describe('additional props', () => {
		it('should apply custom className', () => {
			render(<Loader className="custom-class" />);

			expect(screen.getByRole('status')).toHaveClass('custom-class');
		});

		it('should apply custom ariaLabel', () => {
			render(<Loader ariaLabel="Fetching results" />);

			expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Fetching results');
		});

		it('should apply id attribute', () => {
			render(<Loader id="my-loader" />);

			expect(screen.getByRole('status')).toHaveAttribute('id', 'my-loader');
		});
	});
});
