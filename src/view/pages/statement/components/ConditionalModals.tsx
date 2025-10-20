import React from 'react';
import { useDispatch } from 'react-redux';
import Modal from '@/view/components/modal/Modal';
import NewStatement from './newStatement/NewStatement';
import UserDemographicQuestions from './userDemographicQuestions/UserDemographicQuestions';
import { setShowNewStatementModal } from '@/redux/statements/newStatementSlice';
import { UserDemographicQuestion } from 'delib-npm';

interface ConditionalModalsProps {
	showNewStatement: boolean;
	showUserQuestions: boolean;
	userDemographicQuestions: UserDemographicQuestion[] | null;
	screen?: string;
	isMassConsensus: boolean;
}

export const ConditionalModals: React.FC<ConditionalModalsProps> = ({
	showNewStatement,
	showUserQuestions,
	userDemographicQuestions,
	screen,
	isMassConsensus,
}) => {
	const dispatch = useDispatch();

	// Debug logging for survey modal conditions
	const shouldShowSurvey = showUserQuestions && screen !== 'settings' && !isMassConsensus && userDemographicQuestions;

	console.info('Survey modal conditions:', {
		showUserQuestions,
		screen,
		isMassConsensus,
		hasQuestions: !!userDemographicQuestions,
		questionsLength: userDemographicQuestions?.length || 0,
		shouldShowSurvey
	});

	return (
		<>
			{showNewStatement && (
				<Modal
					closeModal={(e) => {
						if (e.target === e.currentTarget) {
							dispatch(setShowNewStatementModal(false));
						}
					}}
				>
					<NewStatement />
				</Modal>
			)}

			{showUserQuestions &&
				screen !== 'settings' &&
				!isMassConsensus &&
				userDemographicQuestions && (
					<Modal
						// Don't pass closeModal to prevent closing the modal
						title="Survey Required"
					>
						<UserDemographicQuestions
							questions={userDemographicQuestions}
							isMandatory={true}
						/>
					</Modal>
				)}
		</>
	);
};
