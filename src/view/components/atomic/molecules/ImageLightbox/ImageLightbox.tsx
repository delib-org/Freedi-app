import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { useDialogBehaviour } from '../Modal';
import { useImageZoom } from './useImageZoom';
import { isResting } from './imageZoomMath';

/**
 * ImageLightbox Molecule - Atomic Design System
 *
 * A picture opened to the full screen, where it can be zoomed and panned.
 * Zooming out from the fitted size — a pinch, a scroll, the minus button —
 * closes it, as do Escape, the close button and a tap beside the picture.
 *
 * All styling is in src/view/style/molecules/_image-lightbox.scss
 */

export interface ImageLightboxProps {
	/** Whether the viewer is open */
	isOpen: boolean;

	/** Close handler */
	onClose: () => void;

	/** Image URL */
	src: string;

	/** Alternative text; also names the dialog */
	alt: string;

	/** Translated labels for the controls */
	closeLabel: string;
	zoomInLabel: string;
	zoomOutLabel: string;

	/** Additional CSS classes */
	className?: string;
}

type ViewProps = Omit<ImageLightboxProps, 'isOpen'>;

// Mounted only while open, so every opening starts from the fitted picture and
// the gesture listeners always find their elements.
const ImageLightboxView: React.FC<ViewProps> = ({
	onClose,
	src,
	alt,
	closeLabel,
	zoomInLabel,
	zoomOutLabel,
	className,
}) => {
	const panelRef = useRef<HTMLDivElement>(null);
	const {
		stageRef,
		imageRef,
		transform,
		isGesturing,
		canZoomIn,
		zoomIn,
		zoomOut,
		reset,
		stageHandlers,
	} = useImageZoom({ onClose });

	useDialogBehaviour({ isOpen: true, onClose, panelRef, trapFocus: true });

	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === '+' || event.key === '=') {
			zoomIn();
		} else if (event.key === '-' || event.key === '_') {
			zoomOut();
		} else if (event.key === '0') {
			reset();
		}
	};

	// The viewer is portalled to <body>, but React bubbles its events to the
	// component that opened it; they are the viewer's alone.
	const stopPropagation = (event: React.SyntheticEvent) => event.stopPropagation();

	const classes = clsx(
		'image-lightbox',
		!isResting(transform) && 'image-lightbox--zoomed',
		isGesturing && 'image-lightbox--gesturing',
		className,
	);

	// The transform changes on every pointer move, so it reaches the stylesheet
	// as custom properties; the stylesheet owns the transform itself.
	const imageStyle = {
		'--image-lightbox-x': `${transform.x}px`,
		'--image-lightbox-y': `${transform.y}px`,
		'--image-lightbox-scale': transform.scale,
	} as React.CSSProperties;

	return (
		<div
			className={classes}
			role="dialog"
			aria-modal="true"
			aria-label={alt}
			ref={panelRef}
			tabIndex={-1}
			onKeyDown={handleKeyDown}
			onClick={stopPropagation}
			onPointerDown={stopPropagation}
			onContextMenu={stopPropagation}
		>
			<div className="image-lightbox__stage" ref={stageRef} {...stageHandlers}>
				<img
					className="image-lightbox__image"
					ref={imageRef}
					src={src}
					alt={alt}
					draggable={false}
					style={imageStyle}
				/>
			</div>

			<div className="image-lightbox__controls">
				<button
					type="button"
					className="image-lightbox__button"
					onClick={zoomOut}
					aria-label={zoomOutLabel}
					title={zoomOutLabel}
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
				</button>
				<button
					type="button"
					className="image-lightbox__button"
					onClick={zoomIn}
					disabled={!canZoomIn}
					aria-label={zoomInLabel}
					title={zoomInLabel}
				>
					<svg
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						aria-hidden="true"
					>
						<line x1="12" y1="5" x2="12" y2="19" />
						<line x1="5" y1="12" x2="19" y2="12" />
					</svg>
				</button>
			</div>

			<button
				type="button"
				className="image-lightbox__button image-lightbox__button--close"
				onClick={onClose}
				aria-label={closeLabel}
				title={closeLabel}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					aria-hidden="true"
				>
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	);
};

const ImageLightbox: React.FC<ImageLightboxProps> = ({ isOpen, ...viewProps }) => {
	if (!isOpen) {
		return null;
	}

	return createPortal(<ImageLightboxView {...viewProps} />, document.body);
};

export default ImageLightbox;
