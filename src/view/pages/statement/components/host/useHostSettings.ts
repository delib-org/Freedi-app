import { Statement, StatementSettings } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { useStatementSettingsHandlers } from '../settings/useStatementSettingsHandlers';
import { defaultStatementSettings } from '../settings/emptyStatementModel';

/**
 * The live statement, its settings and the instant-save handlers — so a hub
 * section's toggles reflect Firestore writes as soon as the listener fires.
 */
export function useHostSettings(statement: Statement) {
	const live = useAppSelector(statementSelector(statement.statementId));
	const current = live ?? statement;
	const settings: StatementSettings = current.statementSettings ?? defaultStatementSettings;
	const handlers = useStatementSettingsHandlers(current);

	return { statement: current, settings, handlers };
}
