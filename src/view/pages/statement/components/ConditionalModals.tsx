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
					<Modal>
						<UserDemographicQuestions questions={userDemographicQuestions} />
					</Modal>
				)}
		</>
	);
};
