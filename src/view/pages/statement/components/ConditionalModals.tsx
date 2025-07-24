import React from 'react';
import { useDispatch } from 'react-redux';
import Modal from '@/view/components/modal/Modal';
import NewStatement from './newStatement/NewStatement';
import UserDataQuestions from './userDataQuestions/UserDataQuestions';
import { setShowNewStatementModal } from '@/redux/statements/newStatementSlice';
import { UserQuestion } from 'delib-npm';

interface ConditionalModalsProps {
	showNewStatement: boolean;
	showUserQuestions: boolean;
	userDataQuestions: UserQuestion[] | null;
	screen?: string;
	isMassConsensus: boolean;
}

export const ConditionalModals: React.FC<ConditionalModalsProps> = ({
	showNewStatement,
	showUserQuestions,
	userDataQuestions,
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
				userDataQuestions && (
					<Modal>
						<UserDataQuestions questions={userDataQuestions} />
					</Modal>
				)}
		</>
	);
};
