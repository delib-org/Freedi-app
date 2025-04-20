import { listenToWaitingForMembership } from "@/controllers/db/membership/getMembership";
import { Unsubscribe } from "firebase/firestore";
import { useEffect } from "react";

export function useApproveMembership() {
	try {

		useEffect(() => {
			console.log("first useApproveMembership");
			let isMounted = true;
			let unsubscribeFunctions: Unsubscribe[] = [];

			listenToWaitingForMembership()
				.then(unsubscribes => {
					if (isMounted) {
						unsubscribeFunctions = unsubscribes;
					} else {
						// Component already unmounted, clean up immediately
						unsubscribes.forEach(unsubscribe => unsubscribe());
					}
				})
				.catch(error => {
					console.error("Error in useEffect:", error);
				});

			// This is the actual cleanup function for useEffect
			return () => {
				isMounted = false;
				unsubscribeFunctions.forEach(unsubscribe => unsubscribe());
			};
		}, []);

	} catch (error) {
		// Handle error appropriately, e.g., log it or rethrow it
		console.error("Error in useApproveMembership:", error);
		throw error; // Rethrow the error if needed

	}
} 