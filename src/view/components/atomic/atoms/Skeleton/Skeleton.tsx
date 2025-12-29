import React from 'react';
import clsx from 'clsx';

export type SkeletonVariant =
	| 'text'
	| 'title'
	| 'avatar'
	| 'button'
	| 'card'
	| 'header';

export interface SkeletonProps {
	variant?: SkeletonVariant;
	width?: string | number;
	height?: string | number;
	className?: string;
	style?: React.CSSProperties;
}

const Skeleton: React.FC<SkeletonProps> = ({
	variant = 'text',
	width,
	height,
	className,
	style,
}) => {
	const classes = clsx('skeleton', `skeleton--${variant}`, className);

	const customStyle: React.CSSProperties = {
		...style,
		...(width && { width: typeof width === 'number' ? `${width}px` : width }),
		...(height && {
			height: typeof height === 'number' ? `${height}px` : height,
		}),
	};

	return <div className={classes} style={customStyle} aria-hidden="true" />;
};

export default Skeleton;
