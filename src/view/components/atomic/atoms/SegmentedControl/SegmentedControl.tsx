import { FC, useRef, KeyboardEvent } from 'react';
import clsx from 'clsx';

export interface Segment {
	id: string;
	label: string;
	count?: number;
}

export interface SegmentedControlProps {
	segments: Segment[];
	activeId: string;
	onChange: (id: string) => void;
	className?: string;
}

const SegmentedControl: FC<SegmentedControlProps> = ({
	segments,
	activeId,
	onChange,
	className,
}) => {
	const tablistRef = useRef<HTMLDivElement>(null);

	const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
		let nextIndex: number | null = null;

		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			nextIndex = (index + 1) % segments.length;
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			nextIndex = (index - 1 + segments.length) % segments.length;
		} else if (e.key === 'Home') {
			e.preventDefault();
			nextIndex = 0;
		} else if (e.key === 'End') {
			e.preventDefault();
			nextIndex = segments.length - 1;
		}

		if (nextIndex !== null) {
			onChange(segments[nextIndex].id);
			const buttons = tablistRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
			buttons?.[nextIndex]?.focus();
		}
	};

	return (
		<div
			ref={tablistRef}
			role="tablist"
			aria-label="View switcher"
			className={clsx('segmented-control', className)}
		>
			{segments.map((segment, index) => {
				const isActive = segment.id === activeId;

				return (
					<button
						key={segment.id}
						role="tab"
						aria-selected={isActive}
						tabIndex={isActive ? 0 : -1}
						className={clsx(
							'segmented-control__segment',
							isActive && 'segmented-control__segment--active',
						)}
						onClick={() => onChange(segment.id)}
						onKeyDown={(e) => handleKeyDown(e, index)}
					>
						{segment.label}
						{segment.count !== undefined && (
							<span className="segmented-control__count">({segment.count})</span>
						)}
					</button>
				);
			})}
		</div>
	);
};

export default SegmentedControl;
