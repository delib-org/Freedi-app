import { useEffect, useState } from "react";

// Third party imports
import { Outlet, useLocation, useParams } from "react-router";

// Redux Store
import HomeHeader from "./HomeHeader";
import { getNewStatementsFromSubscriptions, listenToStatementSubscriptions } from "@/controllers/db/subscriptions/getSubscriptions";
import { useAppSelector } from "@/controllers/hooks/reduxHooks";
import { userSelector } from "@/redux/users/userSlice";

// Helpers

// Custom Components

interface ListenedStatements {
	unsubFunction: () => void;
	statementId: string;
}

export const listenedStatements: Array<ListenedStatements> = [];

export default function Home() {
	// Hooks
	const { statementId } = useParams();
	const location = useLocation();

	// Redux Store
	const user = useAppSelector(userSelector);

	// Use States
	const [displayHeader, setDisplayHeader] = useState(true);

	useEffect(() => {
		if (location.pathname.includes("addStatement") || statementId) {
			setDisplayHeader(false);
		} else {
			setDisplayHeader(true);
		}
	}, [location]);

	useEffect(() => {

		let unsubscribe: () => void = () => { };

		let updatesUnsubscribe: () => void = () => { };
		try {
			if (user) {
				unsubscribe = listenToStatementSubscriptions(30);
				updatesUnsubscribe = getNewStatementsFromSubscriptions();
			}
		} catch (error) {
			console.error(error);
		}

		return () => {
			if (unsubscribe) {
				unsubscribe();
				listenedStatements.forEach((ls) => {
					ls.unsubFunction();
				});
			}
			if (updatesUnsubscribe) {
				updatesUnsubscribe();
			}
		};
	}, [user]);

	return (
		<main className="page slide-in">
			{displayHeader && <HomeHeader />}
			<Outlet />
		</main>
	);
}
