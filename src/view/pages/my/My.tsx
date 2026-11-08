import React, { useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	currentStreakSelector,
	userEngagementSelector,
	userLevelSelector,
} from '@/redux/engagement/engagementSlice';
import { setUserAdvanceUserToDB } from '@/controllers/db/user/setUser';
import { logOut } from '@/controllers/db/authenticationUtils';
import { logError } from '@/utils/errorHandling';
import ChangeLanguage from '@/view/components/changeLanguage/ChangeLanguage';
import AccessibilitySheet from './AccessibilitySheet';
import styles from './Me.module.scss';

/** אני — profile, impact and settings (WizCol slice 6). */
const My = () => {
	const user = useAppSelector(creatorSelector);
	const { user: authUser } = useAuthentication();
	const { t, dir, currentLanguage } = useTranslation();
	const { fontSize, changeFontSize, colorContrast, setColorContrast } = useUserConfig();
	const engagement = useAppSelector(userEngagementSelector);
	const level = useAppSelector(userLevelSelector);
	const streak = useAppSelector(currentStreakSelector);
	const [selectedImage, setSelectedImage] = useState<string | null>(null);
	const [languageOpen, setLanguageOpen] = useState(false);
	const [accessibilityOpen, setAccessibilityOpen] = useState(false);
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const languageButtonRef = useRef<HTMLButtonElement>(null);
	const isAdvancedUser = !!user?.advanceUser;
	const Chevron = dir === 'rtl' ? ChevronLeft : ChevronRight;

	const name = user?.displayName || t('Your profile');
	const photo = selectedImage || user?.photoURL;
	const provider = authUser?.providerData?.[0]?.providerId;
	const providerLine =
		user?.isAnonymous || authUser?.isAnonymous
			? t('Guest')
			: provider === 'google.com'
				? t('Signed in with Google')
				: user?.email || authUser?.email || '';

	function handleImageChange(event: React.ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => setSelectedImage(reader.result as string);
		reader.readAsDataURL(file);
	}

	async function toggleAdvanced() {
		try {
			await setUserAdvanceUserToDB(!isAdvancedUser);
		} catch (error) {
			logError(error, { operation: 'my.My.toggleAdvanced', userId: user?.uid });
		}
	}

	async function handleLogout() {
		try {
			await logOut();
		} catch (error) {
			logError(error, { operation: 'my.My.handleLogout', userId: user?.uid });
		}
	}

	const impact = [
		{ value: level, label: t('Level') },
		{ value: streak, label: t('Day streak') },
		{ value: engagement?.totalEvaluations ?? 0, label: t('Ratings') },
	];

	return (
		<main className={styles.me} data-testid="me-page">
			<div className={styles.me__inner}>
				<div className={styles.profile}>
					<span className={styles.profile__avatar} aria-hidden="true">
						{photo ? <img src={photo} alt="" /> : name.trim().charAt(0).toUpperCase() || '?'}
					</span>
					<div className={styles.profile__text}>
						<h1 className={styles.profile__name}>{name}</h1>
						{providerLine && <p className={styles.profile__provider}>{providerLine}</p>}
					</div>
					<button
						type="button"
						className={styles.profile__edit}
						onClick={() => fileInputRef.current?.click()}
						aria-label={t('Change profile picture')}
						data-testid="me-edit"
					>
						{t('Edit')}
					</button>
					<input
						type="file"
						accept="image/*"
						ref={fileInputRef}
						className={styles.me__hidden}
						onChange={handleImageChange}
						tabIndex={-1}
					/>
				</div>

				<Link
					to="/my/engagement"
					className={styles.impact}
					aria-label={t('engagement.myImpact')}
					data-testid="me-impact"
				>
					{impact.map((item) => (
						<span key={item.label} className={styles.impact__item}>
							<span className={styles.impact__value}>{item.value}</span>
							<span className={styles.impact__label}>{item.label}</span>
						</span>
					))}
				</Link>

				<ul className={styles.rows}>
					<li>
						<Link
							to="/my/check-notifications"
							className={styles.row}
							data-testid="me-notifications"
						>
							<span>{t('Notifications')}</span>
							<Chevron size={16} className={styles.row__detail} aria-hidden="true" />
						</Link>
					</li>
					<li className={styles.rows__anchor}>
						<button
							type="button"
							ref={languageButtonRef}
							className={styles.row}
							onClick={() => setLanguageOpen((open) => !open)}
							aria-expanded={languageOpen}
							data-testid="me-language"
						>
							<span>{t('Language')}</span>
							<span className={styles.row__detail}>{currentLanguage.toUpperCase()}</span>
						</button>
						{languageOpen && (
							<ChangeLanguage
								onClose={() => setLanguageOpen(false)}
								returnFocusRef={languageButtonRef}
								align="end"
							/>
						)}
					</li>
					<li>
						<button
							type="button"
							className={styles.row}
							onClick={() => setAccessibilityOpen(true)}
							data-testid="me-accessibility"
						>
							<span>{t('Accessibility')}</span>
							<span className={styles.row__detail}>{t('Text size, contrast')}</span>
						</button>
					</li>
					<li>
						<button
							type="button"
							role="switch"
							aria-checked={isAdvancedUser}
							className={styles.row}
							onClick={toggleAdvanced}
							data-testid="me-mode"
						>
							<span>{t('Simple / advanced mode')}</span>
							<span className={styles.row__detail}>
								{isAdvancedUser ? t('Advanced') : t('Simple')}
							</span>
						</button>
					</li>
					<li>
						<Link to="/my/subscriptions" className={styles.row} data-testid="me-subscriptions">
							<span>{t('Subscriptions')}</span>
							<Chevron size={16} className={styles.row__detail} aria-hidden="true" />
						</Link>
					</li>
					<li>
						<button
							type="button"
							className={`${styles.row} ${styles['row--destructive']}`}
							onClick={handleLogout}
							data-testid="me-logout"
						>
							<span>{t('Disconnect')}</span>
						</button>
					</li>
				</ul>
			</div>

			<AccessibilitySheet
				isOpen={accessibilityOpen}
				onClose={() => setAccessibilityOpen(false)}
				fontSize={fontSize}
				onFontSizeChange={changeFontSize}
				highContrast={colorContrast}
				onHighContrastChange={setColorContrast}
			/>
		</main>
	);
};

export default My;
