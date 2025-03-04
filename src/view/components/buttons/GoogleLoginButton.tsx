import styles from "./GoogleLogin.module.scss";
import googleLogo from "@/assets/icons/googleSimpleLogo.svg";
import { googleLogin } from "@/controllers/db/auth";
import useDirection from "@/controllers/hooks/useDirection";
import { useLanguage } from "@/controllers/hooks/useLanguages";
import MoreLeft from '../../../assets/icons/moreLeft.svg?react';
import MoreRight from '../../../assets/icons/moreRight.svg?react';

export default function GoogleLoginButton() {
	const direction = useDirection();
	const { t } = useLanguage();

	return (
		<button
			className={`${styles.googleLogin} ${direction === "row" ? styles.ltr : styles.rtl}`}
			onClick={googleLogin}
		>
			{direction === 'row-reverse' ? <MoreRight /> : null}
			{direction === 'row' ? <MoreLeft /> : null}
			{t('Sign up with')}{' '}
			<img src={googleLogo} alt="login with google" />
		</button>
	);
}
