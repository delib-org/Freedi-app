import { useEffect, useState } from 'react';

// Third party imports
import { Outlet, useLocation, useParams } from 'react-router';

// Redux Store
import HomeHeader from './HomeHeader';
import {
	getNewStatementsFromSubscriptions,
	listenToStatementSubscriptions,
} from '@/controllers/db/subscriptions/getSubscriptions';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';

// Helpers

// Custom Components

export default function Home() {
	// Hooks
	const { statementId } = useParams();
	const location = useLocation();
	const { user } = useAuthentication();

	// Use States
	const [displayHeader, setDisplayHeader] = useState(true);

	useEffect(() => {
		if (location.pathname.includes('addStatement') || statementId) {
			setDisplayHeader(false);
		} else {
			setDisplayHeader(true);
		}
	}, [location]);

	useEffect(() => {
		let unsubscribe: () => void = () => {};

		let updatesUnsubscribe: () => void = () => {};
		try {
			if (user) {
				unsubscribe = listenToStatementSubscriptions(user.uid, 30);
				updatesUnsubscribe = getNewStatementsFromSubscriptions(
					user.uid
				);
			}
		} catch (error) {
			console.error(error);
		}

		return () => {
			unsubscribe();
			updatesUnsubscribe();
		};
	}, [user]);

	return (
		<main className='page slide-in'>
			{displayHeader && <HomeHeader />}
			<Outlet />
		</main>
	);
}
