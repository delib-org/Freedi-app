import React, { useCallback, useState } from 'react';
import { Statement, UserDemographicQuestion, Role } from '@freedi/shared-types';
import StatementHeader from './header/StatementHeader';
import Switch from './switch/Switch';
import { MapProvider } from '@/controllers/hooks/useMap';
import { ConditionalModals } from './ConditionalModals';
import useSlideAndSubStatement from '@/controllers/hooks/useSlideAndSubStatement';
import FollowMeToast from './followMeToast/FollowMeToast';
import { TreeFilterProvider } from './treeView/TreeFilterContext';
import styles from './StatementContent.module.scss';

interface StatementContentProps {
	statement: Statement | null;
	topParentStatement: Statement | null;
	showNewStatement: boolean;
	showUserQuestions: boolean;
	userDemographicQuestions: UserDemographicQuestion[] | null;
	screen?: string;
	isMassConsensus: boolean;
	role: Role | undefined;
}

export const StatementContent: React.FC<StatementContentProps> = ({
	statement,
	topParentStatement,
	showNewStatement,
	showUserQuestions,
	userDemographicQuestions,
	screen,
	isMassConsensus,
	role,
}) => {
	const { toSlide, slideInOrOut } = useSlideAndSubStatement(
		statement?.parentId,
		statement?.statementId,
	);

	const [activeView, setActiveView] = useState('chat');

	const handleActiveViewChange = useCallback((view: string) => {
		setActiveView(view);
	}, []);

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
				role={role}
			/>

			{/* Scrim + disabled interaction when mandatory survey is showing */}
			<TreeFilterProvider>
				<div className={styles.contentRoot}>
					<div
						className={`${styles.content} ${isSurveyMandatory ? styles['content--locked'] : ''}`}
						aria-hidden={isSurveyMandatory || undefined}
					>
						<StatementHeader
							topParentStatement={topParentStatement ?? undefined}
							onActiveViewChange={handleActiveViewChange}
						/>

						<MapProvider>
							<Switch activeView={activeView} />
						</MapProvider>
					</div>
					{isSurveyMandatory && <div className={styles.content__scrim} aria-hidden="true" />}
				</div>
			</TreeFilterProvider>
		</div>
	);
};
