import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { useAppSelector } from "./reduxHooks";
import {
	hasTokenSelector,
	statementNotificationSelector,
} from "@/model/statements/statementsSlice";

const useNotificationPermission = (token: string) => {
	const { statementId: _statementId, stageId } = useParams();
	const statementId = _statementId ?? stageId;

	const [permission, setPermission] = useState(
		Notification.permission === "granted",
	);
	const hasNotifications = useAppSelector(
		statementNotificationSelector(statementId),
	);

	const hasToken = useAppSelector(hasTokenSelector(token, statementId));
	useEffect(() => {
		setPermission(
			Notification.permission === "granted" &&
			hasNotifications &&
			hasToken,
		);
	}, [hasToken, hasNotifications, Notification.permission]);
	try {
		if (!statementId) throw new Error("No statementId found in useNotificationPermission");
		if (!token) return false;

		return permission;
	} catch (error) {
		console.error(error);

		return false;
	}
};

export default useNotificationPermission;
