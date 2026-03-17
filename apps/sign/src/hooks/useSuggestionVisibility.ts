'use client';

import { useState, useEffect, useCallback } from 'react';
import { collection, query, where, Unsubscribe } from 'firebase/firestore';
import { getFirebaseFirestore } from '@/lib/firebase/client';
import { safeQuerySnapshot } from '@/lib/firebase/safeSnapshot';
import { Collections, StatementType, Statement } from '@freedi/shared-types';
import { API_ROUTES } from '@/constants/common';
import { logError } from '@/lib/utils/errorHandling';

/**
 * Hook for admin suggestion visibility management.
 * Tracks whether hidden suggestions exist and provides methods to show/hide.
 */
export function useSuggestionVisibility(paragraphId: string, documentId: string) {
	const [hasHiddenSuggestions, setHasHiddenSuggestions] = useState(false);

	// Listen for hidden suggestions count (admin needs to know if any are hidden)
	useEffect(() => {
		if (!paragraphId) return;

		let unsubscribe: Unsubscribe | null = null;

		try {
			const firestore = getFirebaseFirestore();

			const q = query(
				collection(firestore, Collections.statements),
				where('parentId', '==', paragraphId),
				where('statementType', '==', StatementType.option),
				where('hide', '==', true)
			);

			unsubscribe = safeQuerySnapshot(
				q,
				(snapshot) => {
					// Check if any non-promoted hidden suggestions exist
					let hiddenCount = 0;
					snapshot.forEach((docSnap) => {
						const statement = docSnap.data() as Statement;
						if (!statement.versionControl?.promotedToVersion && !statement.versionControl?.forVersion) {
							hiddenCount++;
						}
					});
					setHasHiddenSuggestions(hiddenCount > 0);
				},
				(error) => {
					logError(error, {
						operation: 'hooks.useSuggestionVisibility',
						metadata: { paragraphId },
					});
				}
			);
		} catch (error) {
			logError(error, {
				operation: 'hooks.useSuggestionVisibility.setup',
				metadata: { paragraphId },
			});
		}

		return () => {
			if (unsubscribe) {
				unsubscribe();
			}
		};
	}, [paragraphId]);

	// Hide all unselected suggestions (show only selected)
	const showOnlySelected = useCallback(async (selectedIds: Set<string>): Promise<boolean> => {
		try {
			const response = await fetch(API_ROUTES.ADMIN_SUGGESTION_VISIBILITY, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					paragraphId,
					documentId,
					visibleSuggestionIds: Array.from(selectedIds),
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to update visibility');
			}

			return true;
		} catch (error) {
			logError(error, {
				operation: 'useSuggestionVisibility.showOnlySelected',
				metadata: { paragraphId, selectedCount: selectedIds.size },
			});

			return false;
		}
	}, [paragraphId, documentId]);

	// Unhide all suggestions
	const showAll = useCallback(async (): Promise<boolean> => {
		try {
			const response = await fetch(API_ROUTES.ADMIN_SUGGESTION_VISIBILITY, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					paragraphId,
					documentId,
					visibleSuggestionIds: [],
				}),
			});

			if (!response.ok) {
				const data = await response.json();
				throw new Error(data.error || 'Failed to show all suggestions');
			}

			return true;
		} catch (error) {
			logError(error, {
				operation: 'useSuggestionVisibility.showAll',
				metadata: { paragraphId },
			});

			return false;
		}
	}, [paragraphId, documentId]);

	return { hasHiddenSuggestions, showOnlySelected, showAll };
}
