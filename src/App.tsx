import { Unsubscribe } from 'firebase/auth';
import React, { useEffect, useState, Suspense } from 'react';

// Third party imports
import { useDispatch } from 'react-redux';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';

// Firebase functions
import { listenToAuth, logOut } from './controllers/db/auth';

// Redux Store
import { getSignature } from './controllers/db/users/getUserDB';
import { updateUserAgreement } from './controllers/db/users/setUsersDB';
import { useAppSelector } from './controllers/hooks/reduxHooks';
import { LanguagesEnum, useLanguage } from './controllers/hooks/useLanguages';
import { setHistory } from './redux/history/HistorySlice';
import { selectInitLocation } from './redux/location/locationSlice';
import { updateAgreementToStore, userSelector } from './redux/users/userSlice';

// Type

// Custom components
import Accessibility from './view/components/accessibility/Accessibility';
import TermsOfUse from './view/components/termsOfUse/TermsOfUse';
import { Agreement } from './types/agreement/Agreement';

// Helpers

export default function App() {
	// Hooks
	const location = useLocation();
	const navigate = useNavigate();
	const dispatch = useDispatch();
	const { statementId } = useParams();
	const { changeLanguage, t } = useLanguage();

	// Redux Store
	const user = useAppSelector(userSelector);
	const initLocation = useAppSelector(selectInitLocation);

	// Use State
	const [showSignAgreement, setShowSignAgreement] = useState(false);
	const [agreement, setAgreement] = useState<string>('');
	useEffect(() => {
		// Default direction is ltr
		document.body.style.direction = 'ltr';

		// Get language from local storage and change accordingly
		const lang = localStorage.getItem('lang') as LanguagesEnum;
		if (lang) {
			changeLanguage(lang);
			document.body.style.direction =
				lang === 'he' || lang === 'ar' ? 'rtl' : 'ltr';
		}
	}, []);

	useEffect(() => {
		const authUnsubscribe: Unsubscribe = listenToAuth(
			navigate,
			false,
			initLocation
		);

		return () => authUnsubscribe();
	}, []);

	useEffect(() => {
		dispatch(setHistory({ statementId, pathname: location.pathname }));
	}, [location]);

	useEffect(() => {
		const fetchData = async () => {
			if (!user) {
				return;
			}

			if (user.agreement?.date) {
				setShowSignAgreement(false);
			} else {
				const agreement = getSignature('basic', t);

				if (!agreement) throw new Error('agreement not found');

				setAgreement(agreement.text);
				setShowSignAgreement(true);
			}
		};

		return () => {
			fetchData();
		};
	}, [user]);

	useEffect(() => {
		if (!user) {
			return;
		}

		if (user.agreement?.date) {
			setShowSignAgreement(false);
		} else {
			const agreement = getSignature('basic', t);

			if (!agreement) throw new Error('agreement not found');

			setAgreement(agreement.text);
			setShowSignAgreement(true);
		}
	}, [user]);

	async function handleAgreement(agree: boolean, text: string) {
		try {
			if (!text) throw new Error('text is empty');
			if (agree) {
				setShowSignAgreement(false);
				const agreement: Agreement | undefined = getSignature(
					'basic',
					t
				);
				if (!agreement) throw new Error('agreement not found');
				agreement.text = text;

				dispatch(updateAgreementToStore(agreement));

				updateUserAgreement(agreement).then((isAgreed: boolean) =>
					setShowSignAgreement(!isAgreed)
				);
			} else {
				setShowSignAgreement(false);
				await logOut();
			}
		} catch (error) {
			console.error(error);
		}
	}

	return (
		<Suspense fallback={<div>Loading...</div>}>
			<Accessibility />

			<Outlet />
			{showSignAgreement && (
				<TermsOfUse
					handleAgreement={handleAgreement}
					agreement={agreement}
				/>
			)}
		</Suspense>
	);
}
