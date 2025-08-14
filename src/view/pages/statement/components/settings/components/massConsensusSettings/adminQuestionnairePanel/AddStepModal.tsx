import React, { useState } from 'react';
import { MassConsensusPageUrls, MassConsensusStep } from 'delib-npm';
import Button from '@/view/components/buttons/button/Button';
import styles from './AddStepModal.module.scss';
import CloseIcon from '@/assets/icons/close.svg?react';

interface Props {
	questionId: string;
	statementId: string;
	onClose: () => void;
	onConfirm: (step: MassConsensusStep) => void;
}

const AddStepModal: React.FC<Props> = ({ questionId, statementId, onClose, onConfirm }) => {
	const [selectedStep, setSelectedStep] = useState<MassConsensusPageUrls | ''>('');
	const [customText, setCustomText] = useState('');

	const stepOptions = [
		{ value: MassConsensusPageUrls.introduction, label: 'Introduction' },
		{ value: MassConsensusPageUrls.userDemographics, label: 'User Demographics' },
		{ value: MassConsensusPageUrls.initialQuestion, label: 'Initial Question' },
		{ value: MassConsensusPageUrls.question, label: 'Question' },
		{ value: MassConsensusPageUrls.randomSuggestions, label: 'Random Suggestions' },
		{ value: MassConsensusPageUrls.topSuggestions, label: 'Top Suggestions' },
		{ value: MassConsensusPageUrls.voting, label: 'Voting' },
		{ value: MassConsensusPageUrls.leaveFeedback, label: 'Leave Feedback' },
		{ value: MassConsensusPageUrls.thankYou, label: 'Thank You' },
	];

	const handleConfirm = () => {
		if (!selectedStep) return;

		const newStep: MassConsensusStep = {
			screen: selectedStep as MassConsensusPageUrls,
			text: customText,
			statementId: statementId,
		};

		onConfirm(newStep);
	};

	return (
		<div className={styles.modalOverlay} onClick={onClose}>
			<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
				<div className={styles.header}>
					<h3>Add New Step</h3>
					<button className={styles.closeBtn} onClick={onClose}>
						<CloseIcon />
					</button>
				</div>

				<div className={styles.content}>
					<div className={styles.field}>
						<label htmlFor="stepType">Step Type</label>
						<select
							id="stepType"
							value={selectedStep}
							onChange={(e) => setSelectedStep(e.target.value as MassConsensusPageUrls)}
							className={styles.select}
						>
							<option value="">Select a step type...</option>
							{stepOptions.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</select>
					</div>

					<div className={styles.field}>
						<label htmlFor="customText">Custom Text (Optional)</label>
						<input
							id="customText"
							type="text"
							value={customText}
							onChange={(e) => setCustomText(e.target.value)}
							placeholder="Enter custom text for this step..."
							className={styles.input}
						/>
					</div>
				</div>

				<div className={styles.footer}>
					<Button
						text="Cancel"
						onClick={onClose}
						className={styles.cancelBtn}
					/>
					<Button
						text="Add Step"
						onClick={handleConfirm}
						disabled={!selectedStep}
						className={styles.confirmBtn}
					/>
				</div>
			</div>
		</div>
	);
};

export default AddStepModal;