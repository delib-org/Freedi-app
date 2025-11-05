import { useTranslation } from '@/controllers/hooks/useTranslation'
import BalloonsImage from '@/assets/images/wait.png'
import styles from './WaitingPage.module.scss';
import { Link } from 'react-router';

const WaitingPage = () => {
	const { t } = useTranslation()

	return (
		<div className={`page ${styles.wait}`}>
			<div className={styles.wrapper}>
				<img src={BalloonsImage} alt="Balloons" />
				<h1>{t("Please wait for the administrator to grant you access")}</h1>
				<p>{t("Thank you for your patience.")}</p>
				<Link className={`btns ${styles.btns}`} to="/home">
					<div className="btn btn--secondary">
						Back to home
					</div>
				</Link>
			</div>

		</div >
	)
}

export default WaitingPage