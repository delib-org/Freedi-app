// Re-exports for backward compatibility
// This file serves as a barrel export to maintain existing import paths.

// Authorization functions
export { isAuthorized, isAdmin, isChatMessage, isMassConsensus } from './authorization';

// String/display formatting
export {
	getInitials,
	getFirstName,
	truncateString,
	getTime,
	getNumberDigits,
	calculateFontSize,
	emojiTransformer,
} from './formatting';

// Statement-specific display helpers
export {
	statementTitleToDisplay,
	getTitle,
	getDescription,
	getSetTimerId,
	getRoomTimerId,
	getStatementSubscriptionId,
	getLatestUpdateStatements,
} from './statementDisplay';

// Color utilities
export { getRandomColor, generateRandomLightColor, getPastelColor } from './colors';

// Type restriction logic
export {
	TYPE_RESTRICTIONS,
	isStatementTypeAllowedAsChildren,
	validateStatementTypeHierarchy,
} from './typeHierarchy';

// Misc utilities
export {
	isProduction,
	handleCloseInviteModal,
	getLastElements,
	findClosestEvaluation,
} from './miscUtils';

// Re-export APIEndPoint from separate file to avoid circular dependencies
export { APIEndPoint } from './apiEndpoint';
