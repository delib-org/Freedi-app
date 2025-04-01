import { Link, useParams } from 'react-router';
import { LoginType, MassConsensusPageUrls } from 'delib-npm';
import styles from './FooterMassConsensus.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { nextStep } from '../MassConsensusVM';
import { useSelector } from 'react-redux';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { massConsensusStepsSelector } from '@/redux/massConsensus/massConsensusSlice';
import { useState } from 'react';

const FooterMassConsensus = ({
	isIntro,
	isNextActive,
	isFeedback,
	onNext,
}: {
	isIntro?: boolean;
	isNextActive?: boolean;
	isFeedback?: boolean;
	onNext?: () => void;
}) => {
	const { statementId } = useParams<{ statementId: string }>();
	const { t, dir } = useUserConfig();
	const { user } = useAuthentication()
	const loginType = user?.isAnonymous ? LoginType.anonymous : LoginType.google;
	const steps = useSelector(massConsensusStepsSelector(statementId, loginType));
	console.log(steps);
	const goTo = nextStep(statementId, steps);

	const [isButtonClicked, setIsButtonClicked] = useState(false);

	const handleClick = (callback?: () => void) => {
		setIsButtonClicked(true);
		if (callback) callback();
	};

	const renderButton = () => {
		if (isIntro) {
			return (
				<Link to={`/mass-consensus/${statementId}/${goTo}`}>
					<button
						className='btn btn--massConsensus btn--primary'
						onClick={() => handleClick()}
						disabled={isButtonClicked}
					>
						{isFeedback ? t('Send') : t('Start')}
					</button>
				</Link>
			);
		}

		if (isFeedback) {
			return (
				<>
					<Link to={`/mass-consensus/${statementId}/${goTo}`}>
						<button
							className='btn btn--massConsensus btn--secondary'
							disabled={isButtonClicked}
						>
							{t('Skip')}
						</button>
					</Link>
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
				<Link to={`/mass-consensus/${statementId}/${goTo}`}>
					<button
						className='btn btn--massConsensus btn--secondary'
						disabled={isButtonClicked}
					>
						{t('Skip')}
					</button>
				</Link>
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
