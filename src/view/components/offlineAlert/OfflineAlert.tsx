import { FC, useState, useEffect } from 'react';
import Snackbar from '@/view/components/snackbar/Snackbar';
import { useOnlineStatus } from '@/controllers/hooks/useOnlineStatus';
import { TIME } from '@/constants/common';

/**
 * OfflineAlert component
 * Shows a snackbar when the app goes offline/online
 */
const OfflineAlert: FC = () => {
	const { isOnline, wasOffline } = useOnlineStatus();
	const [showOfflineSnackbar, setShowOfflineSnackbar] = useState(false);
	const [showOnlineSnackbar, setShowOnlineSnackbar] = useState(false);

	useEffect(() => {
		if (!isOnline) {
			// Show offline snackbar
			setShowOfflineSnackbar(true);
			setShowOnlineSnackbar(false);
		} else if (wasOffline) {
			// Show online snackbar when coming back online
			setShowOfflineSnackbar(false);
			setShowOnlineSnackbar(true);
		}
	}, [isOnline, wasOffline]);

	return (
		<>
			{/* Offline Snackbar */}
			<Snackbar
				message="No Internet Connection"
				subMessage="Please check your network connection"
				isVisible={showOfflineSnackbar}
				duration={0} // Don't auto-hide when offline
				onClose={() => setShowOfflineSnackbar(false)}
				type="error"
			/>

			{/* Online Snackbar */}
			<Snackbar
				message="Back Online"
				subMessage="Your connection has been restored"
				isVisible={showOnlineSnackbar}
				duration={TIME.SECOND * 3}
				onClose={() => setShowOnlineSnackbar(false)}
				type="success"
			/>
		</>
	);
};

export default OfflineAlert;
