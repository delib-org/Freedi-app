import LandingPage from '@/view/components/atomic/organisms/LandingPage/LandingPage';
import { useEffect, useRef, useState } from 'react';
import GoogleLoginButton from '../../components/buttons/GoogleLoginButton';
import EnterNameModal from '../../components/enterNameModal/EnterNameModal';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { Navigate } from 'react-router';
import { LocalStorageObjects } from '@/types/localStorage/LocalStorageObjects';
import ChangeLanguage from '@/view/components/changeLanguage/ChangeLanguage';
import LanguagePill from '@/view/components/atomic/atoms/LanguagePill/LanguagePill';

const Start = () => {
	const [shouldShowNameModal, setShouldShowNameModal] = useState(false);
	const [showLanguagePopover, setShowLanguagePopover] = useState(false);
	const { t, rowDirection, currentLanguage } = useTranslation();
	const { isAuthenticated, initialRoute } = useAuthentication();
	const languagePillRef = useRef<HTMLButtonElement>(null);

	const navigateTo = initialRoute ?? '/home';

	useEffect(() => {
		if (isAuthenticated && initialRoute) {
			localStorage.removeItem(LocalStorageObjects.InitialRoute);
		}
	}, [isAuthenticated, initialRoute]);

	if (isAuthenticated) return <Navigate to={navigateTo} replace />;

	return (
		<>
			<LandingPage
				t={t}
				dir={rowDirection === 'row-reverse' ? 'rtl' : 'ltr'}
				language={
					<span className="language-pill-anchor">
						<LanguagePill
							ref={languagePillRef}
							currentLanguage={currentLanguage}
							isOpen={showLanguagePopover}
							onClick={() => setShowLanguagePopover((prev) => !prev)}
						/>
						{showLanguagePopover && (
							<ChangeLanguage
								onClose={() => setShowLanguagePopover(false)}
								returnFocusRef={languagePillRef}
								align="center"
							/>
						)}
					</span>
				}
				login={(closeLogin) => (
					<>
						<GoogleLoginButton />
						<button
							data-cy="anonymous-login"
							onClick={() => {
								closeLogin();
								setShouldShowNameModal(true);
							}}
						>
							{t('Login with a temporary name')}
						</button>
					</>
				)}
			/>
			{shouldShowNameModal && <EnterNameModal closeModal={() => setShouldShowNameModal(false)} />}
		</>
	);
};

export default Start;
