import { Suspense, useEffect } from 'react';
import { Outlet, useLocation, useParams } from 'react-router';
import { useDispatch } from 'react-redux';
import { LanguagesEnum, useLanguage } from '@/controllers/hooks/useLanguages';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { setHistory } from '@/redux/history/HistorySlice';
import { selectInitLocation } from '@/redux/location/locationSlice';
import { useAuthentication } from './controllers/hooks/useAuthentication';
import { Accessibility } from 'lucide-react';
import LoadingPage from './view/pages/loadingPage/LoadingPage';
import { AgreementProvider } from './context/AgreementProvider';

export default function App() {
	const location = useLocation();
	const dispatch = useDispatch();
	const { statementId } = useParams();
	const { changeLanguage } = useLanguage();
	const { isAuthenticated, isLoading, user } = useAuthentication();
	const initLocation = useAppSelector(selectInitLocation);

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

	// Track route history
	useEffect(() => {
		dispatch(setHistory({ statementId, pathname: location.pathname }));
	}, [dispatch, location, statementId]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (!isAuthenticated) {
		return null; // Let the router handle redirection
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
