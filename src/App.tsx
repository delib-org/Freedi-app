import { Suspense, useEffect } from 'react';
import { Outlet } from 'react-router';
import { AgreementProvider } from './context/AgreementProvider';
import { useAuthentication } from './controllers/hooks/useAuthentication';
import { useLanguage, LanguagesEnum } from './controllers/hooks/useLanguages';
import LoadingPage from './view/pages/loadingPage/LoadingPage';
import Accessibility from './view/components/accessibility/Accessibility';

export default function App() {
	const { changeLanguage } = useLanguage();
	const { isAuthenticated, isLoading, user } = useAuthentication();

	// Handle language setup
	useEffect(() => {
		const lang = localStorage.getItem('lang') as LanguagesEnum;
		document.body.style.direction = 'ltr';

		if (lang) {
			changeLanguage(lang);
			document.body.style.direction =
				lang === 'he' || lang === 'ar' ? 'rtl' : 'ltr';
		}
	}, [changeLanguage]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (!isAuthenticated) {
		return null;
	}

	return (
		<Suspense fallback={<LoadingPage />}>
			<AgreementProvider user={user}>
				<Accessibility />
				<Outlet />
			</AgreementProvider>
		</Suspense>
	);
}
