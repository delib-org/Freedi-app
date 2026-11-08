import React, { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { House, Inbox, Plus, User } from 'lucide-react';
import { BottomNavItem } from './bottomNavModel';
import styles from './BottomNav.module.scss';

export type Translate = (key: string) => string;

export interface BottomNavProps {
	active: BottomNavItem | null;
	unreadCount: number;
	onNavigate: (item: BottomNavItem) => void;
	onAsk: () => void;
	t: Translate;
}

const ITEMS: { id: BottomNavItem; labelKey: string; icon: ReactNode }[] = [
	{ id: 'home', labelKey: 'Home', icon: <House size={18} aria-hidden="true" /> },
	{ id: 'inbox', labelKey: 'Inbox', icon: <Inbox size={18} aria-hidden="true" /> },
	{ id: 'me', labelKey: 'Me', icon: <User size={18} aria-hidden="true" /> },
];

const MAX_BADGE = 99;

/**
 * Floating bottom navigation for phones and tablets (< 1024px): בית · תיבה ·
 * אני and the violet ask-a-question button. Portalled to the body so level
 * transitions on the page never carry it along; hidden while a sheet or modal
 * holds the screen (body.modal-open) and on desktop, where the sidebar leads.
 */
export default function BottomNav({ active, unreadCount, onNavigate, onAsk, t }: BottomNavProps) {
	if (typeof document === 'undefined') return null;

	return createPortal(
		<div className={styles.bottomNav} data-testid="bottom-nav">
			<nav className={styles.bottomNav__pill} aria-label={t('Main navigation')}>
				{ITEMS.map((item) => {
					const isActive = item.id === active;
					const showBadge = item.id === 'inbox' && unreadCount > 0;

					return (
						<button
							key={item.id}
							type="button"
							className={`${styles.bottomNav__item} ${isActive ? styles['bottomNav__item--active'] : ''}`}
							aria-current={isActive ? 'page' : undefined}
							aria-label={
								showBadge ? `${t(item.labelKey)}: ${unreadCount} ${t('unread')}` : undefined
							}
							onClick={() => onNavigate(item.id)}
							data-testid={`bottom-nav-${item.id}`}
						>
							{item.icon}
							<span>{t(item.labelKey)}</span>
							{showBadge && (
								<span className={styles.bottomNav__badge} aria-hidden="true">
									{unreadCount > MAX_BADGE ? `${MAX_BADGE}+` : unreadCount}
								</span>
							)}
						</button>
					);
				})}
				<button
					type="button"
					className={styles.bottomNav__ask}
					onClick={onAsk}
					aria-label={t('Ask a question')}
					data-testid="bottom-nav-ask"
				>
					<Plus size={22} aria-hidden="true" />
				</button>
			</nav>
		</div>,
		document.body,
	);
}
