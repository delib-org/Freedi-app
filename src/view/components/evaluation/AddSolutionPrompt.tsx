import React, { FC } from 'react';
import { useNavigate } from 'react-router';
import Modal from '@/view/components/modal/Modal';
import { Button } from '@/view/components/atomic/atoms/Button';
import { Card } from '@/view/components/atomic/molecules/Card';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { Statement } from '@freedi/shared-types';

interface AddSolutionPromptProps {
	show: boolean;
	onClose: () => void;
	statement: Statement;
}

const AddSolutionPrompt: FC<AddSolutionPromptProps> = ({ show, onClose, statement }) => {
	const { t } = useTranslation();
	const navigate = useNavigate();

	if (!show) return null;

	const handleAddSolution = () => {
		// Get the parent statement ID (the question)
		const questionId = statement.parentId || statement.statementId;

		// Navigate to the add new statement page
		navigate(`/statement/${questionId}/addOption`);
		onClose();
	};

	return (
		<Modal closeModal={onClose} title={t('Add Your Solution First')}>
			<Card
				variant="warning"
				title={t('Add Your Solution First')}
				footer={
					<div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
						<Button text={t('Cancel')} variant="secondary" onClick={onClose} />
						<Button text={t('Add Solution')} variant="primary" onClick={handleAddSolution} />
					</div>
				}
			>
				<p>{t('Please submit your own solution before evaluating others.')}</p>
				<p>{t('This helps ensure everyone contributes their ideas to the discussion.')}</p>
			</Card>
		</Modal>
	);
};

export default AddSolutionPrompt;
