/**
 * setStatements.ts - Re-exports from focused modules
 *
 * This file maintains backward compatibility by re-exporting all public APIs
 * from the split modules. New code should import from the specific modules directly.
 */
import { ResultsBy, CutoffBy, ResultsSettings } from '@freedi/shared-types';

// Shared constant used by multiple modules
export const resultsSettingsDefault: ResultsSettings = {
	resultsBy: ResultsBy.consensus,
	numberOfResults: 1,
	cutoffBy: CutoffBy.topOptions,
};

// Re-export from createStatement
export { createStatement } from './createStatement';
export type { CreateStatementProps } from './createStatement';

// Re-export from writeStatement
export { saveStatementToDB, setStatementToDB, updateStatementParents } from './writeStatement';

// Re-export from updateStatementFields
export {
	updateStatement,
	updateStatementText,
	updateStatementParagraphs,
	setStatementIsOption,
	updateIsQuestion,
	updateStatementMainImage,
	updateStatementImageDisplayMode,
	setStatementGroupToDB,
} from './updateStatementFields';

// Re-export from statementVisibility
export {
	toggleStatementHide,
	toggleStatementAnchored,
	setFollowMeDB,
	setPowerFollowMeDB,
} from './statementVisibility';

// Re-export from statementOrdering
export { updateStatementsOrderToDB, setRoomSizeInStatementDB } from './statementOrdering';
