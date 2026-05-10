import React from 'react';
import clsx from 'clsx';

export type SectionDividerVariant = 'default' | 'synthesis' | 'topic' | 'semantic';

export interface SectionDividerProps {
	label: string;
	count?: number;
	icon?: React.ReactNode;
	variant?: SectionDividerVariant;
	className?: string;
}

const SectionDivider: React.FC<SectionDividerProps> = ({
	label,
	count,
	icon,
	variant = 'default',
	className,
}) => {
	const classes = clsx(
		'section-divider',
		variant !== 'default' && `section-divider--${variant}`,
		className,
	);

	return (
		<div className={classes} role="separator" aria-label={label}>
			<hr className="section-divider__rule" aria-hidden />
			<span className="section-divider__label">
				{icon}
				<span>{label}</span>
				{typeof count === 'number' && <span className="section-divider__count">({count})</span>}
			</span>
			<hr className="section-divider__rule" aria-hidden />
		</div>
	);
};

export default SectionDivider;
