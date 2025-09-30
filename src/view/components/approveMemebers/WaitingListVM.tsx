import { listenToWaitingForMembership } from "@/controllers/db/membership/getMembership";
import { creatorSelector } from "@/redux/creator/creatorSlice";
import { selectWaitingMember } from "@/redux/subscriptions/subscriptionsSlice";
import { useEffect, useMemo } from "react";
import { useSelector } from "react-redux";

export function useApproveMembership() {
	const user = useSelector(creatorSelector);
	const waitingListFromStore = useSelector(selectWaitingMember);
	const waitingList = useMemo(() => waitingListFromStore, [waitingListFromStore]);
	const userId = user?.uid;

	useEffect(() => {
		if (!userId) {
			return;
		}

		// The listener now handles all the logic internally:
		// - Checks if user is admin
		// - Uses ListenerManager to prevent duplicates
		// - Only sets up listener if needed
		const unsubscribe = listenToWaitingForMembership();

		// Cleanup function
		return () => {
			if (unsubscribe) {
				try {
					unsubscribe();
				} catch (error) {
					console.error("Error cleaning up waiting membership listener:", error);
				}
			}
		};
	}, [userId]);

	return { waitingList };
} 