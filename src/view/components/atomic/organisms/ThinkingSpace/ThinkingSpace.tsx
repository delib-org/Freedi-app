import React, { ReactNode, useId, useState } from 'react';
import { ArrowUpRight, ChevronDown, Home, Lightbulb, Plus, X } from 'lucide-react';
import styles from './ThinkingSpace.module.scss';
import UnreadBadge from '@/view/components/unreadBadge/UnreadBadge';
import { useSidebarWidth } from '@/controllers/hooks/useSidebarWidth';

export interface SpaceLink {
	id: string;
	title: string;
	unreadCount?: number;
}
export type Translate = (text: string) => string;
interface ThinkingSpaceProps {
	children: ReactNode;
	spaces: SpaceLink[];
	activeId?: string;
	userName: string;
	onHome: () => void;
	onProfile: () => void;
	onOpen: (id: string) => void;
	onCreate: () => void;
	aside?: ReactNode;
	asideLabel?: string;
	tools?: ReactNode;
	/** Floating bottom navigation for phones (< 1024px); the sidebar leads on desktop. */
	bottomNav?: ReactNode;
	/** Level-transition classes for the incoming screen (see pageAnimation.scss). */
	transitionClassName?: string;
	t: Translate;
	dir?: 'ltr' | 'rtl';
}

export default function ThinkingSpace({
	children,
	spaces,
	activeId,
	userName,
	onHome,
	onProfile,
	onOpen,
	onCreate,
	aside,
	asideLabel,
	tools,
	bottomNav,
	transitionClassName,
	t,
	dir = 'ltr',
}: ThinkingSpaceProps) {
	const [ideasOpen, setIdeasOpen] = useState(false);
	const asideId = useId();
	const resolvedAsideLabel = asideLabel || t('Taking shape');
	const { width: sidebarWidth, isResizing, separatorProps } = useSidebarWidth(dir);
	const rootClassName = [
		'thinking-space',
		styles.space,
		bottomNav ? styles['space--withNav'] : '',
		isResizing ? styles['space--resizing'] : '',
		transitionClassName ?? '',
	]
		.filter(Boolean)
		.join(' ');
	// The rail's width lives on the shell so the separator and the rail agree.
	const rootStyle = { '--space-sidebar-width': `${sidebarWidth}px` } as React.CSSProperties;

	return (
		<div className={rootClassName} dir={dir} style={rootStyle}>
			<a className={styles.space__skip} href="#thinking-content">
				{t('Skip to conversation')}
			</a>
			<nav className={styles.space__sidebar} aria-label={t('Your spaces')}>
				<button className={styles.space__brand} onClick={onHome} aria-label="WizCol">
					<img src="/brand/wizcol-logo-app.webp" alt="" width="360" height="240" />
				</button>
				<p className={styles.space__tagline}>{t('Good things start with us.')}</p>
				<button
					className={`${styles.space__navItem} ${!activeId ? styles['space__navItem--active'] : ''}`}
					aria-current={!activeId ? 'page' : undefined}
					onClick={onHome}
				>
					<Home size={19} />
					{t('Your conversations')}
				</button>
				<div className={styles.space__sectionLabel}>
					<span>{t('YOUR SPACES')}</span>
					<button onClick={onCreate} aria-label={t('Start with a question.')}>
						<Plus size={17} />
					</button>
				</div>
				<div className={styles.space__links}>
					{spaces.map((space, index) => (
						<button
							key={space.id}
							title={space.title}
							className={`${styles.space__navItem} ${space.id === activeId ? styles['space__navItem--active'] : ''}`}
							aria-current={space.id === activeId ? 'page' : undefined}
							onClick={() => onOpen(space.id)}
						>
							<span className={styles.space__spaceIcon} data-tone={index % 3}>
								{space.title.charAt(0).toUpperCase()}
							</span>
							<span className={styles.space__linkText}>{space.title}</span>
							<UnreadBadge
								count={space.unreadCount ?? 0}
								maxDisplay={99}
								ariaLabel={`${space.unreadCount ?? 0} ${t('unread')}`}
							/>
						</button>
					))}
					{spaces.length === 0 && (
						<p className={styles.space__empty}>{t('Your shared spaces will live here.')}</p>
					)}
				</div>
				<button className={styles.space__create} onClick={onCreate}>
					<Plus size={18} />
					{t('Start with a question.')}
				</button>
				<div className={styles.space__note}>
					<span className={styles.space__noteFlower} aria-hidden="true">
						✳
					</span>
					<strong>
						{t('A little curiosity.')}
						<br />
						{t('A better possibility.')}
					</strong>
					<p>{t('Make room for a different point of view.')}</p>
				</div>
				<button className={styles.space__profile} onClick={onProfile}>
					<span className={styles.space__avatar}>{userName.slice(0, 1).toUpperCase() || '?'}</span>
					<span>
						<strong>{userName || t('Your profile')}</strong>
						<small>WizCol</small>
					</span>
					<ArrowUpRight size={17} />
				</button>
			</nav>
			<div
				{...separatorProps}
				className={`${styles.space__resizer} ${isResizing ? styles['space__resizer--active'] : ''}`}
				aria-label={t('Resize sidebar')}
				title={t('Resize sidebar')}
				data-testid="thinking-space-resizer"
			/>
			<div className={styles.space__workspace}>
				{tools && <div className={styles.space__tools}>{tools}</div>}
				<div className={styles.space__columns}>
					<div id="thinking-content" tabIndex={-1} className={styles.space__content}>
						{children}
					</div>
					{aside && (
						<>
							<button
								className={styles.space__boardToggle}
								onClick={() => setIdeasOpen(!ideasOpen)}
								aria-expanded={ideasOpen}
								aria-controls={asideId}
								aria-label={resolvedAsideLabel}
								data-testid="thinking-space-aside-toggle"
							>
								<Lightbulb size={18} aria-hidden="true" />
								<span className={styles.space__boardToggleLabel}>{resolvedAsideLabel}</span>
								<ChevronDown size={16} aria-hidden="true" />
							</button>
							<aside
								onClick={(event) => {
									if ((event.target as Element).closest('button')) setIdeasOpen(false);
								}}
								id={asideId}
								className={`${styles.space__aside} ${ideasOpen ? styles['space__aside--open'] : ''}`}
								aria-label={resolvedAsideLabel}
							>
								<button
									className={styles.space__closeBoard}
									onClick={() => setIdeasOpen(false)}
									aria-label={t('Close')}
								>
									<X size={20} />
								</button>
								{aside}
							</aside>
						</>
					)}
				</div>
			</div>
			{bottomNav}
		</div>
	);
}
