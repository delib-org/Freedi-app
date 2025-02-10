import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useAppSelector } from "./reduxHooks";
import {
	hasTokenSelector
} from "@/redux/statements/statementsSlice";

const useNotificationPermission = (token: string) => {

	const { statementId } = useParams();

	if (!statementId) throw new Error("statementId not found");

	const [permission, setPermission] = useState(
		Notification.permission === "granted",
	);

	const hasToken = useAppSelector(hasTokenSelector(token, statementId));

	useEffect(() => {
		setPermission(
			Notification.permission === "granted" &&
			hasToken,
		);
	}, [hasToken, Notification.permission]);

	return permission;

};

export default useNotificationPermission;
