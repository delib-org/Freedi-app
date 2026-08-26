import {
	useCallback,
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type ReactNode,
	type FC,
} from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import { LanguagesEnum } from '@freedi/shared-i18n';
import { useTranslation } from '@freedi/shared-i18n/react';
import { useAuth } from '@/auth/AuthContext';
import { useOrg } from '@/org/OrgContext';
import { OrgSwitcher } from '@/components/atomic/molecules/OrgSwitcher';
import { logError } from '@/utils/logError';
import { useMediaQuery, MEDIA_MOBILE, MEDIA_TABLET_AND_BELOW } from './useMediaQuery';

/**
 * AppShell Organism — top bar + side navigation + content column.
 * Styles: styles/organisms/_app-shell.scss (.app-shell)
 *
 * ≤1024px the sidebar collapses to an icon rail (`--rail`, toggleable);
 * ≤600px it becomes a bottom tab bar (`--no-sidebar`). Org and user come
 * from OrgContext / AuthContext; pages only pass their nav and breadcrumb.
 */
export interface AppShellNavItem {
	id: string;
	label: string;
	to: string;
	icon: ReactNode;
	/** `end` matching for NavLink (default: true for "/" style roots). */
	end?: boolean;
}

export interface AppShellProps {
	nav: AppShellNavItem[];
	breadcrumb?: ReactNode;
	children: ReactNode;
	/** Org accent hue index — reserved; v1 orgs have none, so the default accent is used. */
	accentIndex?: number;
	/** Where the org switcher navigates (default `/orgs/:id`). */
	onOrgChange?: (organizationId: string) => void;
	/** Where "New organization" goes (default `/orgs/new`). */
	onCreateOrg?: () => void;
	className?: string;
}

/** Short code shown in the language-pill badge. */
const LANGUAGE_CODES: Partial<Record<LanguagesEnum, string>> = {
	[LanguagesEnum.en]: 'EN',
	[LanguagesEnum.he]: 'עב',
};

/** Reserved for org branding — maps an accent index to a platform hue. */
const ACCENT_HUES: readonly string[] = [
	'var(--btn-primary)',
	'var(--group)',
	'var(--question)',
	'var(--result)',
];

function initialsOf(name: string | null | undefined, email: string | null | undefined): string {
	const source = name?.trim() || email?.split('@')[0] || '';
	const parts = source.split(/\s+/).filter(Boolean);
	if (parts.length === 0) return '?';
	if (parts.length === 1) return parts[0].slice(0, 2);

	return `${parts[0][0]}${parts[parts.length - 1][0]}`;
}

