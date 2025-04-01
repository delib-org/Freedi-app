import { Link, useParams } from 'react-router';
import { MassConsensusPageUrls } from 'delib-npm';
import styles from './FooterMassConsensus.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useState } from 'react';

const FooterMassConsensus = ({
	goTo,
	isIntro,
	isNextActive,
	isFeedback,
	onNext,
}: {
	goTo?: MassConsensusPageUrls;
	isIntro?: boolean;
	isNextActive?: boolean;
	isFeedback?: boolean;
	onNext?: () => void;
}) => {
	const { statementId } = useParams<{ statementId: string }>();
	const { t, dir } = useUserConfig();

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
