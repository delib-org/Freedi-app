import { Statement, Collections, StatementSubscription } from "delib-npm";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import { getToken, onMessage } from "firebase/messaging";
import { t } from "i18next";
import { messaging, DB } from "./db/config";
import { getUserFromFirebase } from "./db/users/usersGeneral";
import { vapidKey } from "./db/configKey";
import logo from "../assets/logo/logo-96px.png";

export async function getUserPermissionToNotifications(): Promise<boolean> {
    try {
        if (!window.hasOwnProperty("Notification"))
            throw new Error("Notification not supported");
        if (Notification.permission === "granted") return true;

        if (Notification.permission === "denied") return false;

        //in case the user didn't set the notification permission yet
        alert(
            t(
                "Please confirm notifications to receive updates on new comments\nYou can disable notifications at any time"
            )
        );
        const permission = await Notification.requestPermission();

        if (permission !== "granted") throw new Error("Permission not granted");
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}

export async function onLocalMessage() {
    try {
        const msg = await messaging();
        if (!msg) throw new Error("msg is undefined");

        return onMessage(msg, (payload) => {
            if (payload.data?.creatorId === getUserFromFirebase()?.uid)
                return console.log(
                    "This user created the statement, no need to notify him"
                );

            Notification.requestPermission().then((permission) => {
                if (permission === "granted") {
                    console.log("Message received. ", payload);
                    const title = payload.data?.title || "Delib";

                    const notification = new Notification(title, {
                        body: payload.data?.body || "",
                        data: { url: payload.data?.url || "" },
                        icon: logo,
                    });

                    notification.onclick = (event) => {
                        const target = event.target as Notification;

                        const url = target.data.url;

                        console.log("url - ", url);

                        window.open(url, "_blank");
                    };
                } else {
                    console.log("Unable to get permission to notify.");
                }
            });
        });
    } catch (error) {
        console.log(error);
    }
}

export async function setStatmentSubscriptionNotificationToDB(
    statement: Statement | undefined
) {
    try {
        const msg = await messaging();
        if (!msg) throw new Error("msg is undefined");

        const token = await getToken(msg, { vapidKey });

        if (!token) throw new Error("Token is undefined");

        if (!statement) throw new Error("Statement is undefined");
        const { statementId } = statement;

        //ask user for permission to send notifications
        await getUserPermissionToNotifications();

        const user = getUserFromFirebase();
        if (!user) throw new Error("User not logged in");
        if (!user.uid) throw new Error("User not logged in");

        const statementsSubscribeId = `${user.uid}--${statementId}`;
        const statementsSubscribeRef = doc(
            DB,
            Collections.statementsSubscribe,
            statementsSubscribeId
        );
        const statementSubscriptionDB = await getDoc(statementsSubscribeRef);

        if (!statementSubscriptionDB.exists()) {
            //set new subscription
            await setDoc(
                statementsSubscribeRef,
                {
                    user,
                    userId: user.uid,
                    statementId,
                    token,
                    notification: true,
                    lastUpdate: Timestamp.now().toMillis(),
                    statementsSubscribeId,
                    statement,
                },
                { merge: true }
            );
        } else {
            //update subscription
            const statementSubscription =
                statementSubscriptionDB.data() as StatementSubscription;

            let { notification } = statementSubscription;
            notification = !notification;

            await setDoc(
                statementsSubscribeRef,
                { token, notification },
                { merge: true }
            );
        }
    } catch (error) {
        console.error(error);
    }
}