const AppShell: FC<AppShellProps> = ({
	nav,
	breadcrumb,
	children,
	accentIndex,
	onOrgChange,
	onCreateOrg,
	className,
}) => {
	const { t, currentLanguage, changeLanguage } = useTranslation();
	const { user, signOut } = useAuth();
	const { orgs, currentOrgId, memberships, isSystemAdmin } = useOrg();
	const navigate = useNavigate();

	const isMobile = useMediaQuery(MEDIA_MOBILE);
	const isTabletAndBelow = useMediaQuery(MEDIA_TABLET_AND_BELOW);
	const [railOverride, setRailOverride] = useState<boolean | null>(null);
	const isRail = railOverride ?? isTabletAndBelow;

	const [menuOpen, setMenuOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);
	const menuButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!menuOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				setMenuOpen(false);
				menuButtonRef.current?.focus();
			}
		};
		document.addEventListener('pointerdown', handlePointerDown);
		document.addEventListener('keydown', handleKeyDown);

		return () => {
			document.removeEventListener('pointerdown', handlePointerDown);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [menuOpen]);

	const handleSignOut = useCallback(async () => {
		try {
			await signOut();
		} catch (error) {
			logError(error, { operation: 'AppShell.signOut', userId: user?.uid });
		}
	}, [signOut, user?.uid]);

	const nextLanguage = currentLanguage === LanguagesEnum.he ? LanguagesEnum.en : LanguagesEnum.he;
	const roles = Object.fromEntries(memberships.map((m) => [m.organizationId, m.role]));

	const style: CSSProperties | undefined =
		accentIndex !== undefined
			? ({ '--org-accent': ACCENT_HUES[accentIndex % ACCENT_HUES.length] } as CSSProperties)
			: undefined;

	const shellClasses = clsx(
		'app-shell',
		isMobile ? 'app-shell--no-sidebar' : isRail && 'app-shell--rail',
		className,
	);

	return (
		<div className={shellClasses} style={style}>
			<a href="#main-content" className="app-shell__skip-link">
				{t('Skip to content')}
			</a>

			<header className="app-shell__topbar">
				<Link to="/" className="app-shell__brand">
					WizCol <span className="app-shell__brand-accent">Studio</span>
				</Link>

				<div className="app-shell__org">
					<OrgSwitcher
						orgs={orgs}
						currentOrgId={currentOrgId}
						roles={roles}
						canCreate={isSystemAdmin}
						onChange={(id) => (onOrgChange ? onOrgChange(id) : navigate(`/orgs/${id}`))}
						onCreate={() => (onCreateOrg ? onCreateOrg() : navigate('/orgs/new'))}
					/>
				</div>

				{breadcrumb && <div className="app-shell__breadcrumb">{breadcrumb}</div>}

				<div className="app-shell__user" ref={menuRef}>
					<button
						type="button"
						ref={menuButtonRef}
						className="app-shell__user-button"
						aria-haspopup="menu"
						aria-expanded={menuOpen}
						aria-label={t('Account menu')}
						onClick={() => setMenuOpen((v) => !v)}
					>
						<span className="profile-avatar profile-avatar--medium app-shell__avatar">
							{user?.photoURL ? (
								<img className="profile-avatar__image" src={user.photoURL} alt="" />
							) : (
								<span className="profile-avatar__initials">
									{initialsOf(user?.displayName, user?.email)}
								</span>
							)}
						</span>
					</button>

					{menuOpen && (
						<div className="app-shell__user-menu" role="menu" aria-label={t('Account menu')}>
							<div className="app-shell__user-identity">
								<span className="app-shell__user-name">{user?.displayName}</span>
								{user?.email && (
									<span className="app-shell__user-email" dir="ltr">
										{user.email}
									</span>
								)}
							</div>
							<button
								type="button"
								role="menuitem"
								className="app-shell__menu-item"
								onClick={() => changeLanguage(nextLanguage)}
							>
								<span className="language-pill app-shell__language" aria-hidden="true">
									<span className="language-pill__icon">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
											<circle cx="12" cy="12" r="9" />
											<path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
										</svg>
									</span>
									<span className="language-pill__code">
										{LANGUAGE_CODES[currentLanguage] ?? currentLanguage.toUpperCase()}
									</span>
								</span>
								{t('Switch language')}
							</button>
							<button
								type="button"
								role="menuitem"
								className="app-shell__menu-item"
								onClick={handleSignOut}
							>
								{t('Sign out')}
							</button>
						</div>
					)}
				</div>
			</header>

			<aside className="app-shell__sidebar">
				<nav className="app-shell__nav" aria-label={t('Main navigation')}>
					{nav.map((item) => (
						<NavLink
							key={item.id}
							to={item.to}
							end={item.end}
							className={({ isActive }) =>
								clsx('app-shell__nav-item', isActive && 'app-shell__nav-item--active')
							}
							title={isRail ? item.label : undefined}
						>
							<span className="app-shell__nav-icon" aria-hidden="true">
								{item.icon}
							</span>
							<span className="app-shell__nav-label">{item.label}</span>
						</NavLink>
					))}
				</nav>

				{!isMobile && (
					<button
						type="button"
						className="app-shell__toggle"
						aria-label={isRail ? t('Expand navigation') : t('Collapse navigation')}
						aria-expanded={!isRail}
						onClick={() => setRailOverride(!isRail)}
					>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							aria-hidden="true"
						>
							<polyline points={isRail ? '9 6 15 12 9 18' : '15 6 9 12 15 18'} />
						</svg>
					</button>
				)}
			</aside>

			<main id="main-content" className="app-shell__main" tabIndex={-1}>
				{children}
			</main>
		</div>
	);
};

export default AppShell;
