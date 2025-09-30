import { listenToWaitingForMembership } from "@/controllers/db/membership/getMembership";
import { creatorSelector } from "@/redux/creator/creatorSlice";
import { selectWaitingMember } from "@/redux/subscriptions/subscriptionsSlice";
import { Unsubscribe } from "firebase/firestore";
import { useEffect, useMemo, useRef } from "react";
import { useSelector } from "react-redux";

export function useApproveMembership() {
	const user = useSelector(creatorSelector);
	const waitingListFromStore = useSelector(selectWaitingMember);
	const waitingList = useMemo(() => waitingListFromStore, [waitingListFromStore]);
	const userId = user?.uid;
	const listenerRef = useRef<Unsubscribe | null>(null);
	const isSettingUp = useRef(false);

	useEffect(() => {
		// Prevent multiple simultaneous setups
		if (isSettingUp.current) {
			return;
		}

		if (!userId) {
			return;
		}

		// If listener already exists, don't set up another one
		if (listenerRef.current) {
			return;
		}

		isSettingUp.current = true;

		try {
			const unsubscribe = listenToWaitingForMembership();
			listenerRef.current = unsubscribe;
		} catch (error) {
			console.error("Error setting up waiting membership listener:", error);
		} finally {
			isSettingUp.current = false;
		}

		// Cleanup function
		return () => {
			if (listenerRef.current) {
				try {
					listenerRef.current();
					listenerRef.current = null;
				} catch (error) {
					console.error("Error cleaning up waiting membership listener:", error);
				}
			}
		};
	}, [userId]);

	return { waitingList };
} 