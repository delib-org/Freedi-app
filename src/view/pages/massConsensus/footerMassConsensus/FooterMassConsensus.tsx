import { useNavigate, useParams } from 'react-router';
import styles from './FooterMassConsensus.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { getStepNavigation, useMassConsensusSteps } from '../MassConsensusVM';

import { useState } from 'react';

const FooterMassConsensus = ({
	isIntro,
	isNextActive,
	isFeedback,
	onNext,
	onSkip,
	blockNavigation,
}: {
	isIntro?: boolean;
	isNextActive?: boolean;
	isFeedback?: boolean;
	onNext?: () => void;
	onSkip?: () => void;
	blockNavigation?: boolean;
}) => {
	const { statementId } = useParams<{ statementId: string }>();
	const navigate = useNavigate();
	const { t, dir } = useUserConfig();
	const { steps, currentStep } = useMassConsensusSteps();
	const { nextStep: goTo } = getStepNavigation(steps, currentStep);
	const [isButtonClicked, setIsButtonClicked] = useState(false);

	const handleClick = (callback?: () => void) => {
		if (!goTo) return;
		if (callback) callback();
		if (!blockNavigation) {
			setIsButtonClicked(true);
			navigate(`/mass-consensus/${statementId}/${goTo}`);
		}
	};
	const handleSkip = () => {
		if (!goTo) return;
		if (onSkip) onSkip();
		setIsButtonClicked(true);

		navigate(`/mass-consensus/${statementId}/${goTo}`);
	};
	const renderButton = () => {
		if (isIntro) {
			return (
				<button
					className='btn btn--massConsensus btn--primary'
					onClick={() => handleClick()}
					disabled={isButtonClicked}
				>
					{isFeedback ? t('Send') : t('Start')}
				</button>
			);
		}

		if (isFeedback) {
			return (
				<>
					<button
						className='btn btn--massConsensus btn--secondary'
						disabled={isButtonClicked}
						onClick={() => handleSkip()}
					>
						{t('Skip')}
					</button>

					<button
						className={`btn btn--massConsensus btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
						onClick={() => handleClick(onNext)}
						disabled={isButtonClicked || !isNextActive}
					>
						{t('Send')}
					</button>
				</>
			);
		}

		return (
			<>
				<button
					className='btn btn--massConsensus btn--secondary'
					disabled={isButtonClicked}
					onClick={() => handleSkip()}
				>
					{t('Skip')}
				</button>

				<button
					className={`btn btn--massConsensus btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
					onClick={() => handleClick(onNext)}
					disabled={isButtonClicked || !isNextActive}
				>
					{t('Next')}
				</button>
			</>
		);
	};

	return (
		<div
			className={styles.footerMC}
			style={{ direction: dir === 'ltr' ? 'rtl' : 'ltr' }}
		>
			{renderButton()}
		</div>
	);
};

export default FooterMassConsensus;
