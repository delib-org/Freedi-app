import { store } from "@/redux/store";
import {
  collection,
  deleteDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  Unsubscribe,
  where,
} from "firebase/firestore";
import { DB } from "../config";
import { Collections, NotificationType } from "delib-npm";
import { setInAppNotificationsAll } from "@/redux/notificationsSlice/notificationsSlice";
import {
  showSnackbar,
  hideSnackbar,
} from "@/redux/snackbarSlice/snackbarSlice";

let previousIds: Set<string> = new Set();

export function listenToInAppNotifications(): Unsubscribe {
  try {
    const user = store.getState().creator.creator;

    if (!user) throw new Error("User not found");

    const inAppNotificationsRef = collection(
      DB,
      Collections.inAppNotifications
    );
    const q = query(
      inAppNotificationsRef,
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(100)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        try {
          const notifications: NotificationType[] = [];
          let latest: NotificationType | null = null;

          snapshot.forEach((doc) => {
            const data = doc.data() as NotificationType;
            notifications.push(data);

            if (!previousIds.has(data.notificationId)) {
              latest = data;
            }
          });

          store.dispatch(setInAppNotificationsAll(notifications));
          previousIds = new Set(notifications.map((n) => n.notificationId));

          // ✅ Show snackbar for the most recent new one
          if (latest) {
            const statementType = latest.statementType as
              | "option"
              | "comment"
              | "question"
              | "group";
            const { text, statementId } = latest;

            const title =
              statementType === "option"
                ? "Vote ends in 30 minutes"
                : statementType === "comment"
                  ? "You have a new comment"
                  : "Your vote was recorded ✓";

            const type =
              statementType === "option"
                ? "alert"
                : statementType === "comment"
                  ? "info"
                  : "confirmation";

            store.dispatch(
              showSnackbar({
                type,
                title,
                content:
                  statementType === "comment" ? `${text}\n• Tap to read` : text,
                buttons:
                  statementType === "option"
                    ? [
                        {
                          label: "Vote",
                          action: () => {
                            window.location.href = `/statements/${statementId}`;
                            store.dispatch(hideSnackbar());
                          },
                        },
                        {
                          label: "Later",
                          action: () => store.dispatch(hideSnackbar()),
                        },
                      ]
                    : undefined,
              })
            );
          }
        } catch (error) {
          console.error("Error processing notifications snapshot:", error);
        }
      },
      (error) => {
        console.error("Error in notifications snapshot listener:", error);
      }
    );
  } catch (error) {
    console.error("In listenToInAppNotifications", error.message);

    return () => {
      return;
    };
  }
}

export async function clearInAppNotifications(statementId: string) {
  try {
    const user = store.getState().creator.creator;
    if (!user) throw new Error("User not found");

    const inAppNotificationsRef = collection(
      DB,
      Collections.inAppNotifications
    );
    const q = query(
      inAppNotificationsRef,
      where("parentId", "==", statementId),
      where("userId", "==", user.uid)
    );

    const snapshot = await getDocs(q);
    snapshot.forEach((ntf) => {
      deleteDoc(ntf.ref);
    });
  } catch (error) {
    console.error("In markInAppNotificationAsRead", error.message);
  }
}
