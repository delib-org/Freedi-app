import { Link, useParams } from 'react-router';
import { LoginType, MassConsensusPageUrls } from 'delib-npm';
import styles from './FooterMassConsensus.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { nextStep } from '../MassConsensusVM';
import { useSelector } from 'react-redux';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { massConsensusStepsSelector } from '@/redux/massConsensus/massConsensusSlice';

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

	const renderButton = () => {
		if (isIntro) {
			return (
				<Link to={`/mass-consensus/${statementId}/${goTo}`}>
					<button className='btn btn--massConsensus btn--primary'>
						{isFeedback ? t('Send') : t('Start')}
					</button>
				</Link>
			);
		}

		if (isFeedback) {
			return (
				<>
					<Link to={`/mass-consensus/${statementId}/${goTo}`}>
						<button className='btn btn--massConsensus btn--secondary'>
							{t('Skip')}
						</button>
					</Link>
					<button
						className={`btn btn--massConsensus btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
						onClick={onNext}
					>
						{t('Send')}
					</button>
				</>
			);
		}

		return (
			<>
				<Link to={`/mass-consensus/${statementId}/${goTo}`}>
					<button className='btn btn--massConsensus btn--secondary'>
						{t('Skip')}
					</button>
				</Link>
				<button
					className={`btn btn--massConsensus btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
					onClick={onNext}
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
