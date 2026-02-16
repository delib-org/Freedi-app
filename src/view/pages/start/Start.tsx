import { useEffect, useState } from 'react';
import MoreLeft from '../../../assets/icons/moreLeft.svg?react';
import MoreRight from '../../../assets/icons/moreRight.svg?react';
import GoogleLoginButton from '../../components/buttons/GoogleLoginButton';
import EnterNameModal from '../../components/enterNameModal/EnterNameModal';
import styles from './Start.module.scss';
import StartPageImage from '@/assets/images/StartPageImage.png';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { Navigate } from 'react-router';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';
import LogoStart from '../../../assets/icons/LogoStart.svg?react';
import ChangeLanguage from '@/view/components/changeLanguage/ChangeLanguage';
import { AppVersion } from '@/main';

const Start = () => {
	const [shouldShowNameModal, setShouldShowNameModal] = useState(false);
	const { t, rowDirection } = useTranslation();
	const { isAuthenticated, initialRoute } = useAuthentication();

	const navigateTo = initialRoute ?? '/home';

	useEffect(() => {
		if (isAuthenticated && initialRoute) {
			localStorage.removeItem(LocalStorageObjects.InitialRoute);
		}
	}, [isAuthenticated, initialRoute]);

	if (isAuthenticated) return <Navigate to={navigateTo} replace />;

	return (
		<div className={styles.splashPage}>
			<div className={styles.mainLogo}>
				<LogoStart />
				<span className={styles.mainLogo__slogan}>{t('Fostering Collaborations')}</span>
			</div>
			<div className={styles.version}>v: {AppVersion}</div>
			<div className={styles.interactionComponents}>
				<ChangeLanguage />

				<button
					style={{ flexDirection: rowDirection }}
					data-cy="anonymous-login"
					className={`${styles.startBtn} ${styles.anonymous} ${rowDirection === 'row' ? styles.ltr : styles.rtl}`}
					onClick={() => setShouldShowNameModal((prev) => !prev)}
				>
					{rowDirection === 'row-reverse' ? <MoreLeft /> : null}
					{t('Login with a temporary name')} {rowDirection === 'row' ? <MoreRight /> : null}
				</button>

				<GoogleLoginButton />
			</div>

			<img src={StartPageImage} alt="" className={styles.StartPageImage} />
			<a href="http://delib.org" target="_blank" className={styles.ddi}>
				<footer>{t('From the Institute for Deliberative Democracy')}</footer>
			</a>

			{shouldShowNameModal && <EnterNameModal closeModal={() => setShouldShowNameModal(false)} />}
		</div>
	);
};

export default Start;
