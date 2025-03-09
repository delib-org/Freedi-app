import { useEffect, useState } from 'react';
import MoreLeft from '../../../assets/icons/moreLeft.svg?react';
import MoreRight from '../../../assets/icons/moreRight.svg?react';
import GoogleLoginButton from '../../components/buttons/GoogleLoginButton';
import EnterNameModal from '../../components/enterNameModal/EnterNameModal';
import styles from './Start.module.scss';
import StartPageImage from '@/assets/images/StartPageImage.png';
import { LANGUAGES } from '@/constants/Languages';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import packageJson from '../../../../package.json';
import { LanguagesEnum } from '@/context/UserConfigContext';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { Navigate } from 'react-router';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';
import LogoStart from '../../../assets/icons/LogoStart.svg?react';

const Start = () => {
	const [shouldShowNameModal, setShouldShowNameModal] = useState(false);
	const { t, changeLanguage, currentLanguage, rowDirection } =
		useUserConfig();
	const { isAuthenticated, initialRoute } = useAuthentication();

	const navigateTo = initialRoute ?? '/home';

	const version = packageJson.version;

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
				<span className={styles.mainLogo__slogan}>
					{t('Fostering Collaborations')}
				</span>
			</div>
			<div className={styles.version}>v: {version}</div>
			<div className={styles.interactionComponents}>
				<select
					className={styles.language}
					defaultValue={currentLanguage || 'he'}
					onChange={(e) => {
						const lang = e.target.value as LanguagesEnum;
						changeLanguage(lang);
						if (lang === 'he' || lang === 'ar') {
							document.body.style.direction = 'rtl';
						} else {
							document.body.style.direction = 'ltr';
						}
						localStorage.setItem('lang', lang);
					}}
				>
					{LANGUAGES.map(({ code, label }) => (
						<option key={code} value={code}>
							{label}
						</option>
					))}
				</select>
				<button
					style={{ flexDirection: rowDirection }}
					data-cy='anonymous-login'
					className={`${styles.startBtn} ${styles.anonymous} ${rowDirection === 'row' ? styles.ltr : styles.rtl}`}
					onClick={() => setShouldShowNameModal((prev) => !prev)}
				>
					{rowDirection === 'row-reverse' ? <MoreLeft /> : null}
					{t('Login with a temporary name')}{' '}
					{rowDirection === 'row' ? <MoreRight /> : null}
				</button>

				<GoogleLoginButton />
			</div>

			<img
				src={StartPageImage}
				alt=''
				className={styles.StartPageImage}
			/>
			<a href='http://delib.org' target='_blank' className={styles.ddi}>
				<footer>
					{t('From the Institute for Deliberative Democracy')}
				</footer>
			</a>

			{shouldShowNameModal && (
				<EnterNameModal
					closeModal={() => setShouldShowNameModal(false)}
				/>
			)}
		</div>
	);
};

export default Start;
