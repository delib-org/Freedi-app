import React from 'react';
import SendIcon from '@/assets/icons/send-icon-pointing-up-and-right.svg?react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import Button from '@/view/components/buttons/button/Button';

interface StepThreeViewSimilarStatementProps {
	viewSimilarStatement: { title: string; description: string };
	setCurrentStep: React.Dispatch<React.SetStateAction<number>>;
	setShowModal: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function StepThreeViewSimilarStatement({
	viewSimilarStatement,
	setCurrentStep,
	setShowModal,
}: Readonly<StepThreeViewSimilarStatementProps>) {
	const { t } = useUserConfig();
	const handleSimilarStatementChosen = () => {
		setShowModal(false);
	};

	return (
		<>
			<h4 className='alertText'>
				{t('Would you like to choose this suggestion')}?...
			</h4>
			<p className='similarities__statementsBox__statementTitle'>
				{viewSimilarStatement.title}
			</p>
			<p className='similarities__statementsBox__statementDescription'>
				{viewSimilarStatement.description}
			</p>
			<div className='twoButtonBox'>
				<button
					className='twoButtonBox__backButton'
					onClick={() => setCurrentStep((prev) => prev - 1)}
				>
					{t('Back')}
				</button>
				<Button
					icon={<SendIcon />}
					text={t('Continue with this suggestion')}
					onClick={handleSimilarStatementChosen}
				/>
			</div>
		</>
	);
}
