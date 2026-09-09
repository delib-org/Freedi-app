import React, { ReactNode, useId, useState } from 'react';
import { ArrowUpRight, ChevronDown, Home, Lightbulb, Menu, Plus, Sprout, X } from 'lucide-react';
import styles from './ThinkingSpace.module.scss';

export interface SpaceLink {
	id: string;
	title: string;
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
	tools?: ReactNode;
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
	tools,
	t,
	dir = 'ltr',
}: ThinkingSpaceProps) {
	const [navigationOpen, setNavigationOpen] = useState(false);
	const [ideasOpen, setIdeasOpen] = useState(false);
	const navId = useId();
	const asideId = useId();
	const closeAnd = (action: () => void): void => {
		action();
		setNavigationOpen(false);
	};

	return (
		<div className={`thinking-space ${styles.space}`} dir={dir}>
			<a className={styles.space__skip} href="#thinking-content">
				{t('Skip to conversation')}
			</a>
			<div className={styles.space__mobileBar}>
				<button
					onClick={() => setNavigationOpen(!navigationOpen)}
					aria-expanded={navigationOpen}
					aria-controls={navId}
					aria-label={t('Your spaces')}
				>
					<Menu size={21} />
				</button>
				<button className={styles.space__brand} onClick={onHome}>
					<Sprout size={25} /> Freedi<span> / {t('together')}</span>
				</button>
				{aside ? (
					<button
						onClick={() => setIdeasOpen(!ideasOpen)}
						aria-expanded={ideasOpen}
						aria-controls={asideId}
						aria-label={t('Taking shape')}
					>
						<Lightbulb size={21} />
					</button>
				) : (
					<button onClick={onCreate} aria-label={t('Start with a question.')}>
						<Plus size={21} />
					</button>
				)}
			</div>
			<nav
				id={navId}
				className={`${styles.space__sidebar} ${navigationOpen ? styles['space__sidebar--open'] : ''}`}
				aria-label={t('Your spaces')}
			>
				<button className={styles.space__brand} onClick={() => closeAnd(onHome)}>
					<span className={styles.space__brandMark}>
						<Sprout size={27} />
					</span>
					Freedi<span className={styles.space__brandDot}>.</span>
				</button>
				<p className={styles.space__tagline}>{t('Good things start with us.')}</p>
				<button
					className={`${styles.space__navItem} ${!activeId ? styles['space__navItem--active'] : ''}`}
					aria-current={!activeId ? 'page' : undefined}
					onClick={() => closeAnd(onHome)}
				>
					<Home size={19} />
					{t('Your conversations')}
				</button>
				<div className={styles.space__sectionLabel}>
					<span>{t('YOUR SPACES')}</span>
					<button onClick={() => closeAnd(onCreate)} aria-label={t('Start with a question.')}>
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
							onClick={() => closeAnd(() => onOpen(space.id))}
						>
							<span className={styles.space__spaceIcon} data-tone={index % 3}>
								{space.title.charAt(0).toUpperCase()}
							</span>
							<span className={styles.space__linkText}>{space.title}</span>
						</button>
					))}
					{spaces.length === 0 && (
						<p className={styles.space__empty}>{t('Your shared spaces will live here.')}</p>
					)}
				</div>
				<button className={styles.space__create} onClick={() => closeAnd(onCreate)}>
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
				<button className={styles.space__profile} onClick={() => closeAnd(onProfile)}>
					<span className={styles.space__avatar}>{userName.slice(0, 1).toUpperCase() || '?'}</span>
					<span>
						<strong>{userName || t('Your profile')}</strong>
						<small>{t('Your corner of Freedi')}</small>
					</span>
					<ArrowUpRight size={17} />
				</button>
			</nav>
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
							>
								<Lightbulb size={18} />
								{t('Taking shape')}
								<ChevronDown size={16} />
							</button>
							<aside
								onClick={(event) => {
									if ((event.target as Element).closest('button')) setIdeasOpen(false);
								}}
								id={asideId}
								className={`${styles.space__aside} ${ideasOpen ? styles['space__aside--open'] : ''}`}
								aria-label={t('Taking shape')}
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
		</div>
	);
}
