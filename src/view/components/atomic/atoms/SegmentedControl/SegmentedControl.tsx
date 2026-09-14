import { FC, useEffect, useRef, KeyboardEvent } from 'react';
import clsx from 'clsx';
import UnreadBadge from '@/view/components/unreadBadge/UnreadBadge';
import { useTranslation } from '@/controllers/hooks/useTranslation';

export interface Segment {
	id: string;
	label: string;
	count?: number;
	unreadCount?: number;
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
	const { t } = useTranslation();
	const tablistRef = useRef<HTMLDivElement>(null);

	// On narrow screens the control becomes a horizontal scroller with a hidden
	// scrollbar, and a scroller's resting position clips one end — in RTL, the
	// start. Keep the selected tab in view so the clipped end is never the one
	// you are looking at.
	useEffect(() => {
		const list = tablistRef.current;
		if (!list) return;
		const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
		if (!active) return;
		active.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
	}, [activeId, segments.length]);

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
						<UnreadBadge
							count={segment.unreadCount ?? 0}
							ariaLabel={`${segment.unreadCount ?? 0} ${t('unread')}`}
						/>
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
