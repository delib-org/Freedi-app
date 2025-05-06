import styles from './GoogleLogin.module.scss';
import googleLogo from '@/assets/icons/googleSimpleLogo.svg';
import MoreLeft from '../../../assets/icons/moreLeft.svg?react';
import MoreRight from '../../../assets/icons/moreRight.svg?react';
import { googleLogin } from '@/controllers/db/authenticationUtils';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

export default function GoogleLoginButton() {
	const { t, rowDirection } = useUserConfig();

	return (
		<button
			className={`${styles.googleLogin} ${rowDirection === 'row' ? styles.ltr : styles.rtl}`}
			onClick={googleLogin}
		>
			{rowDirection === 'row-reverse' ? <MoreRight /> : null}
			{rowDirection === 'row' ? <MoreLeft /> : null}
			{t('Sign up with')} <img src={googleLogo} alt='login with google' />
		</button>
	);
}
