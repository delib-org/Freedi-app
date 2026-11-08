import React from 'react';
import Modal from '@/view/components/modal/Modal';
import UserDemographicQuestions from './userDemographicQuestions/UserDemographicQuestions';
import { UserDemographicQuestion, Role } from '@freedi/shared-types';

interface ConditionalModalsProps {
	showNewStatement: boolean;
	showUserQuestions: boolean;
	userDemographicQuestions: UserDemographicQuestion[] | null;
	screen?: string;
	isMassConsensus: boolean;
	role: Role | undefined;
}

export const ConditionalModals: React.FC<ConditionalModalsProps> = ({
	showUserQuestions,
	userDemographicQuestions,
	screen,
	isMassConsensus,
	role,
}) => {
	return (
		<>
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
							role={role}
						/>
					</Modal>
				)}
		</>
	);
};
