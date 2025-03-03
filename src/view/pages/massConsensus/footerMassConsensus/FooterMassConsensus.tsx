import { Link, useParams } from 'react-router';
import { useParamsLanguage } from '../useParamsLang/UseParamsLanguge';
import { MassConsensusPageUrls } from '@/types/TypeEnums';
import styles from './FooterMassConsensus.module.scss';
import { useLanguage } from '@/controllers/hooks/useLanguages';

const FooterMassConsensus = ({ goTo, isIntro, isNextActive, isFeedback, onNext }: { goTo?: MassConsensusPageUrls, isIntro?: boolean, isNextActive?: boolean, isFeedback?: boolean, onNext?:()=> void }) => {
	const { statementId } = useParams<{ statementId: string }>();
	const { lang } = useParamsLanguage();
	const { t } = useLanguage();

	return (
		<div className={styles.footerMC}>
			{isIntro? 
			<Link to={`/mass-consensus/${statementId}/${goTo}?lang=${lang}`}>
				<button className="btn btn--large btn--primary">{isFeedback? t('Send'): t('Start')}</button>
			</Link>
			:isFeedback? 
			<button
				className={`btn btn--large btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
				onClick={onNext}
			>
				{t('Send')}
			</button>
			:
			<>
				<button
					className={`btn btn--large btn--primary ${!isNextActive ? 'btn--disabled' : ''}`}
					onClick={onNext}
				>
					{t('Next')}
				</button>
				<Link to={`/mass-consensus/${statementId}/${goTo}?lang=${lang}`}>
					<button className="btn btn--large btn--secondary">{t('Skip')}</button>
				</Link>
			</>
			}
		</div>
	)
}

export default FooterMassConsensus
