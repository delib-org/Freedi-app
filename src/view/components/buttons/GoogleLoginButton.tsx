import styles from './GoogleLogin.module.scss';
import googleLogo from '@/assets/icons/googleSimpleLogo.svg';
import moreLeft from '@/assets/icons/moreLeft.svg';
import moreRight from '@/assets/icons/moreRight.svg';
import { googleLogin } from '@/controllers/db/authenticationUtils';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

export default function GoogleLoginButton() {
	const { t, rowDirection } = useUserConfig();

	return (
		<button
			className={`${styles.googleLogin} ${rowDirection === 'row' ? styles.ltr : styles.rtl}`}
			onClick={googleLogin}
		>
			<img
				src={rowDirection === 'row-reverse' ? moreRight : moreLeft}
				alt='login-with-google'
			/>
			{t('Sign up with')}
			<img src={googleLogo} alt='login with google' />
		</button>
	);
}
