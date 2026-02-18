import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Link } from 'react-router';
import styles from './WaitingPage.module.scss';

const WaitingPage = () => {
	const { t } = useTranslation();

	return (
		<div className={styles['waiting-page']}>
			<div className={styles['waiting-page__wrapper']}>
				<div className={styles['waiting-page__card']}>
					{/* Portal Animation */}
					<div className={styles['portal-loader']} role="img" aria-label={t('Waiting for access')}>
						<div className={styles['portal-loader__outer-ring']} />
						<div className={styles['portal-loader__middle-ring']} />
						<div className={styles['portal-loader__inner-ring']} />
						<div className={styles['portal-loader__center']}>
							<svg
								className={styles['portal-loader__icon']}
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
								strokeLinecap="round"
								strokeLinejoin="round"
							>
								<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
								<circle cx="9" cy="7" r="4" />
								<line x1="19" y1="8" x2="19" y2="14" />
								<line x1="22" y1="11" x2="16" y2="11" />
							</svg>
						</div>
						<div className={styles['portal-loader__particle']} />
						<div className={styles['portal-loader__particle']} />
						<div className={styles['portal-loader__particle']} />
						<div className={styles['portal-loader__particle']} />
					</div>

					{/* Status Section */}
					<div className={styles['waiting-status']}>
						<h1 className={styles['waiting-status__title']}>{t('Request Submitted')}</h1>
						<p className={styles['waiting-status__message']}>
							{t(
								'The group administrator will review your request to join. You will be notified once approved.',
							)}
						</p>

						{/* Status Indicator */}
						<div className={styles['status-indicator']}>
							<span className={styles['status-indicator__dot']} />
							<span className={styles['status-indicator__text']}>{t('Pending review')}</span>
						</div>
					</div>

					{/* Info Section */}
					<div className={styles['waiting-info']}>
						<h2 className={styles['waiting-info__title']}>{t('What you can do in WizCol')}</h2>
						<ul className={styles['waiting-info__list']}>
							<li className={styles['waiting-info__item']}>
								<svg
									className={styles['waiting-info__icon']}
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
								</svg>
								<span className={styles['waiting-info__text']}>
									{t('Share ideas and perspectives with your group')}
								</span>
							</li>
							<li className={styles['waiting-info__item']}>
								<svg
									className={styles['waiting-info__icon']}
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<polyline points="20 6 9 17 4 12" />
								</svg>
								<span className={styles['waiting-info__text']}>
									{t('Vote and build consensus on decisions')}
								</span>
							</li>
							<li className={styles['waiting-info__item']}>
								<svg
									className={styles['waiting-info__icon']}
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<circle cx="12" cy="12" r="10" />
									<line x1="2" y1="12" x2="22" y2="12" />
									<path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
								</svg>
								<span className={styles['waiting-info__text']}>
									{t('Collaborate with people anywhere in the world')}
								</span>
							</li>
						</ul>
					</div>

					{/* Actions */}
					<div className={styles['waiting-actions']}>
						<Link to="/home">
							<button className="btn btn--secondary" type="button">
								{t('Back to home')}
							</button>
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
};

export default WaitingPage;
