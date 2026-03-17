import { useEffect, useState } from 'react';
import { logError } from '@/utils/errorHandling';
import { useCreditAnimation } from '@/controllers/hooks/useCreditAnimation';
import CreditToast from '@/view/components/atomic/atoms/CreditToast/CreditToast';

// Third party imports
import { Outlet, useLocation, useParams } from 'react-router';

// Redux Store
import HomeHeader from './HomeHeader';
import {
	getNewStatementsFromSubscriptions,
	listenToStatementSubscriptions,
} from '@/controllers/db/subscriptions/getSubscriptions';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { listenToInAppNotifications } from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import {
	listenToUserEngagement,
	listenToRecentCredits,
} from '@/controllers/db/engagement/db_engagement';

// Helpers

// Custom Components

export default function Home() {
	// Hooks
	const { statementId } = useParams();
	const location = useLocation();
	const { user } = useAuthentication();

	// Use States
	const [displayHeader, setDisplayHeader] = useState(true);
	const { toast, dismissToast } = useCreditAnimation();

	useEffect(() => {
		if (location.pathname.includes('addStatement') || statementId) {
			setDisplayHeader(false);
		} else {
			setDisplayHeader(true);
		}
	}, [location]);

	// Set document title for main page
	useEffect(() => {
		if (!statementId && !location.pathname.includes('addStatement')) {
			document.title = 'WizCol - Main';
		}
	}, [location, statementId]);

	useEffect(() => {
		let unsubscribe: () => void = () => {};
		let updatesUnsubscribe: () => void = () => {};
		let unsubscribeInAppNotifications: () => void = () => {};
		let unsubscribeEngagement: () => void = () => {};
		let unsubscribeCredits: () => void = () => {};

		// Set up listeners sequentially with delays to avoid overwhelming IndexedDB
		// This is especially important for iOS Safari which has strict connection limits
		async function setupListenersSequentially(): Promise<void> {
			try {
				if (!user) return;

				// Set up first listener
				unsubscribe = listenToStatementSubscriptions(user.uid, 100);

				// Brief pause between listeners for iOS Safari IndexedDB compatibility
				await new Promise((resolve) => setTimeout(resolve, 100));

				updatesUnsubscribe = getNewStatementsFromSubscriptions(user.uid);

				// Brief pause before final listener
				await new Promise((resolve) => setTimeout(resolve, 100));

				unsubscribeInAppNotifications = listenToInAppNotifications();

				// Brief pause before engagement listeners
				await new Promise((resolve) => setTimeout(resolve, 100));

				unsubscribeEngagement = listenToUserEngagement();
				unsubscribeCredits = listenToRecentCredits();
			} catch (error) {
				logError(error, {
					operation: 'home.Home.setupListenersSequentially',
					metadata: { message: 'Error setting up listeners:' },
				});
			}
		}

		setupListenersSequentially();

		return () => {
			unsubscribe();
			updatesUnsubscribe();
			unsubscribeInAppNotifications();
			unsubscribeEngagement();
			unsubscribeCredits();
		};
	}, [user]);

	return (
		<main className="page slide-in">
			{displayHeader && <HomeHeader />}
			<Outlet />
			{toast && (
				<CreditToast
					key={toast.id}
					amount={toast.amount}
					onComplete={dismissToast}
				/>
			)}
		</main>
	);
}
