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

			<StatementHeader
				statement={statement}
				parentStatement={undefined}
				topParentStatement={topParentStatement}
			/>

			<MapProvider>
				<Switch />
			</MapProvider>
		</div>
	);
};
