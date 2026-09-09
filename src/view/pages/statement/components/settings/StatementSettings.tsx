import { FC, useEffect } from 'react';

// Third party imports
import { useParams } from 'react-router';

// Redux Store
import StatementSettingsForm from './components/statementSettingsForm/StatementSettingsForm';
import { useStatementSettingsData } from './useStatementSettingsData';
import { useTranslation } from '@/controllers/hooks/useTranslation';

// Hooks & Helpers

// Custom components
import Loader from '@/view/components/loaders/Loader';
import { uxAnalytics } from '@/services/analytics';
import MembersManagement from './components/membership/MembersManagement';
import BulkAddOptions from './components/BulkAddOptions/BulkAddOptions';

const StatementSettings: FC = () => {
	const { statementId } = useParams();
	const { t } = useTranslation();
	const { statementToEdit, setStatementToEdit, parentStatement } =
		useStatementSettingsData(statementId);
	const isLoading = false;

	useEffect(() => {
		if (statementId) uxAnalytics.hostHubOpened(statementId);
	}, [statementId]);

	return (
		<div className="test">
			{isLoading || !statementToEdit ? (
				<div className="center">
					<h2>{t('Updating')}</h2>
					<Loader />
				</div>
			) : (
				<>
					<StatementSettingsForm
						statement={statementToEdit}
						parentStatement={parentStatement}
						setStatementToEdit={setStatementToEdit}
					/>
					<MembersManagement statement={statementToEdit} />
					<BulkAddOptions statement={statementToEdit} />
				</>
			)}
		</div>
	);
};

export default StatementSettings;
