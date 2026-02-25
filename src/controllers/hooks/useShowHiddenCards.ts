import { useState, useEffect, useCallback } from 'react';
import { STORAGE_KEYS } from '@/constants/common';
import { logError } from '@/utils/errorHandling';

const SHOW_HIDDEN_CARDS_KEY = STORAGE_KEYS.SHOW_HIDDEN_CARDS;

// Custom event name for cross-component synchronization
const SHOW_HIDDEN_CARDS_CHANGE_EVENT = 'showHiddenCardsChange';

export interface UseShowHiddenCardsReturn {
	showHiddenCards: boolean;
	toggleShowHiddenCards: () => void;
	setShowHiddenCards: (value: boolean) => void;
}

/**
 * Hook for managing the admin preference to show/hide hidden suggestion cards.
 * Persists the preference in localStorage and synchronizes across components.
 *
 * @returns Object containing showHiddenCards state and toggle/set functions
 */
export function useShowHiddenCards(): UseShowHiddenCardsReturn {
	// Initialize from localStorage, defaulting to true (show hidden cards)
	const [showHiddenCards, setShowHiddenCardsState] = useState<boolean>(() => {
		try {
			const stored = localStorage.getItem(SHOW_HIDDEN_CARDS_KEY);

			return stored !== null ? JSON.parse(stored) : true;
		} catch {
			return true;
		}
	});

	// Update localStorage and dispatch custom event when state changes
	const setShowHiddenCards = useCallback((value: boolean) => {
		setShowHiddenCardsState(value);
		try {
			localStorage.setItem(SHOW_HIDDEN_CARDS_KEY, JSON.stringify(value));
			// Dispatch custom event for other components to listen
			window.dispatchEvent(new CustomEvent(SHOW_HIDDEN_CARDS_CHANGE_EVENT, { detail: value }));
		} catch (error) {
			logError(error, {
				operation: 'hooks.useShowHiddenCards.setShowHiddenCards',
				metadata: { message: 'Failed to save showHiddenCards preference:' },
			});
		}
	}, []);

	// Toggle function for convenience
	const toggleShowHiddenCards = useCallback(() => {
		setShowHiddenCards(!showHiddenCards);
	}, [showHiddenCards, setShowHiddenCards]);

	// Listen for changes from other components
	useEffect(() => {
		const handleStorageChange = (event: CustomEvent<boolean>) => {
			setShowHiddenCardsState(event.detail);
		};

		window.addEventListener(SHOW_HIDDEN_CARDS_CHANGE_EVENT, handleStorageChange as EventListener);

		return () => {
			window.removeEventListener(
				SHOW_HIDDEN_CARDS_CHANGE_EVENT,
				handleStorageChange as EventListener,
			);
		};
	}, []);

	return {
		showHiddenCards,
		toggleShowHiddenCards,
		setShowHiddenCards,
	};
}
