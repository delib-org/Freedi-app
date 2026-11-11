import { useState } from 'react';
import styles from './page401.module.scss';
import { useLocation, useNavigate } from 'react-router';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { logOut } from '@/controllers/db/authenticationUtils';
import { saveInitialRoute, toSafeRedirectPath } from '@/helpers/initialRoute';
import { getWayBackPath } from '@/helpers/wayBack';
import { HOME_PATH } from '@/view/components/atomic/organisms/BottomNav/bottomNavModel';
import { logError } from '@/utils/errorHandling';
import clsx from 'clsx';

// Images
import UnAuthorizedImage from '@/assets/images/401-img.png';
import Cloud1 from '@/assets/images/Cloud1.png';
import Cloud3 from '@/assets/images/Cloud3.png';

const ERROR_ROUTE = '/401';

const Page401 = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const { t } = useTranslation();
	const { user } = useAuthentication();
	const [isSigningIn, setIsSigningIn] = useState(false);

	const hasNamedAccount = !!user && !user.isAnonymous;
	const from = (location.state as { from?: unknown } | null)?.from;
	// On /401 the closed URL arrives as `from`. Rendered in place, the URL is the
	// closed page and `from` is the page the person came from.
	const returnPath = toSafeRedirectPath(
		location.pathname === ERROR_ROUTE ? from : `${location.pathname}${location.search}`,
	);
	const wayBackPath = getWayBackPath(from, returnPath);

	const handleSignIn = async () => {
		setIsSigningIn(true);
		try {
			if (returnPath) saveInitialRoute(returnPath);
			// /start sends anyone with a session straight back, so end it first.
			if (user) await logOut();
			navigate('/start', { replace: true });
		} catch (error) {
			logError(error, {
				operation: 'page401.Page401.handleSignIn',
				userId: user?.uid,
				metadata: { returnPath },
			});
			setIsSigningIn(false);
		}
	};

	const handleGoHome = () => {
		navigate(HOME_PATH, { state: { from: window.location.pathname } });
	};

	return (
		<main className={styles.page401} role="main" aria-labelledby="error-title">
			{/* Background Clouds */}
			<div className={styles.page401__clouds} aria-hidden="true">
				<img
					className={clsx(styles.page401__cloud, styles['page401__cloud--1'])}
					src={Cloud1}
					alt=""
				/>
				<img
					className={clsx(styles.page401__cloud, styles['page401__cloud--2'])}
					src={Cloud3}
					alt=""
				/>
			</div>

			{/* Main Content */}
			<div className={styles.page401__content}>
				{/* 401 Badge */}
				<div className={styles.page401__badge}>
					<svg
						className={styles.page401__badgeIcon}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						aria-hidden="true"
					>
						<rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
						<path d="M7 11V7a5 5 0 0 1 10 0v4" />
					</svg>
				</div>

				{/* Main Illustration */}
				<div className={styles.page401__illustration}>
					<img
						className={styles.page401__image}
						src={UnAuthorizedImage}
						alt={t('Friendly illustration showing access restriction')}
					/>
				</div>

				{/* Message */}
				<h1 id="error-title" className={styles.page401__message}>
					{t('This page is private')}
				</h1>

				<p className={styles.page401__hint}>
					{hasNamedAccount
						? t('No access. Ask the host to invite you.')
						: t('This area is for registered members. Sign in to unlock access!')}
				</p>

				{/* Action Buttons */}
				<div className={styles.page401__actions}>
					{wayBackPath && (
						<button
							type="button"
							className={styles.page401__button}
							onClick={() => navigate(wayBackPath)}
						>
							{t('Back to the question')}
						</button>
					)}
					<button
						type="button"
						className={clsx(
							styles.page401__button,
							wayBackPath && styles['page401__button--secondary'],
						)}
						onClick={handleSignIn}
						disabled={isSigningIn}
					>
						{hasNamedAccount ? t('Sign in with another account') : t('Sign in')}
					</button>
					<button
						type="button"
						className={clsx(styles.page401__button, styles['page401__button--secondary'])}
						onClick={handleGoHome}
					>
						{t('Back to home')}
					</button>
				</div>

				{/* Footer */}
				<p className={styles.page401__footer}>
					{t('From the Institute for Deliberative Democracy')}
				</p>
			</div>
		</main>
	);
};

export default Page401;
