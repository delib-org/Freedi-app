import React from 'react';
import { Statement, UserQuestion } from 'delib-npm';
import StatementHeader from './header/StatementHeader';
import Switch from './switch/Switch';
import { MapProvider } from '@/controllers/hooks/useMap';
import { ConditionalModals } from './ConditionalModals';
import useSlideAndSubStatement from '@/controllers/hooks/useSlideAndSubStatement';

interface StatementContentProps {
	statement: Statement | null;
	topParentStatement: Statement | null;
	showNewStatement: boolean;
	showUserQuestions: boolean;
	userDataQuestions: UserQuestion[] | null;
	screen?: string;
	isMassConsensus: boolean;
}

export const StatementContent: React.FC<StatementContentProps> = ({
	statement,
	topParentStatement,
	showNewStatement,
	showUserQuestions,
	userDataQuestions,
	screen,
	isMassConsensus,
}) => {
	const { toSlide, slideInOrOut } = useSlideAndSubStatement(statement?.parentId, statement?.statementId);
	
	// Apply animation class when navigating between statements
	const pageClassName = toSlide ? `page ${slideInOrOut}` : 'page';
	
	return (
		<div className={pageClassName}>
			<ConditionalModals
				showNewStatement={showNewStatement}
				showUserQuestions={showUserQuestions}
				userDataQuestions={userDataQuestions}
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
