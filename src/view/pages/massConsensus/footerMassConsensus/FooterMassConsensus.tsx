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
	const { t, currentLanguage } = useUserConfig();

	return (
		<div className={styles.footerMC}>
			{isIntro ? (
				<Link
					to={`/mass-consensus/${statementId}/${goTo}?lang=${currentLanguage}`}
				>
					<button className='btn btn--large btn--primary'>
						{isFeedback ? t('Send') : t('Start')}
					</button>
				</Link>
			) : isFeedback ? (
				<button
					className={`btn btn--large btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
					onClick={onNext}
				>
					{t('Send')}
				</button>
			) : (
				<>
					<button
						className={`btn btn--large btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
						onClick={onNext}
					>
						{t('Next')}
					</button>
					<Link
						to={`/mass-consensus/${statementId}/${goTo}?lang=${currentLanguage}`}
					>
						<button className='btn btn--large btn--secondary'>
							{t('Skip')}
						</button>
					</Link>
				</>
			)}
		</div>
	);
};

export default FooterMassConsensus;
