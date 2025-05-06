import { listenToWaitingForMembership } from "@/controllers/db/membership/getMembership";
import { creatorSelector } from "@/redux/creator/creatorSlice";
import { selectWaitingMember } from "@/redux/subscriptions/subscriptionsSlice";
import { Unsubscribe } from "firebase/firestore";
import { useEffect, useMemo } from "react";
import { useSelector } from "react-redux";

export function useApproveMembership() {
	const user = useSelector(creatorSelector);
	const waitingListFromStore = useSelector(selectWaitingMember)
	const waitingList = useMemo(() => waitingListFromStore, [waitingListFromStore]);
	const userId = user?.uid;
	try {

		useEffect(() => {

			let unsubscribe: Unsubscribe | undefined = undefined;

			if (!userId) return;

			unsubscribe = listenToWaitingForMembership();

			// This is the actual cleanup function for useEffect
			return () => {

				if (unsubscribe) {
					unsubscribe();
				}
			};
		}, [userId]);

		return { waitingList }

	} catch (error) {
		// Handle error appropriately, e.g., log it or rethrow it
		console.error("Error in useApproveMembership:", error);
		throw error; // Rethrow the error if needed

	}
} 