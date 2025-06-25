import {
  Timestamp,
  doc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
} from "firebase/firestore";
import { FireStore } from "../config";
import { store } from "@/redux/store";
import { Collections, Creator, Online, OnlineSchema } from "delib-npm";
import { parse } from "valibot";

export async function setUserOnlineToDB(
  statementId: string,
  user: Creator
): Promise<string | undefined> {
  try {
    if (!statementId) throw new Error("Statement ID is undefined");
    if (!user) throw new Error("User is undefined");

    const onlineId = `${user.uid}_${statementId}`;

    const onlineUser: Online = {
      statementId,
      onlineId,
      user: {
        displayName: user.displayName,
        photoURL: user.photoURL || null,
        uid: user.uid,
        isAnonymous: user.isAnonymous || false,
        email: user.email || null,
        advanceUser: user.advanceUser || false,
      },
      // Use Timestamp.now().toMillis() to get a number that validates properly
      lastUpdated: Timestamp.now().toMillis(),
      tabInFocus: true,
    };

    // Validate with your schema
    parse(OnlineSchema, onlineUser);

    const onlineRef = doc(FireStore, Collections.online, onlineId);

    // Force write to server first, then local cache
    await setDoc(onlineRef, onlineUser, {
      merge: true,
      // This ensures the write goes to server first
    });

    return onlineId;
  } catch (error) {
    console.error("Error setting user online:", error);

    return undefined;
  }
}

export async function updateUserTabFocusToDB(
  statementId: string,
  userId: string,
  tabInFocus: boolean
): Promise<void> {
  try {
    if (!statementId) throw new Error("Statement ID is undefined");
    if (!userId) throw new Error("User ID is undefined");

    const onlineId = `${userId}_${statementId}`;
    const onlineUserRef = doc(FireStore, Collections.online, onlineId);

    // Use setDoc with merge to create or update
    await setDoc(
      onlineUserRef,
      {
        tabInFocus,
        lastUpdated: Timestamp.now().toMillis(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Error updating tab focus:", error);
  }
}

export async function updateUserHeartbeatToDB(
  statementId: string,
  userId: string
): Promise<void> {
  try {
    if (!statementId) throw new Error("Statement ID is undefined");
    if (!userId) throw new Error("User ID is undefined");

    const onlineId = `${userId}_${statementId}`;
    const onlineUserRef = doc(FireStore, Collections.online, onlineId);

    // Use setDoc with merge to create or update
    await setDoc(
      onlineUserRef,
      {
        lastUpdated: Timestamp.now().toMillis(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Error updating heartbeat:", error);
  }
}

export async function removeUserFromOnlineToDB(
  statementId: string,
  userId: string
): Promise<void> {
  try {
    if (!statementId) throw new Error("Statement ID is undefined");
    if (!userId) throw new Error("User ID is undefined");

    const onlineId = `${userId}_${statementId}`;

    const onlineUserRef = doc(FireStore, Collections.online, onlineId);
    await deleteDoc(onlineUserRef);
  } catch (error) {
    console.error("Error removing user from online:", error);
  }
}

export function subscribeToonlineByStatement(
  statementId: string,
  callback: (online: Online[]) => void
): () => void {
  try {
    if (!statementId) throw new Error("Statement ID is undefined");

    const q = query(
      collection(FireStore, Collections.online),
      where("statementId", "==", statementId)
    );

    const unsubscribe = onSnapshot(
      q,
      {
        // Include metadata to get local changes immediately
        includeMetadataChanges: true,
      },
      (snapshot) => {
        const online: Online[] = [];

        snapshot.forEach((doc) => {
          try {
            const data = doc.data();

            const validatedData = parse(OnlineSchema, data);
            online.push(validatedData);
          } catch (error) {
            console.error(
              "Error validating online user data:",
              error,
              doc.data()
            );
          }
        });

        callback(online);
      },
      (error) => {
        console.error("Error in online users subscription:", error);
        callback([]);
      }
    );

    return unsubscribe;
  } catch (error) {
    console.error("Error subscribing to online users:", error);

    return () => {}; // Return empty function if error
  }
}
export function subscribeToValidOnlineUsers(
  statementId: string,
  setOnlineUsers: (users: Online[]) => void,
  setIsLoading?: (loading: boolean) => void
): () => void {
  if (!statementId) return () => {};

  const q = query(
    collection(FireStore, Collections.online),
    where("statementId", "==", statementId)
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const users: Online[] = [];

    snapshot.forEach((doc) => {
      try {
        const data = doc.data();
        if (data.lastUpdated?.toMillis) {
          data.lastUpdated = data.lastUpdated.toMillis();
        }
        const validated = parse(OnlineSchema, data);
        users.push(validated);
      } catch (err) {
        console.error("Error validating online user data:", err);
      }
    });

    const now = Date.now();
    const validUsers = users.filter(
      (u) => typeof u.lastUpdated === "number" && now - u.lastUpdated < 60000
    );

    setOnlineUsers(validUsers);
    if (setIsLoading) setIsLoading(false);
  });

  return unsubscribe;
}

// Helper function to get current user from store
export function getCurrentUser(): Creator | undefined {
  try {
    const storeState = store.getState();

    // Add more defensive checks
    if (!storeState?.creator?.creator) {
      console.info("No creator found in store state");

      return undefined;
    }

    const creator: Creator = storeState.creator.creator;

    // Validate that we have essential user properties
    if (!creator.uid) {
      console.info("Creator missing uid");

      return undefined;
    }

    return creator;
  } catch (error) {
    console.error("Error getting current user:", error);

    return undefined;
  }
}
