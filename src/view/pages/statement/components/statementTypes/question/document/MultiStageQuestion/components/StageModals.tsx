import React, { FC } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import Modal from '@/view/components/modal/Modal';
import AddStage from '../../addStage/AddStage';
import NewStatement from '@/view/pages/statement/components/newStatement/NewStatement';
import {
	setShowNewStatementModal,
	selectNewStatementShowModal,
} from '@/redux/statements/newStatementSlice';

interface StageModalsProps {
	showAddStage: boolean;
	setShowAddStage: (show: boolean) => void;
}

export const StageModals: FC<StageModalsProps> = ({ showAddStage, setShowAddStage }) => {
	const dispatch = useDispatch();
	const showNewStatementModal = useSelector(selectNewStatementShowModal);

	return (
		<>
			{showAddStage && (
				<Modal>
					<AddStage setShowAddStage={setShowAddStage} />
				</Modal>
			)}
			{showNewStatementModal && (
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
		</>
	);
};
