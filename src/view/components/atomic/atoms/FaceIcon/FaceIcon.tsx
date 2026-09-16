import React from 'react';
import type { FaceKind } from '@/types/evaluation';

/**
 * FaceIcon Atom - Atomic Design System
 *
 * One face of the rating scale, drawn inline so it takes `currentColor` and
 * needs no asset request. Same head and eyes for every face; only the mouth
 * changes. The strongest "like" has a filled open smile.
 */

interface MouthShape {
	d: string;
	filled: boolean;
}

export const FACE_MOUTHS: Record<FaceKind, MouthShape> = {
	'strong-dislike': { d: 'M7.5 16.5c1.2-2 2.7-3 4.5-3s3.3 1 4.5 3', filled: false },
	dislike: { d: 'M8 15.5c1.3-1 2.6-1.5 4-1.5s2.7.5 4 1.5', filled: false },
	neutral: { d: 'M8 15h8', filled: false },
	like: { d: 'M8 14c1.3 1 2.6 1.5 4 1.5s2.7-.5 4-1.5', filled: false },
	'strong-like': { d: 'M7.5 13.5c1 2.5 2.5 3.8 4.5 3.8s3.5-1.3 4.5-3.8z', filled: true },
};

const DEFAULT_SIZE = 26;

export interface FaceIconProps {
	face: FaceKind;
	/** Rendered width and height in px. */
	size?: number;
	/** Accessible name. Omit when a parent (e.g. the button) already names it. */
	title?: string;
	className?: string;
}

const FaceIcon: React.FC<FaceIconProps> = ({ face, size = DEFAULT_SIZE, title, className }) => {
	const mouth = FACE_MOUTHS[face];

	return (
		<svg
			className={className}
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.8}
			strokeLinecap="round"
			role={title ? 'img' : undefined}
			aria-hidden={title ? undefined : true}
			aria-label={title}
			focusable="false"
			data-face={face}
		>
			<circle cx="12" cy="12" r="10" />
			<circle cx="8.5" cy="10" r="1.3" fill="currentColor" stroke="none" />
			<circle cx="15.5" cy="10" r="1.3" fill="currentColor" stroke="none" />
			<path d={mouth.d} fill={mouth.filled ? 'currentColor' : 'none'} />
		</svg>
	);
};

export default FaceIcon;
