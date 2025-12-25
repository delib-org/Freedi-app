import styles from './page404.module.scss';
import { useNavigate } from 'react-router';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import clsx from 'clsx';

// Images
import img404 from '@/assets/images/404.png';
import cable from '@/assets/images/Cable.png';
import cableDog from '@/assets/images/CableDog.png';
import Cloud1 from '@/assets/images/Cloud1.png';
import Cloud2 from '@/assets/images/Cloud2.png';
import Cloud3 from '@/assets/images/Cloud3.png';

const Page404 = () => {
	const navigate = useNavigate();
	const { t } = useTranslation();

	const handleGoHome = () => {
		navigate('/home', { replace: true });
	};

	return (
		<main
			className={styles.page404}
			role="main"
			aria-labelledby="error-title"
		>
			{/* Background Clouds */}
			<div className={styles.page404__clouds} aria-hidden="true">
				<img
					className={clsx(styles.page404__cloud, styles['page404__cloud--1'])}
					src={Cloud1}
					alt=""
				/>
				<img
					className={clsx(styles.page404__cloud, styles['page404__cloud--2'])}
					src={Cloud2}
					alt=""
				/>
				<img
					className={clsx(styles.page404__cloud, styles['page404__cloud--3'])}
					src={Cloud3}
					alt=""
				/>
			</div>

			{/* Main Content */}
			<div className={styles.page404__content}>
				{/* 404 Number */}
				<img
					className={styles.page404__number}
					src={img404}
					alt="404"
				/>

				{/* Dog & Cable Illustration */}
				<div className={styles.page404__illustration}>
					<img
						className={styles.page404__dog}
						src={cableDog}
						alt={t('Friendly dog holding an unplugged cable')}
					/>
					<img
						className={styles.page404__cable}
						src={cable}
						alt=""
						aria-hidden="true"
					/>
				</div>

				{/* Message */}
				<h1 id="error-title" className={styles.page404__message}>
					{t('Looks like this page got unplugged')}
				</h1>

				<p className={styles.page404__hint}>
					{t("Don't worry, our friendly pup is on the case!")}
				</p>

				{/* Home Button */}
				<button
					className={styles.page404__button}
					onClick={handleGoHome}
					aria-label={t('Return to home page')}
				>
					{t('Take Me Home')}
				</button>
			</div>
		</main>
	);
};

export default Page404;
