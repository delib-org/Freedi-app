import { FC } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './VotingThankYou.module.scss';

const VotingThankYou: FC = () => {
	const navigate = useNavigate();
	const { t } = useTranslation();

	const handleGoHome = () => {
		navigate('/home');
	};

	return (
		<div className={styles.container}>
			<div className={styles.card}>
				<div className={styles.iconContainer}>
					<svg
						className={styles.successIcon}
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
				</div>

				<h1 className={styles.heading}>{t('Thank you for your vote')}</h1>

				<p className={styles.description}>
					{t(
						'The Deliberative Democracy Institute developing apps for deliberative democracy in communities and cities.',
					)}
				</p>

				<div className={styles.contactInfo}>
					<a href="mailto:tal.yaron@gmail.com" className={styles.contactLink}>
						<svg
							className={styles.icon}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
							<polyline points="22,6 12,13 2,6" />
						</svg>
						tal.yaron@gmail.com
					</a>
					<a href="tel:+972526079419" className={styles.contactLink}>
						<svg
							className={styles.icon}
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
						</svg>
						+972-52-607-9419
					</a>
				</div>

				<div className={styles.websiteInfo}>
					<p className={styles.websiteText}>{t('For more information, visit our website')}:</p>
					<a
						href="https://delib.org"
						target="_blank"
						rel="noopener noreferrer"
						className={styles.websiteLink}
					>
						delib.org
					</a>
				</div>

				<button onClick={handleGoHome} className={styles.homeButton}>
					{t('Go to Home')}
				</button>
			</div>
		</div>
	);
};

export default VotingThankYou;
