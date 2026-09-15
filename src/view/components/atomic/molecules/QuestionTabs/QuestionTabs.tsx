import { FC, KeyboardEvent, useEffect, useRef } from 'react';
import clsx from 'clsx';
import styles from './QuestionTabs.module.scss';

export interface QuestionTabItem {
	id: string;
	label: string;
	count?: number;
	unreadCount?: number;
}

export interface QuestionTabsProps {
	tabs: readonly QuestionTabItem[];
	activeId: string;
	onChange: (id: string) => void;
	/** Accessible name of the tab list. */
	ariaLabel: string;
	/** Reading direction — arrow keys follow the visual order. */
	dir?: 'ltr' | 'rtl';
	/** id of the panel the tabs control, for aria-controls. */
	panelId?: string;
	/** Accessible text for an unread badge, e.g. (n) => `${n} unread`. */
	unreadLabel?: (count: number) => string;
	className?: string;
}

/**
 * QuestionTabs molecule — horizontally scrolling underline tabs for the
 * question header (רקע · דיון · תשובות · שאלות · תוצאות · מפות).
 * WAI-ARIA tabs pattern with automatic activation: roving tabindex, arrow keys
 * in visual order (mirrored in RTL), Home / End.
 */
const QuestionTabs: FC<QuestionTabsProps> = ({
	tabs,
	activeId,
	onChange,
	ariaLabel,
	dir = 'ltr',
	panelId,
	unreadLabel,
	className,
}) => {
	const listRef = useRef<HTMLDivElement>(null);

	// A scroller's resting position clips one end; keep the active tab in view.
	useEffect(() => {
		const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
		active?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
	}, [activeId, tabs.length]);

	const focusTab = (index: number): void => {
		const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
		buttons?.[index]?.focus();
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
		const forward = dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
		const backward = dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft';
		let next: number | null = null;

		if (event.key === forward) next = (index + 1) % tabs.length;
		else if (event.key === backward) next = (index - 1 + tabs.length) % tabs.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = tabs.length - 1;

		if (next === null) return;
		event.preventDefault();
		onChange(tabs[next].id);
		focusTab(next);
	};

	return (
		<div
			ref={listRef}
			role="tablist"
			aria-label={ariaLabel}
			aria-orientation="horizontal"
			className={clsx(styles.tabs, className)}
			data-testid="question-tabs"
		>
			{tabs.map((tab, index) => {
				const selected = tab.id === activeId;

				return (
					<button
						key={tab.id}
						type="button"
						role="tab"
						id={`question-tab-${tab.id}`}
						aria-selected={selected}
						aria-controls={panelId}
						tabIndex={selected ? 0 : -1}
						className={clsx(styles.tabs__tab, selected && styles['tabs__tab--active'])}
						onClick={() => onChange(tab.id)}
						onKeyDown={(event) => handleKeyDown(event, index)}
						data-testid={`question-tab-${tab.id}`}
					>
						<span>{tab.label}</span>
						{typeof tab.count === 'number' && tab.count > 0 && (
							<span className={styles.tabs__count}>{tab.count}</span>
						)}
						{typeof tab.unreadCount === 'number' && tab.unreadCount > 0 && (
							<span
								className={styles.tabs__unread}
								aria-label={unreadLabel ? unreadLabel(tab.unreadCount) : undefined}
							>
								{tab.unreadCount > 99 ? '99+' : tab.unreadCount}
							</span>
						)}
					</button>
				);
			})}
		</div>
	);
};

export default QuestionTabs;
