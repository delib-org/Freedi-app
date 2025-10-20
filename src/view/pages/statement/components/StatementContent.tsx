import React from 'react';
import { Statement, UserDemographicQuestion } from 'delib-npm';
import StatementHeader from './header/StatementHeader';
import Switch from './switch/Switch';
import { MapProvider } from '@/controllers/hooks/useMap';
import { ConditionalModals } from './ConditionalModals';
import useSlideAndSubStatement from '@/controllers/hooks/useSlideAndSubStatement';
import FollowMeToast from './followMeToast/FollowMeToast';

interface StatementContentProps {
	statement: Statement | null;
	topParentStatement: Statement | null;
	showNewStatement: boolean;
	showUserQuestions: boolean;
	userDemographicQuestions: UserDemographicQuestion[] | null;
	screen?: string;
	isMassConsensus: boolean;
}

export const StatementContent: React.FC<StatementContentProps> = ({
	statement,
	topParentStatement,
	showNewStatement,
	showUserQuestions,
	userDemographicQuestions,
	screen,
	isMassConsensus,
}) => {
	const { toSlide, slideInOrOut } = useSlideAndSubStatement(statement?.parentId, statement?.statementId);
	
	// Apply animation class when navigating between statements
	const pageClassName = toSlide ? `page ${slideInOrOut}` : 'page';

	// Check if survey is mandatory and not completed
	const isSurveyMandatory = showUserQuestions && screen !== 'settings' && !isMassConsensus;

	return (
		<div className={pageClassName}>
			<FollowMeToast />

			<ConditionalModals
				showNewStatement={showNewStatement}
				showUserQuestions={showUserQuestions}
				userDemographicQuestions={userDemographicQuestions}
				screen={screen}
				isMassConsensus={isMassConsensus}
			/>

			{/* Apply blur and disable interaction when mandatory survey is showing */}
			<div style={{
				filter: isSurveyMandatory ? 'blur(3px)' : 'none',
				pointerEvents: isSurveyMandatory ? 'none' : 'auto',
				opacity: isSurveyMandatory ? 0.5 : 1,
				transition: 'all 0.3s ease'
			}}>
				<StatementHeader
					statement={statement}
					parentStatement={undefined}
					topParentStatement={topParentStatement}
				/>

				<MapProvider>
					<Switch />
				</MapProvider>
			</div>
		</div>
	);
};
