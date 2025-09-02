import { FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { Statement, StatementType, QuestionType, Role } from 'delib-npm';
import { statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import useStatementColor from '@/controllers/hooks/useStatementColor';
import BackIcon from '@/assets/icons/chevronLeftIcon.svg?react';

interface Props {
	statement: Statement | undefined;
}

const MySuggestionsHeader: FC<Props> = ({ statement }) => {
	const navigate = useNavigate();
	const { statementId } = useParams<{ statementId: string }>();
	const { dir } = useUserConfig();
	const subscription = useSelector(statementSubscriptionSelector(statementId));
	const headerStyle = useStatementColor({ statement });

	const handleBackToStatement = () => {
		if (!statement || !statementId) {
			navigate(`/statement/${statementId}`, { replace: true });

			return;
		}
		
		const isMassConsensus = statement.statementType === StatementType.question && 
			statement.questionSettings?.questionType === QuestionType.massConsensus;
		const isAdmin = subscription?.role === Role.admin;

		if (isMassConsensus && !isAdmin) {
			navigate(`/mass-consensus/${statementId}/introduction`, { replace: true });
		} else {
			navigate(`/statement/${statementId}`, { replace: true });
		}
	};

	return (
		<nav
			className="app-header app-header--sticky app-header--shadow"
			dir={dir}
			style={{ backgroundColor: headerStyle.backgroundColor }}
		>
			<div className="app-header-wrapper" style={{ justifyContent: 'space-between' }}>
				<button 
					className="app-header-back-button"
					onClick={handleBackToStatement}
					aria-label="Back to statement"
				>
					<BackIcon className="back-arrow-icon" />
				</button>
				
				<div className="app-header-title">
					<span>My Suggestions</span>
				</div>
				
				<div className="app-header-spacer" />
			</div>
		</nav>
	);
};

export default MySuggestionsHeader;