import React from 'react';
import clsx from 'clsx';

export interface ProgressStatGridProps {
	tight?: boolean;
	className?: string;
	children: React.ReactNode;
}

const ProgressStatGrid: React.FC<ProgressStatGridProps> = ({
	tight = false,
	className,
	children,
}) => (
	<div className={clsx('progress-stat-grid', tight && 'progress-stat-grid--tight', className)}>
		{children}
	</div>
);

export default ProgressStatGrid;
