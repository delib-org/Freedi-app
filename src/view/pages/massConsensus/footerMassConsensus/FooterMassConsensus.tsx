import { Link, useParams } from 'react-router';
import { MassConsensusPageUrls } from 'delib-npm';
import styles from './FooterMassConsensus.module.scss';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';

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

	return (
		<div
			className={styles.footerMC}
			style={{ direction: dir === 'ltr' ? 'rtl' : 'ltr' }}
		
		>
			{isIntro ? (
				<Link to={`/mass-consensus/${statementId}/${goTo}`}>
					<button className='btn btn--massConsensus btn--primary'>
						{isFeedback ? t('Send') : t('Start')}
					</button>
				</Link>
			) : isFeedback ? (
				<button
					className={`btn btn--massConsensus btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
					onClick={onNext}
				>
					{t('Send')}
				</button>
			) : (
				<>
					<button
						className={`btn btn--massConsensus btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
						onClick={onNext}
					>
						{t('Next')}
					</button>
					<Link to={`/mass-consensus/${statementId}/${goTo}`}>
						<button className='btn btn--massConsensus btn--secondary'>
							{t('Skip')}
						</button>
					</Link>
				</>
			)}
		</div>
	);
};

export default FooterMassConsensus;
