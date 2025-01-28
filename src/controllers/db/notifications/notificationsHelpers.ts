import { Statement } from "delib-npm";
import {
	getUserPermissionToNotifications,
	setStatementSubscriptionNotificationToDB,
} from "./notifications";

export default async function toggleNotifications(
	statement: Statement | undefined,
	permission: boolean,
	t: (key: string) => string,
	setShowAskPermission?: (show: boolean) => void,
) {
	try {
		if (!statement)
			throw new Error("Statement is undefined in toggleNotifications");

		const isPermitted = await getUserPermissionToNotifications(t);

		if (!isPermitted && setShowAskPermission) return setShowAskPermission(true);

		setStatementSubscriptionNotificationToDB(statement, !permission);
	} catch (error) {
		console.error(error);
	}
}
