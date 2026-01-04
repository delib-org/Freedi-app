/**
 * Tests for Skeleton atomic component
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import Skeleton from '../Skeleton';

describe('Skeleton', () => {
	describe('rendering', () => {
		it('should render a div element', () => {
			const { container } = render(<Skeleton />);

			expect(container.querySelector('div')).toBeInTheDocument();
		});

		it('should have skeleton class', () => {
			const { container } = render(<Skeleton />);

			expect(container.querySelector('.skeleton')).toBeInTheDocument();
		});

		it('should be hidden from screen readers', () => {
			const { container } = render(<Skeleton />);

			expect(container.querySelector('div')).toHaveAttribute('aria-hidden', 'true');
		});
	});

	describe('variants', () => {
		it('should apply text variant by default', () => {
			const { container } = render(<Skeleton />);

			expect(container.querySelector('.skeleton--text')).toBeInTheDocument();
		});

		it('should apply text variant when specified', () => {
			const { container } = render(<Skeleton variant="text" />);

			expect(container.querySelector('.skeleton--text')).toBeInTheDocument();
		});

		it('should apply title variant', () => {
			const { container } = render(<Skeleton variant="title" />);

			expect(container.querySelector('.skeleton--title')).toBeInTheDocument();
		});

		it('should apply avatar variant', () => {
			const { container } = render(<Skeleton variant="avatar" />);

			expect(container.querySelector('.skeleton--avatar')).toBeInTheDocument();
		});

		it('should apply button variant', () => {
			const { container } = render(<Skeleton variant="button" />);

			expect(container.querySelector('.skeleton--button')).toBeInTheDocument();
		});

		it('should apply card variant', () => {
			const { container } = render(<Skeleton variant="card" />);

			expect(container.querySelector('.skeleton--card')).toBeInTheDocument();
		});

		it('should apply header variant', () => {
			const { container } = render(<Skeleton variant="header" />);

			expect(container.querySelector('.skeleton--header')).toBeInTheDocument();
		});
	});

	describe('dimensions', () => {
		describe('width', () => {
			it('should apply width as pixels when number is provided', () => {
				const { container } = render(<Skeleton width={100} />);

				expect(container.querySelector('.skeleton')).toHaveStyle({ width: '100px' });
			});

			it('should apply width as-is when string is provided', () => {
				const { container } = render(<Skeleton width="50%" />);

				expect(container.querySelector('.skeleton')).toHaveStyle({ width: '50%' });
			});

			it('should not set width when not provided', () => {
				const { container } = render(<Skeleton />);

				// Style should not contain width (or it's undefined)
				const skeleton = container.querySelector('.skeleton');
				expect(skeleton?.getAttribute('style') || '').not.toContain('width');
			});

			it('should handle rem units', () => {
				const { container } = render(<Skeleton width="10rem" />);

				expect(container.querySelector('.skeleton')).toHaveStyle({ width: '10rem' });
			});

			it('should handle em units', () => {
				const { container } = render(<Skeleton width="5em" />);

				expect(container.querySelector('.skeleton')).toHaveStyle({ width: '5em' });
			});
		});

		describe('height', () => {
			it('should apply height as pixels when number is provided', () => {
				const { container } = render(<Skeleton height={50} />);

				expect(container.querySelector('.skeleton')).toHaveStyle({ height: '50px' });
			});

			it('should apply height as-is when string is provided', () => {
				const { container } = render(<Skeleton height="2rem" />);

				expect(container.querySelector('.skeleton')).toHaveStyle({ height: '2rem' });
			});

			it('should not set height when not provided', () => {
				const { container } = render(<Skeleton />);

				const skeleton = container.querySelector('.skeleton');
				expect(skeleton?.getAttribute('style') || '').not.toContain('height');
			});

			it('should handle percentage height', () => {
				const { container } = render(<Skeleton height="100%" />);

				expect(container.querySelector('.skeleton')).toHaveStyle({ height: '100%' });
			});
		});

		describe('combined dimensions', () => {
			it('should apply both width and height', () => {
				const { container } = render(<Skeleton width={200} height={100} />);

				const skeleton = container.querySelector('.skeleton');
				expect(skeleton).toHaveStyle({ width: '200px', height: '100px' });
			});

			it('should handle mixed units for width and height', () => {
				const { container } = render(<Skeleton width="100%" height={50} />);

				const skeleton = container.querySelector('.skeleton');
				expect(skeleton).toHaveStyle({ width: '100%', height: '50px' });
			});
		});
	});

	describe('custom className', () => {
		it('should apply custom className', () => {
			const { container } = render(<Skeleton className="custom-skeleton" />);

			expect(container.querySelector('.custom-skeleton')).toBeInTheDocument();
		});

		it('should preserve skeleton class with custom className', () => {
			const { container } = render(<Skeleton className="custom-skeleton" />);

			const skeleton = container.querySelector('.skeleton');
			expect(skeleton).toHaveClass('skeleton');
			expect(skeleton).toHaveClass('custom-skeleton');
		});

		it('should preserve variant class with custom className', () => {
			const { container } = render(<Skeleton variant="avatar" className="my-avatar" />);

			const skeleton = container.querySelector('.skeleton');
			expect(skeleton).toHaveClass('skeleton');
			expect(skeleton).toHaveClass('skeleton--avatar');
			expect(skeleton).toHaveClass('my-avatar');
		});
	});

	describe('custom style', () => {
		it('should apply custom style object', () => {
			const { container } = render(
				<Skeleton style={{ backgroundColor: 'red', borderRadius: '8px' }} />
			);

			const skeleton = container.querySelector('.skeleton');
			expect(skeleton).toHaveStyle({ backgroundColor: 'red', borderRadius: '8px' });
		});

		it('should merge custom style with dimension styles', () => {
			const { container } = render(
				<Skeleton width={100} height={50} style={{ backgroundColor: 'blue' }} />
			);

			const skeleton = container.querySelector('.skeleton');
			expect(skeleton).toHaveStyle({
				width: '100px',
				height: '50px',
				backgroundColor: 'blue',
			});
		});

		it('should allow dimension props to override style dimensions', () => {
			const { container } = render(
				<Skeleton width={200} style={{ width: '100px' }} />
			);

			// Width prop should take precedence (it's applied after style spread)
			const skeleton = container.querySelector('.skeleton');
			expect(skeleton).toHaveStyle({ width: '200px' });
		});
	});

	describe('edge cases', () => {
		it('should handle zero width', () => {
			const { container } = render(<Skeleton width={0} />);

			expect(container.querySelector('.skeleton')).toHaveStyle({ width: '0px' });
		});

		it('should handle zero height', () => {
			const { container } = render(<Skeleton height={0} />);

			expect(container.querySelector('.skeleton')).toHaveStyle({ height: '0px' });
		});

		it('should handle empty string width', () => {
			const { container } = render(<Skeleton width="" />);

			// Empty string is falsy, so width should not be applied
			const skeleton = container.querySelector('.skeleton');
			expect(skeleton?.getAttribute('style') || '').not.toContain('width');
		});

		it('should handle very large dimensions', () => {
			const { container } = render(<Skeleton width={10000} height={5000} />);

			const skeleton = container.querySelector('.skeleton');
			expect(skeleton).toHaveStyle({ width: '10000px', height: '5000px' });
		});
	});

	describe('accessibility', () => {
		it('should have aria-hidden to hide from assistive technologies', () => {
			const { container } = render(<Skeleton />);

			expect(container.querySelector('.skeleton')).toHaveAttribute('aria-hidden', 'true');
		});

		it('should not be focusable', () => {
			const { container } = render(<Skeleton />);

			const skeleton = container.querySelector('.skeleton');
			expect(skeleton).not.toHaveAttribute('tabindex');
		});
	});
});
