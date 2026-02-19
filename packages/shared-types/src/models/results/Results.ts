import { Statement } from '../statement/StatementTypes';

// Re-export everything from ResultsSettings for backward compatibility
export {
	ResultsBy,
	CutoffBy,
	ResultsSettingsSchema,
	defaultResultsSettings,
} from './ResultsSettings';
export type { ResultsSettings } from './ResultsSettings';

export type Results = {
	top: Statement;
	sub: Results[];
};
