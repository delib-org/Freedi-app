/**
 * Utility functions for managing panel states
 */

const CHAT_PANEL_KEY = 'freedi-chat-panel-open';
const SUBQUESTIONS_MAP_KEY = 'freedi-subquestions-map-open';

/**
 * Closes both the chat panel and subquestions map by updating localStorage
 * and dispatching a custom event to notify the panels
 */
export function closePanels(): void {
	if (typeof window === 'undefined') return;

	// Update localStorage for both panels
	localStorage.setItem(CHAT_PANEL_KEY, 'false');
	localStorage.setItem(SUBQUESTIONS_MAP_KEY, 'false');

	// Dispatch custom event to notify panels of the change
	window.dispatchEvent(new CustomEvent('panelsClose'));
}
