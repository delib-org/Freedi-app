import React from 'react';
import clsx from 'clsx';

/**
 * Loader Atom - Atomic Design System
 *
 * A minimal React wrapper around BEM-styled loader classes.
 * All styling is handled by SCSS in src/view/style/atoms/_loader.scss
 */

// ============================================================================
// TYPES
// ============================================================================

export type LoaderSize = 'small' | 'medium' | 'large';
export type LoaderVariant = 'default' | 'primary' | 'white';
export type LoaderLayout = 'inline' | 'centered' | 'fullscreen';

export interface LoaderProps {
	/** Size of the spinner */
	size?: LoaderSize;

	/** Color variant */
	variant?: LoaderVariant;

	/** Layout mode */
	layout?: LoaderLayout;

	/** Optional text below the spinner */
	text?: string;

	/** Additional CSS classes */
	className?: string;

	/** ARIA label for accessibility */
	ariaLabel?: string;

	/** HTML id attribute */
	id?: string;
}

// ============================================================================
// COMPONENT
// ============================================================================

const Loader: React.FC<LoaderProps> = ({
	size = 'medium',
	variant = 'default',
	layout = 'inline',
	text,
	className,
	ariaLabel = 'Loading',
	id,
}) => {
	// Build BEM classes
	const loaderClasses = clsx(
		'loader', // Block
		size !== 'medium' && `loader--${size}`, // Modifier: size
		variant !== 'default' && `loader--${variant}`, // Modifier: variant
		layout !== 'inline' && `loader--${layout}`, // Modifier: layout
		className, // Additional classes
	);

	return (
		<div id={id} className={loaderClasses} role="status" aria-label={ariaLabel} aria-busy="true">
			<span className="loader__spinner" aria-hidden="true" />
			{text && <span className="loader__text">{text}</span>}
		</div>
	);
};

export default Loader;
