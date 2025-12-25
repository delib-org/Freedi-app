import styles from './page401.module.scss';
import { useNavigate } from 'react-router';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import clsx from 'clsx';

// Images
import UnAuthorizedImage from '@/assets/images/401-img.png';
import Cloud1 from '@/assets/images/Cloud1.png';
import Cloud3 from '@/assets/images/Cloud3.png';

const Page401 = () => {
	const navigate = useNavigate();
	const { t } = useTranslation();

	const handleGoHome = () => {
		navigate('/', { state: { from: window.location.pathname } });
	};

	return (
		<main
			className={styles.page401}
			role="main"
			aria-labelledby="error-title"
		>
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
					<span>401</span>
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
					{t('Oops! This door needs a key')}
				</h1>

				<p className={styles.page401__hint}>
					{t('This area is for registered members. Sign in to unlock access!')}
				</p>

				{/* Action Buttons */}
				<div className={styles.page401__actions}>
					<button
						className={styles.page401__button}
						onClick={handleGoHome}
						aria-label={t('Return to home page')}
					>
						{t('Take Me Home')}
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
