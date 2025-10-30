import { collection, query, Unsubscribe, where, getDocs, limit, orderBy, startAfter, DocumentSnapshot, QueryConstraint } from "firebase/firestore";
import { DB, FireStore } from "../config";
import { Collections, WaitingMember, StatementSubscription, Role, StatementType } from "delib-npm";
import { store } from "@/redux/store";
import { removeWaitingMember, setWaitingMember } from "@/redux/subscriptions/subscriptionsSlice";
import { createManagedCollectionListener, generateListenerKey } from "@/controllers/utils/firestoreListenerHelpers";

/**
 * Check if the user has admin role in any statement
 * @param userId User ID to check
 * @returns Promise<boolean> indicating if user is admin anywhere
 */
export async function checkIfUserIsAdmin(userId: string): Promise<boolean> {
	try {
		const subscriptionsQuery = query(
			collection(DB, Collections.statementsSubscribe),
			where("userId", "==", userId),
			where("role", "==", "admin"),
			limit(1) // We only need to know if at least one exists
		);

		const snapshot = await getDocs(subscriptionsQuery);

		return !snapshot.empty;
	} catch (error) {
		const err = error as { code?: string };
		// Permission-denied is expected for non-admins, don't log as error
		if (err?.code === 'permission-denied') {
			return false; // User is not admin
		}
		console.error("Error checking admin status:", error);

		return false;
	}
}

/**
 * Listen to waiting members for approval
 * Only initializes if the user is an admin of at least one statement
 * @returns Unsubscribe function
 */
export function listenToWaitingForMembership(): Unsubscribe {
	try {
		const user = store.getState().creator.creator;
		const dispatch = store.dispatch;

		if (!user || !user.uid) {
			console.info("User not found in the store or missing uid");

			return () => {};
		}

		const listenerKey = generateListenerKey('waiting-members', 'user', user.uid);
		let unsubscribe: Unsubscribe | null = null;

		// Check if user is admin before setting up listener
		checkIfUserIsAdmin(user.uid)
			.then(isAdmin => {
				if (isAdmin) {
					const waitingList = collection(DB, Collections.awaitingUsers);
					// PHASE 3 FIX: Updated to use adminIds array instead of adminId
					const q = query(waitingList, where("adminIds", "array-contains", user.uid));

					// Use managed collection listener with document counting
					unsubscribe = createManagedCollectionListener(
						q,
						listenerKey,
						(waitingMembersDB) => {
							try {
								waitingMembersDB.docChanges().forEach((change) => {
									const subscription = change.doc.data() as WaitingMember;
									if (change.type === "added" || change.type === "modified") {
										dispatch(setWaitingMember(subscription));
									} else if (change.type === "removed") {
										dispatch(removeWaitingMember(subscription.statementsSubscribeId));
									}
								});
							} catch (error) {
								console.error("Error processing waiting members snapshot:", error);
							}
						},
						(error) => {
							console.error("Error in waiting members listener:", error);
						},
						'query'
					);
				}
				// Removed console.info to reduce noise - this is expected behavior for non-admins
			})
			.catch(() => {
				// Silently handle errors - user may not have permission to check admin status
				// This is expected for non-admin users
			});

		// Return a cleanup function
		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	} catch (error) {
		console.error("Error setting up waiting members listener:", error);

		return () => {};
	}
}

/**
 * Load more members with pagination support
 * @param statementId Statement ID to fetch members for
 * @param lastDoc Last document from previous fetch (for pagination)
 * @param pageSize Number of members to fetch (default: 20)
 * @param roleFilter Optional role filter (admin, member, banned)
 * @returns Promise with members array and last document
 */
export async function loadMoreMembers(
	statementId: string,
	lastDoc: DocumentSnapshot | null = null,
	pageSize: number = 20,
	roleFilter?: Role
): Promise<{ members: StatementSubscription[]; lastDoc: DocumentSnapshot | null; hasMore: boolean }> {
	try {
		const membersRef = collection(FireStore, Collections.statementsSubscribe);

		// Build query constraints
		const constraints: QueryConstraint[] = [
			where('statementId', '==', statementId),
			where('statement.statementType', '!=', StatementType.document),
			orderBy('statement.statementType', 'asc'), // Required for != operator
			orderBy('createdAt', 'desc')
		];

		// Add role filter if specified
		if (roleFilter) {
			constraints.push(where('role', '==', roleFilter));
		}

		// Add pagination if lastDoc provided
		if (lastDoc) {
			constraints.push(startAfter(lastDoc));
		}

		// Add limit (fetch one extra to check if there are more)
		constraints.push(limit(pageSize + 1));

		const q = query(membersRef, ...constraints);
		const snapshot = await getDocs(q);

		// Check if there are more results
		const hasMore = snapshot.docs.length > pageSize;

		// Get only the requested page size
		const docs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

		const members = docs.map(doc => doc.data() as StatementSubscription);
		const newLastDoc = docs.length > 0 ? docs[docs.length - 1] : null;

		return { members, lastDoc: newLastDoc, hasMore };
	} catch (error) {
		console.error('Error loading more members:', error);

		return { members: [], lastDoc: null, hasMore: false };
	}
}

/**
 * Get total count of members by role
 * @param statementId Statement ID
 * @param roleFilter Optional role filter
 * @returns Promise with count
 */
export async function getMembersCount(
	statementId: string,
	roleFilter?: Role
): Promise<number> {
	try {
		const membersRef = collection(FireStore, Collections.statementsSubscribe);

		const constraints: QueryConstraint[] = [
			where('statementId', '==', statementId),
			where('statement.statementType', '!=', StatementType.document),
			orderBy('statement.statementType', 'asc')
		];

		if (roleFilter) {
			constraints.push(where('role', '==', roleFilter));
		}

		const q = query(membersRef, ...constraints);
		const snapshot = await getDocs(q);

		return snapshot.size;
	} catch (error) {
		console.error('Error getting members count:', error);

		return 0;
	}
}
