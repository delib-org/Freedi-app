import { useEffect, useState } from "react";

// Third party imports
import { Outlet, useLocation, useParams } from "react-router";

// Redux Store
import HomeHeader from "./HomeHeader";
import { getNewStatementsFromSubscriptions, listenToTopStatementSubscriptions } from "@/controllers/db/subscriptions/getSubscriptions";
import { useAppSelector } from "@/controllers/hooks/reduxHooks";
import { userSelector } from "@/redux/users/userSlice";

// Helpers

// Custom Components

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
		if (!user) return;

		const unsubscribe = listenToTopStatementSubscriptions(30);
		const updatesUnsubscribe = getNewStatementsFromSubscriptions();

		return () => {
			unsubscribe();
			updatesUnsubscribe();
		};
	}, [user]);

	return (
		<main className="page slide-in">
			{displayHeader && <HomeHeader />}
			<Outlet />
		</main>
	);
}
