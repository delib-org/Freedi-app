import {
	collection,
	doc,
	onSnapshot,
	query,
	where,
	Unsubscribe,
	orderBy,
	limit,
} from 'firebase/firestore';
import { FireStore } from '@/controllers/db/config';
import { Collections, Statement } from '@freedi/shared-types';
import { store } from '@/redux/store';
import { setStatement } from '@/redux/statements/statementsSlice';
import { normalizeStatementData } from '@/helpers/timestampHelpers';

interface ActiveListener {
	unsubscribe: Unsubscribe;
	statementId: string;
	lastAccessed: number;
}

class SubscriptionManager {
	private activeListeners: Map<string, ActiveListener> = new Map();
	private maxListeners = 50; // Limit concurrent listeners
	private listenerTimeout = 5 * 60 * 1000; // 5 minutes

	/**
	 * Start listening to a statement and its sub-statements
	 */
	public listenToStatement(statementId: string): Unsubscribe {
		// Check if already listening
		if (this.activeListeners.has(statementId)) {
			const listener = this.activeListeners.get(statementId)!;
			listener.lastAccessed = Date.now();

			return listener.unsubscribe;
		}

		// Clean up old listeners if at capacity
		if (this.activeListeners.size >= this.maxListeners) {
			this.cleanupOldListeners();
		}

		// Listen to the main statement
		const statementRef = doc(FireStore, Collections.statements, statementId);
		const unsubscribeStatement = onSnapshot(statementRef, (snapshot) => {
			if (snapshot.exists()) {
				const statement = normalizeStatementData(snapshot.data()) as Statement;
				store.dispatch(setStatement(statement));
			}
		});

		// Listen to sub-statements
		const subStatementsQuery = query(
			collection(FireStore, Collections.statements),
			where('parentId', '==', statementId),
			orderBy('createdAt', 'desc'),
			limit(20),
		);

		const unsubscribeSubStatements = onSnapshot(subStatementsQuery, (snapshot) => {
			snapshot.docChanges().forEach((change) => {
				const statement = normalizeStatementData(change.doc.data()) as Statement;

				if (change.type === 'added' || change.type === 'modified') {
					store.dispatch(setStatement(statement));
				}
			});
		});

		// Combine unsubscribe functions
		const unsubscribe = () => {
			unsubscribeStatement();
			unsubscribeSubStatements();
			this.activeListeners.delete(statementId);
		};

		// Store the listener
		this.activeListeners.set(statementId, {
			unsubscribe,
			statementId,
			lastAccessed: Date.now(),
		});

		return unsubscribe;
	}

	/**
	 * Stop listening to a statement
	 */
	public stopListening(statementId: string): void {
		const listener = this.activeListeners.get(statementId);
		if (listener) {
			listener.unsubscribe();
			this.activeListeners.delete(statementId);
		}
	}

	/**
	 * Clean up listeners that haven't been accessed recently
	 */
	private cleanupOldListeners(): void {
		const now = Date.now();
		const toRemove: string[] = [];

		this.activeListeners.forEach((listener, statementId) => {
			if (now - listener.lastAccessed > this.listenerTimeout) {
				toRemove.push(statementId);
			}
		});

		// Remove oldest listeners if still over capacity
		if (toRemove.length === 0 && this.activeListeners.size >= this.maxListeners) {
			const sorted = Array.from(this.activeListeners.entries()).sort(
				(a, b) => a[1].lastAccessed - b[1].lastAccessed,
			);
			toRemove.push(sorted[0][0]);
		}

		toRemove.forEach((statementId) => this.stopListening(statementId));
	}

	/**
	 * Clean up all listeners
	 */
	public cleanup(): void {
		this.activeListeners.forEach((listener) => listener.unsubscribe());
		this.activeListeners.clear();
	}
}

export const subscriptionManager = new SubscriptionManager();
