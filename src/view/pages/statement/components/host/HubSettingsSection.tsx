import { FC } from 'react';
import { Statement } from '@freedi/shared-types';
import StatementSettingsForm from '../settings/components/statementSettingsForm/StatementSettingsForm';

interface HubSettingsSectionProps {
	statement: Statement;
	parentStatement: Statement | 'top';
	setStatementToEdit: (statement: Statement) => void;
}

/** The full settings form, minus everything the other hub sections own. */
const HubSettingsSection: FC<HubSettingsSectionProps> = ({
	statement,
	parentStatement,
	setStatementToEdit,
}) => (
	<div data-testid="host-settings">
		<StatementSettingsForm
			statement={statement}
			parentStatement={parentStatement}
			setStatementToEdit={setStatementToEdit}
			variant="hub"
		/>
	</div>
);

export default HubSettingsSection;
